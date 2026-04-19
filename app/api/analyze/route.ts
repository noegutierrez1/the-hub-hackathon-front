type AnalyzeProvider = "openai" | "gemini";

type AnalyzeRequestBody = {
  provider?: AnalyzeProvider | string;
  model?: string;
  apiKey?: string;
  openaiApiKey?: string;
  geminiApiKey?: string;
  prompt?: string;
  imageBase64?: string;
  mimeType?: string;
  responseMimeType?: string;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  error?: {
    message?: string;
  };
};

type OpenAIResponse = {
  choices?: Array<{
    message?: {
      content?:
        | string
        | Array<{
            type?: string;
            text?: string;
          }>;
    };
  }>;
  error?: {
    message?: string;
  };
};

type JsonPayload = Record<string, unknown>;

const FALLBACK_PROMPT =
  "Describe this image in detail. Include key objects, context, and any text visible in the image.";

const OPENAI_DEFAULT_MODEL = "gpt-5.4";
const GEMINI_DEFAULT_MODEL = "gemini-2.5-flash";

async function readJsonPayload(response: Response): Promise<{
  json: JsonPayload | null;
  rawText: string;
}> {
  const rawText = await response.text();
  if (!rawText.trim()) {
    return { json: null, rawText };
  }

  try {
    return {
      json: JSON.parse(rawText) as JsonPayload,
      rawText,
    };
  } catch {
    return {
      json: null,
      rawText,
    };
  }
}

function normalizeProvider(value: string | null | undefined): AnalyzeProvider | null {
  const normalized = (value || "").trim().toLowerCase();
  if (normalized === "openai") {
    return "openai";
  }
  if (normalized === "gemini") {
    return "gemini";
  }
  return null;
}

function resolveProvider(
  preferred: AnalyzeProvider | null,
  hasOpenAiKey: boolean,
  hasGeminiKey: boolean
): AnalyzeProvider | null {
  if (preferred === "openai") {
    return hasOpenAiKey ? "openai" : null;
  }

  if (preferred === "gemini") {
    return hasGeminiKey ? "gemini" : null;
  }

  // Default to OpenAI when configured; fallback to Gemini otherwise.
  if (hasOpenAiKey) {
    return "openai";
  }

  if (hasGeminiKey) {
    return "gemini";
  }

  return null;
}

async function analyzeWithGemini(input: {
  apiKey: string;
  prompt: string;
  imageBase64: string;
  mimeType: string;
  responseMimeType: string | undefined;
  model: string;
}) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      input.model
    )}:generateContent?key=${encodeURIComponent(input.apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: input.prompt },
              {
                inlineData: {
                  mimeType: input.mimeType,
                  data: input.imageBase64,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          ...(input.responseMimeType ? { responseMimeType: input.responseMimeType } : {}),
        },
      }),
    }
  );

  const { json, rawText } = await readJsonPayload(response);
  const payload = (json || {}) as GeminiResponse;

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: payload.error?.message || rawText.slice(0, 180) || "Gemini request failed.",
    };
  }

  const text =
    payload.candidates
      ?.flatMap((candidate) => candidate.content?.parts || [])
      .map((part) => part.text || "")
      .join("\n")
      .trim() || "No text returned by Gemini.";

  return {
    ok: true,
    status: 200,
    text,
  };
}

async function analyzeWithOpenAi(input: {
  apiKey: string;
  prompt: string;
  imageBase64: string;
  mimeType: string;
  responseMimeType: string | undefined;
  model: string;
}) {
  const requestBody: Record<string, unknown> = {
    model: input.model,
    temperature: 0.2,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: input.prompt },
          {
            type: "image_url",
            image_url: {
              url: `data:${input.mimeType};base64,${input.imageBase64}`,
            },
          },
        ],
      },
    ],
  };

  if (input.responseMimeType === "application/json") {
    requestBody.response_format = { type: "json_object" };
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  const { json, rawText } = await readJsonPayload(response);
  const payload = (json || {}) as OpenAIResponse;

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: payload.error?.message || rawText.slice(0, 180) || "OpenAI request failed.",
    };
  }

  const content = payload.choices?.[0]?.message?.content;
  const text =
    (typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content.map((part) => part.text || "").join("\n")
        : ""
    ).trim() || "No text returned by OpenAI.";

  return {
    ok: true,
    status: 200,
    text,
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AnalyzeRequestBody;

    const imageBase64 = body.imageBase64?.trim();
    const mimeType = body.mimeType?.trim() || "image/jpeg";
    const prompt = body.prompt?.trim() || FALLBACK_PROMPT;
    const responseMimeType = body.responseMimeType?.trim();

    if (!imageBase64) {
      return Response.json({ error: "Missing image data." }, { status: 400 });
    }

    const providerFromRequest = normalizeProvider(body.provider);
    const providerFromEnv = normalizeProvider(process.env.AI_PROVIDER);
    const preferredProvider = providerFromRequest || providerFromEnv;

    const openaiApiKey =
      body.openaiApiKey?.trim() ||
      (providerFromRequest === "openai" ? body.apiKey?.trim() : "") ||
      process.env.OPENAI_API_KEY?.trim() ||
      "";

    const geminiApiKey =
      body.geminiApiKey?.trim() ||
      (providerFromRequest === "gemini" ? body.apiKey?.trim() : "") ||
      process.env.GEMINI_API_KEY?.trim() ||
      process.env.GOOGLE_API_KEY?.trim() ||
      "";

    const provider = resolveProvider(
      preferredProvider,
      Boolean(openaiApiKey),
      Boolean(geminiApiKey)
    );

    if (!provider) {
      return Response.json(
        {
          error:
            "Missing API key. Set OPENAI_API_KEY (preferred) or GEMINI_API_KEY/GOOGLE_API_KEY, or pass provider-specific keys in the request.",
        },
        { status: 400 }
      );
    }

    if (provider === "openai") {
      const openaiModel =
        body.model?.trim() || process.env.OPENAI_VISION_MODEL?.trim() || OPENAI_DEFAULT_MODEL;

      const result = await analyzeWithOpenAi({
        apiKey: openaiApiKey,
        prompt,
        imageBase64,
        mimeType,
        responseMimeType,
        model: openaiModel,
      });

      if (!result.ok) {
        return Response.json({ error: result.error }, { status: result.status });
      }

      return Response.json({
        provider,
        model: openaiModel,
        text: result.text,
      });
    }

    const geminiModel =
      body.model?.trim() || process.env.GEMINI_MODEL?.trim() || GEMINI_DEFAULT_MODEL;

    const result = await analyzeWithGemini({
      apiKey: geminiApiKey,
      prompt,
      imageBase64,
      mimeType,
      responseMimeType,
      model: geminiModel,
    });

    if (!result.ok) {
      return Response.json({ error: result.error }, { status: result.status });
    }

    return Response.json({
      provider,
      model: geminiModel,
      text: result.text,
    });
  } catch {
    return Response.json(
      { error: "Invalid request payload or model response." },
      { status: 500 }
    );
  }
}