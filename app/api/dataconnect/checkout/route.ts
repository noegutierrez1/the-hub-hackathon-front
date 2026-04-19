import { executeDataConnect } from "@/lib/dataconnect";

type CheckoutItemInput = {
  name?: string;
  brand?: string;
  quantity?: number;
  category?: string;
  size?: string;
};

type CheckoutBody = {
  items?: CheckoutItemInput[];
};

type NormalizedCheckoutItem = {
  name: string;
  brand: string | null;
  quantity: number;
  category: string | null;
  size: string | null;
};

type InventoryItemRecord = {
  id: string;
  name: string;
  brand: string;
  quantity: number;
  category: string | null;
  size: string | null;
};

type PreparedCheckoutItem = NormalizedCheckoutItem & {
  nameNorm: string;
  brandNorm: string;
  sizeNorm: string;
  categoryNorm: string;
  nameTokens: string[];
};

type PreparedInventoryItem = InventoryItemRecord & {
  nameNorm: string;
  brandNorm: string;
  sizeNorm: string;
  categoryNorm: string;
  nameTokens: string[];
  remainingQuantity: number;
};

type InventoryLookup = {
  all: PreparedInventoryItem[];
  byName: Map<string, PreparedInventoryItem[]>;
  byBrandName: Map<string, PreparedInventoryItem[]>;
  byBrandNameSize: Map<string, PreparedInventoryItem[]>;
  byBrand: Map<string, PreparedInventoryItem[]>;
  byToken: Map<string, PreparedInventoryItem[]>;
};

type ScoredCandidate = {
  item: PreparedInventoryItem;
  percentage: number;
  exactName: boolean;
};

type UpdatedItemSummary = {
  id: string;
  name: string;
  brand: string;
  beforeQuantity: number;
  decrementedBy: number;
  afterQuantity: number;
};

const DEFAULT_CHECKOUT_LIST_QUERY = `
query CheckoutInventory {
  inventoryItems(limit: 500) {
    id
    name
    brand
    quantity
    category
    size
  }
}
`.trim();

const DEFAULT_CHECKOUT_UPDATE_MUTATION = `
mutation CheckoutDecrementInventory(
  $id: UUID
  $quantity: Int
  $updatedAt: Timestamp
) {
  inventoryItem_update(
    id: $id
    data: {
      quantity: $quantity
      updatedAt: $updatedAt
    }
  )
}
`.trim();

const STRICT_MATCH_PERCENTAGE = 62;

function normalizeText(value: string | null | undefined) {
  return (value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeNormalizedText(value: string) {
  if (!value) {
    return [] as string[];
  }

  return value
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function appendLookup(
  map: Map<string, PreparedInventoryItem[]>,
  key: string,
  row: PreparedInventoryItem
) {
  if (!key) {
    return;
  }

  const existing = map.get(key);
  if (existing) {
    existing.push(row);
    return;
  }

  map.set(key, [row]);
}

function prepareCheckoutItem(item: NormalizedCheckoutItem): PreparedCheckoutItem {
  const nameNorm = normalizeText(item.name);
  const brandNorm = normalizeText(item.brand);
  const sizeNorm = normalizeText(item.size);
  const categoryNorm = normalizeText(item.category);

  return {
    ...item,
    nameNorm,
    brandNorm,
    sizeNorm,
    categoryNorm,
    nameTokens: tokenizeNormalizedText(nameNorm),
  };
}

function prepareInventoryRows(inventory: InventoryItemRecord[]) {
  return inventory.map((item) => {
    const nameNorm = normalizeText(item.name);
    const brandNorm = normalizeText(item.brand);
    const sizeNorm = normalizeText(item.size);
    const categoryNorm = normalizeText(item.category);

    return {
      ...item,
      nameNorm,
      brandNorm,
      sizeNorm,
      categoryNorm,
      nameTokens: tokenizeNormalizedText(nameNorm),
      remainingQuantity: item.quantity,
    };
  });
}

function buildInventoryLookup(inventory: PreparedInventoryItem[]): InventoryLookup {
  const lookup: InventoryLookup = {
    all: inventory,
    byName: new Map(),
    byBrandName: new Map(),
    byBrandNameSize: new Map(),
    byBrand: new Map(),
    byToken: new Map(),
  };

  for (const row of inventory) {
    appendLookup(lookup.byName, row.nameNorm, row);
    appendLookup(lookup.byBrand, row.brandNorm, row);
    appendLookup(lookup.byBrandName, `${row.brandNorm}|${row.nameNorm}`, row);
    appendLookup(
      lookup.byBrandNameSize,
      `${row.brandNorm}|${row.nameNorm}|${row.sizeNorm}`,
      row
    );

    for (const token of row.nameTokens) {
      appendLookup(lookup.byToken, token, row);
    }
  }

  return lookup;
}

function collectCandidateRows(
  checkoutItem: PreparedCheckoutItem,
  lookup: InventoryLookup
) {
  const candidates = new Map<string, PreparedInventoryItem>();

  const includeRows = (rows: PreparedInventoryItem[] | undefined) => {
    if (!rows?.length) {
      return;
    }

    for (const row of rows) {
      if (row.remainingQuantity <= 0) {
        continue;
      }

      candidates.set(row.id, row);
    }
  };

  if (checkoutItem.brandNorm && checkoutItem.nameNorm && checkoutItem.sizeNorm) {
    includeRows(
      lookup.byBrandNameSize.get(
        `${checkoutItem.brandNorm}|${checkoutItem.nameNorm}|${checkoutItem.sizeNorm}`
      )
    );
  }

  if (checkoutItem.brandNorm && checkoutItem.nameNorm) {
    includeRows(lookup.byBrandName.get(`${checkoutItem.brandNorm}|${checkoutItem.nameNorm}`));
  }

  if (checkoutItem.nameNorm) {
    includeRows(lookup.byName.get(checkoutItem.nameNorm));
  }

  if (checkoutItem.brandNorm) {
    includeRows(lookup.byBrand.get(checkoutItem.brandNorm));
  }

  for (const token of checkoutItem.nameTokens) {
    includeRows(lookup.byToken.get(token));
  }

  if (!candidates.size) {
    includeRows(lookup.all);
  }

  return Array.from(candidates.values());
}

function computeTokenOverlap(tokensA: string[], tokensB: string[]) {
  if (!tokensA.length || !tokensB.length) {
    return {
      overlapWithA: 0,
      overlapWithB: 0,
    };
  }

  const setB = new Set(tokensB);
  let shared = 0;

  for (const token of tokensA) {
    if (setB.has(token)) {
      shared += 1;
    }
  }

  return {
    overlapWithA: shared / tokensA.length,
    overlapWithB: shared / tokensB.length,
  };
}

function scoreCandidate(
  checkoutItem: PreparedCheckoutItem,
  inventoryItem: PreparedInventoryItem
): ScoredCandidate {
  const exactName = inventoryItem.nameNorm === checkoutItem.nameNorm;
  const containsName =
    !exactName &&
    (inventoryItem.nameNorm.includes(checkoutItem.nameNorm) ||
      checkoutItem.nameNorm.includes(inventoryItem.nameNorm));
  const overlap = computeTokenOverlap(checkoutItem.nameTokens, inventoryItem.nameTokens);

  const overlapSignal = clampToUnit(overlap.overlapWithA * 0.7 + overlap.overlapWithB * 0.3);
  const nameSignal = exactName
    ? 1
    : containsName
      ? 0.9
      : Math.max(overlapSignal, 0.08);

  let brandSignal = 0.6;
  if (checkoutItem.brandNorm) {
    brandSignal = inventoryItem.brandNorm === checkoutItem.brandNorm ? 1 : 0;
  }

  const sizeExact = inventoryItem.sizeNorm === checkoutItem.sizeNorm;
  const sizeContains =
    !sizeExact &&
    !!checkoutItem.sizeNorm &&
    !!inventoryItem.sizeNorm &&
    (inventoryItem.sizeNorm.includes(checkoutItem.sizeNorm) ||
      checkoutItem.sizeNorm.includes(inventoryItem.sizeNorm));

  let sizeSignal = 0.55;
  if (checkoutItem.sizeNorm) {
    if (sizeExact) {
      sizeSignal = 1;
    } else if (sizeContains) {
      sizeSignal = 0.75;
    } else if (inventoryItem.sizeNorm) {
      sizeSignal = 0;
    } else {
      sizeSignal = 0.3;
    }
  }

  let categorySignal = 0.6;
  if (checkoutItem.categoryNorm) {
    if (inventoryItem.categoryNorm === checkoutItem.categoryNorm) {
      categorySignal = 1;
    } else if (inventoryItem.categoryNorm) {
      categorySignal = 0.2;
    } else {
      categorySignal = 0.45;
    }
  }

  const weighted =
    nameSignal * 55 +
    brandSignal * 20 +
    sizeSignal * 15 +
    categorySignal * 10;
  const percentage = Math.round(weighted);

  return {
    item: inventoryItem,
    percentage,
    exactName,
  };
}

function clampToUnit(value: number) {
  return Math.max(0, Math.min(1, value));
}

function rankCandidates(checkoutItem: PreparedCheckoutItem, lookup: InventoryLookup) {
  const rows = collectCandidateRows(checkoutItem, lookup);

  const scored = rows.map((row) => scoreCandidate(checkoutItem, row));
  if (!scored.length) {
    return [] as ScoredCandidate[];
  }

  // Prefer strong matches, but fall back to best available percentage so every detected item can decrement.
  const strictMatches = scored.filter((candidate) => candidate.percentage >= STRICT_MATCH_PERCENTAGE);
  const ranked = [...(strictMatches.length ? strictMatches : scored)];

  ranked.sort((a, b) => {
    if (b.percentage !== a.percentage) {
      return b.percentage - a.percentage;
    }

    if (b.item.remainingQuantity !== a.item.remainingQuantity) {
      return b.item.remainingQuantity - a.item.remainingQuantity;
    }

    return a.item.id.localeCompare(b.item.id);
  });

  return ranked;
}

async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number
) {
  if (!tasks.length) {
    return [] as T[];
  }

  const results = new Array<T>(tasks.length);
  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      const current = nextIndex;
      nextIndex += 1;

      if (current >= tasks.length) {
        break;
      }

      results[current] = await tasks[current]();
    }
  };

  const workerCount = Math.max(1, Math.min(concurrency, tasks.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

function readText(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

function readQuantity(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, Math.floor(parsed));
}

function normalizeCheckoutItem(item: CheckoutItemInput): NormalizedCheckoutItem | null {
  const name = item.name?.trim() || "";
  if (!name) {
    return null;
  }

  const quantity = readQuantity(item.quantity);
  if (quantity <= 0) {
    return null;
  }

  return {
    name,
    brand: item.brand?.trim() || null,
    quantity,
    category: item.category?.trim() || null,
    size: item.size?.trim() || null,
  };
}

function aggregateCheckoutItems(items: NormalizedCheckoutItem[]) {
  const map = new Map<string, NormalizedCheckoutItem>();

  for (const item of items) {
    const key = [
      normalizeText(item.brand),
      normalizeText(item.name),
      normalizeText(item.size),
      normalizeText(item.category),
    ].join("|");

    const existing = map.get(key);
    if (existing) {
      existing.quantity += item.quantity;
      continue;
    }

    map.set(key, { ...item });
  }

  return Array.from(map.values());
}

function extractInventoryRows(data: Record<string, unknown> | null) {
  if (!data) {
    return [] as unknown[];
  }

  const directRows = data.inventoryItems;
  if (Array.isArray(directRows)) {
    return directRows;
  }

  for (const value of Object.values(data)) {
    if (Array.isArray(value)) {
      return value;
    }
  }

  return [] as unknown[];
}

function normalizeInventoryRow(value: unknown): InventoryItemRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const row = value as Record<string, unknown>;
  const id = readText(row.id);
  const name = readText(row.name);
  const brand = readText(row.brand);
  const quantity = readQuantity(row.quantity);

  if (!id || !name || !brand) {
    return null;
  }

  return {
    id,
    name,
    brand,
    quantity,
    category: readText(row.category),
    size: readText(row.size),
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CheckoutBody;
    const incomingItems = Array.isArray(body.items) ? body.items : [];

    if (!incomingItems.length) {
      return Response.json({ error: "No checkout items supplied." }, { status: 400 });
    }

    const normalizedItems = incomingItems
      .map(normalizeCheckoutItem)
      .filter((item): item is NormalizedCheckoutItem => item !== null);

    if (!normalizedItems.length) {
      return Response.json(
        { error: "No valid checkout items with name and quantity." },
        { status: 400 }
      );
    }

    const checkoutItems = aggregateCheckoutItems(normalizedItems);
    const listQuery =
      process.env.FIREBASE_DATA_CONNECT_CHECKOUT_LIST_QUERY?.trim() ||
      DEFAULT_CHECKOUT_LIST_QUERY;

    const { data } = await executeDataConnect(listQuery);
    const inventoryRows = extractInventoryRows(data)
      .map(normalizeInventoryRow)
      .filter((row): row is InventoryItemRecord => row !== null);

    if (!inventoryRows.length) {
      return Response.json(
        {
          processedItems: checkoutItems.length,
          matchedItems: 0,
          totalDecremented: 0,
          updated: [] as UpdatedItemSummary[],
          unmatched: checkoutItems,
          message: "No inventory rows available to decrement.",
        },
        { status: 200 }
      );
    }

    const preparedInventory = prepareInventoryRows(inventoryRows);
    const inventoryLookup = buildInventoryLookup(preparedInventory);

    const decrementById = new Map<
      string,
      {
        row: PreparedInventoryItem;
        requestedDecrement: number;
      }
    >();

    const unmatched: NormalizedCheckoutItem[] = [];
    let matchedItems = 0;

    for (const checkoutItem of checkoutItems) {
      const preparedCheckoutItem = prepareCheckoutItem(checkoutItem);
      const rankedCandidates = rankCandidates(preparedCheckoutItem, inventoryLookup);

      if (!rankedCandidates.length) {
        unmatched.push(checkoutItem);
        continue;
      }

      let remainingToAllocate = checkoutItem.quantity;

      for (const candidate of rankedCandidates) {
        if (remainingToAllocate <= 0) {
          break;
        }

        if (candidate.item.remainingQuantity <= 0) {
          continue;
        }

        const decrementAmount = Math.min(remainingToAllocate, candidate.item.remainingQuantity);
        if (decrementAmount <= 0) {
          continue;
        }

        candidate.item.remainingQuantity -= decrementAmount;
        remainingToAllocate -= decrementAmount;

        const existing = decrementById.get(candidate.item.id);
        if (existing) {
          existing.requestedDecrement += decrementAmount;
        } else {
          decrementById.set(candidate.item.id, {
            row: candidate.item,
            requestedDecrement: decrementAmount,
          });
        }
      }

      const allocatedAmount = checkoutItem.quantity - remainingToAllocate;
      if (allocatedAmount > 0) {
        matchedItems += 1;
      } else {
        unmatched.push(checkoutItem);
        continue;
      }

      if (remainingToAllocate > 0) {
        unmatched.push({
          ...checkoutItem,
          quantity: remainingToAllocate,
        });
      }
    }

    const updateMutation =
      process.env.FIREBASE_DATA_CONNECT_CHECKOUT_UPDATE_MUTATION?.trim() ||
      DEFAULT_CHECKOUT_UPDATE_MUTATION;

    const updated: UpdatedItemSummary[] = [];
    let totalDecremented = 0;
    const updatedAt = new Date().toISOString();

    const updateTasks = Array.from(decrementById.values()).map((entry) => {
      return async () => {
        const beforeQuantity = entry.row.quantity;
        const decrementedBy = Math.min(beforeQuantity, entry.requestedDecrement);
        const afterQuantity = Math.max(0, beforeQuantity - decrementedBy);

        if (decrementedBy <= 0) {
          return null as UpdatedItemSummary | null;
        }

        await executeDataConnect(updateMutation, {
          id: entry.row.id,
          quantity: afterQuantity,
          updatedAt,
        });

        return {
          id: entry.row.id,
          name: entry.row.name,
          brand: entry.row.brand,
          beforeQuantity,
          decrementedBy,
          afterQuantity,
        } as UpdatedItemSummary;
      };
    });

    const updateResults = await runWithConcurrency(updateTasks, 6);

    for (const result of updateResults) {
      if (!result) {
        continue;
      }

      updated.push(result);
      totalDecremented += result.decrementedBy;
    }

    return Response.json({
      processedItems: checkoutItems.length,
      matchedItems,
      totalDecremented,
      updated,
      unmatched,
      message:
        matchedItems > 0
          ? "Inventory successfully decremented from checkout photo items."
          : "No checkout items could be matched to current inventory.",
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to process checkout decrement through Data Connect.";

    return Response.json({ error: message }, { status: 500 });
  }
}
