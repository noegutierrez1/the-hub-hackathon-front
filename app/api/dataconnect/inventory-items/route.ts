import { randomUUID } from "crypto";
import { executeDataConnect } from "@/lib/dataconnect";

type InventoryItemRow = {
  id?: string | null;
  shelfId?: string | null;
  sku?: string | null;
  brand?: string;
  name?: string;
  quantity?: number;
  "package-size"?: string;
  category?: string;
  description?: string;
  photoUrl?: string;
};

type SaveInventoryItemsBody = {
  items?: InventoryItemRow[];
  shelfId?: string | null;
  shelfName?: string;
  shelfLocationDescription?: string;
};

type ShelfSummary = {
  id: string;
  name: string | null;
  locationDescription: string | null;
};

type StudentInventoryItem = {
  id: string;
  shelfId: string | null;
  shelf: ShelfSummary | null;
  name: string;
  brand: string;
  quantity: number;
  category: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  description: string | null;
  photoUrl: string | null;
  size: string | null;
};

type NormalizedRow = {
  id: string;
  shelfId: string | null;
  name: string;
  brand: string;
  quantity: number;
  size: string | null;
  category: string | null;
  description: string | null;
  photoUrl: string;
  createdAt: string;
  updatedAt: string;
};

const DEFAULT_INSERT_MUTATION = `
mutation InsertInventoryItem(
  $id: UUID
  $shelfId: UUID
  $name: String
  $brand: String
  $quantity: Int
  $size: String
  $category: String
  $description: String
  $photoUrl: String
  $createdAt: Timestamp
  $updatedAt: Timestamp
) {
  inventoryItem_insert(
    data: {
      id: $id
      shelfId: $shelfId
      name: $name
      brand: $brand
      quantity: $quantity
      size: $size
      category: $category
      description: $description
      photoUrl: $photoUrl
      createdAt: $createdAt
      updatedAt: $updatedAt
    }
  )
}
`.trim();

const DEFAULT_SHELF_INSERT_MUTATION = `
mutation InsertShelf(
  $id: UUID
  $name: String
  $locationDescription: String
  $createdAt: Timestamp
  $updatedAt: Timestamp
) {
  shelf_insert(
    data: {
      id: $id
      name: $name
      locationDescription: $locationDescription
      createdAt: $createdAt
      updatedAt: $updatedAt
    }
  )
}
`.trim();

const DEFAULT_LIST_QUERY = `
query StudentInventory {
  inventoryItems(limit: __LIMIT__) {
    id
    shelfId
    shelf {
      id
      name
      locationDescription
    }
    name
    brand
    quantity
    category
    createdAt
    updatedAt
    description
    photoUrl
    size
  }
}
`.trim();

const DEFAULT_DELETE_SINGLE_MUTATION = `
mutation DeleteInventoryItem($id: UUID) {
  inventoryItem_delete(id: $id)
}
`.trim();

const DEFAULT_DELETE_ALL_MUTATION = `
mutation DeleteAllInventoryItems {
  inventoryItem_deleteMany(all: true)
}
`.trim();

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizeUuid(value: string | null | undefined) {
  const trimmed = value?.trim() || "";
  if (!trimmed) {
    return null;
  }
  return UUID_PATTERN.test(trimmed) ? trimmed : null;
}

function normalizeText(value: string | null | undefined) {
  return (value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildPlaceholderPhotoUrl(id: string, name: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const safeSlug = slug || "inventory-item";
  return `https://images.example.com/hub-inventory/${safeSlug}-${id}.jpg`;
}

function normalizeItem(item: InventoryItemRow): NormalizedRow | null {
  const name = item.name?.trim() || "";
  if (!name) {
    return null;
  }

  const id = normalizeUuid(item.id) || randomUUID();
  const shelfId = normalizeUuid(item.shelfId);
  const size = item["package-size"]?.trim() || null;
  const category = item.category?.trim() || null;
  const sku = item.sku?.trim() || "";
  const explicitBrand = item.brand?.trim() || "";
  const quantityRaw = Number(item.quantity);
  const quantity = Number.isFinite(quantityRaw) && quantityRaw > 0 ? Math.floor(quantityRaw) : 0;
  const photoUrl = item.photoUrl?.trim() || buildPlaceholderPhotoUrl(id, name);
  const nowIso = new Date().toISOString();

  return {
    id,
    shelfId,
    name,
    brand: explicitBrand || sku || "Unknown",
    quantity,
    size,
    category,
    description: item.description?.trim() || null,
    photoUrl,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

function inferSavedCount(data: Record<string, unknown> | null, fallbackCount: number) {
  if (!data) {
    return fallbackCount;
  }

  for (const value of Object.values(data)) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (Array.isArray(value)) {
      return value.length;
    }
  }

  for (const value of Object.values(data)) {
    if (!value || typeof value !== "object") {
      continue;
    }

    const record = value as Record<string, unknown>;
    const candidateKeys = ["affectedCount", "insertedCount", "count", "totalCount"];

    for (const key of candidateKeys) {
      const candidate = record[key];
      if (typeof candidate === "number" && Number.isFinite(candidate)) {
        return candidate;
      }
    }
  }

  return fallbackCount;
}

function normalizeListLimit(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 250;
  }
  return Math.min(1000, Math.floor(parsed));
}

function readString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeShelf(value: unknown): ShelfSummary | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const shelf = value as Record<string, unknown>;
  const id = readString(shelf.id);
  if (!id) {
    return null;
  }

  return {
    id,
    name: readString(shelf.name),
    locationDescription: readString(shelf.locationDescription),
  };
}

function normalizeStudentInventoryItem(value: unknown): StudentInventoryItem | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const row = value as Record<string, unknown>;
  const name = readString(row.name);
  if (!name) {
    return null;
  }

  const quantityRaw = Number(row.quantity);
  const quantity = Number.isFinite(quantityRaw) ? Math.max(0, Math.floor(quantityRaw)) : 0;

  const parsedShelf = normalizeShelf(row.shelf);
  const shelfId = readString(row.shelfId) || parsedShelf?.id || null;

  return {
    id: readString(row.id) || randomUUID(),
    shelfId,
    shelf: parsedShelf,
    name,
    brand: readString(row.brand) || "Unknown",
    quantity,
    category: readString(row.category),
    createdAt: readString(row.createdAt),
    updatedAt: readString(row.updatedAt),
    description: readString(row.description),
    photoUrl: readString(row.photoUrl),
    size: readString(row.size),
  };
}

function toEpoch(value: string | null) {
  if (!value) {
    return 0;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function extractItemRows(data: Record<string, unknown> | null) {
  if (!data) {
    return [];
  }

  const direct = data.inventoryItems;
  if (Array.isArray(direct)) {
    return direct;
  }

  for (const value of Object.values(data)) {
    if (Array.isArray(value)) {
      return value;
    }
  }

  return [];
}

function filterItems(
  items: StudentInventoryItem[],
  search: string,
  shelfId: string | null
) {
  const normalizedSearch = normalizeText(search);
  const normalizedShelfId = normalizeUuid(shelfId);

  return items.filter((item) => {
    if (normalizedShelfId && item.shelfId !== normalizedShelfId) {
      return false;
    }

    if (!normalizedSearch) {
      return true;
    }

    const haystack = normalizeText(
      [
        item.name,
        item.brand,
        item.category,
        item.size,
        item.description,
        item.shelf?.name,
        item.shelf?.locationDescription,
      ]
        .filter(Boolean)
        .join(" ")
    );

    return haystack.includes(normalizedSearch);
  });
}

async function ensureUploadShelf(body: SaveInventoryItemsBody) {
  const providedShelfId = normalizeUuid(body.shelfId);
  if (providedShelfId) {
    return {
      shelfId: providedShelfId,
      shelf: {
        id: providedShelfId,
        name: null,
        locationDescription: null,
      } as ShelfSummary,
    };
  }

  const nowIso = new Date().toISOString();
  const shelfId = randomUUID();
  const shelfName = body.shelfName?.trim() || `Upload ${nowIso.slice(0, 16).replace("T", " ")}`;
  const shelfLocationDescription =
    body.shelfLocationDescription?.trim() || "Generated from inventory photo upload";

  await executeDataConnect(DEFAULT_SHELF_INSERT_MUTATION, {
    id: shelfId,
    name: shelfName,
    locationDescription: shelfLocationDescription,
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  return {
    shelfId,
    shelf: {
      id: shelfId,
      name: shelfName,
      locationDescription: shelfLocationDescription,
    } as ShelfSummary,
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = normalizeListLimit(url.searchParams.get("limit"));
    const search = url.searchParams.get("search") || "";
    const shelfId = url.searchParams.get("shelfId");

    const customQuery = process.env.FIREBASE_DATA_CONNECT_LIST_QUERY?.trim();
    const query = customQuery || DEFAULT_LIST_QUERY.replace("__LIMIT__", String(limit));

    const { data } = await executeDataConnect(query);
    const allItems = extractItemRows(data)
      .map(normalizeStudentInventoryItem)
      .filter((row): row is StudentInventoryItem => row !== null)
      .sort((a, b) => toEpoch(b.updatedAt) - toEpoch(a.updatedAt));

    const items = filterItems(allItems, search, shelfId);

    const shelfMap = new Map<string, ShelfSummary>();
    for (const item of allItems) {
      if (!item.shelfId) {
        continue;
      }

      if (item.shelf) {
        shelfMap.set(item.shelfId, item.shelf);
        continue;
      }

      if (!shelfMap.has(item.shelfId)) {
        shelfMap.set(item.shelfId, {
          id: item.shelfId,
          name: null,
          locationDescription: null,
        });
      }
    }

    return Response.json({
      items,
      count: items.length,
      shelves: Array.from(shelfMap.values()),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch inventory items from Data Connect.";

    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SaveInventoryItemsBody;
    const rows = Array.isArray(body.items) ? body.items : [];

    if (!rows.length) {
      return Response.json({ error: "No items supplied." }, { status: 400 });
    }

    const normalizedRows = rows
      .map(normalizeItem)
      .filter((row): row is NormalizedRow => row !== null);

    if (!normalizedRows.length) {
      return Response.json({ error: "No valid items with names to save." }, { status: 400 });
    }

    const { shelfId: uploadShelfId, shelf } = await ensureUploadShelf(body);

    const rowsWithShelf = normalizedRows.map((row) => ({
      ...row,
      shelfId: normalizeUuid(row.shelfId) || uploadShelfId,
    }));

    const customMutation = process.env.FIREBASE_DATA_CONNECT_INSERT_MUTATION?.trim();

    if (customMutation) {
      const { data } = await executeDataConnect(customMutation, {
        items: rowsWithShelf,
      });
      return Response.json({
        savedCount: inferSavedCount(data, rowsWithShelf.length),
        shelf,
      });
    }

    let savedCount = 0;
    for (const row of rowsWithShelf) {
      await executeDataConnect(DEFAULT_INSERT_MUTATION, {
        id: row.id,
        shelfId: row.shelfId,
        name: row.name,
        brand: row.brand,
        quantity: row.quantity,
        size: row.size,
        category: row.category,
        description: row.description,
        photoUrl: row.photoUrl,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      });
      savedCount += 1;
    }

    return Response.json({ savedCount, shelf });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to save inventory items through Data Connect.";

    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const scope = (url.searchParams.get("scope") || "").toLowerCase();

    if (!scope) {
      return Response.json(
        { error: "Missing scope. Use scope=item|shelf|all." },
        { status: 400 }
      );
    }

    if (scope === "all") {
      const { data } = await executeDataConnect(DEFAULT_DELETE_ALL_MUTATION);
      return Response.json({
        scope,
        deletedCount: inferSavedCount(data, 0),
      });
    }

    if (scope === "item") {
      const itemId = normalizeUuid(url.searchParams.get("itemId"));
      if (!itemId) {
        return Response.json({ error: "Missing or invalid itemId." }, { status: 400 });
      }

      const { data } = await executeDataConnect(DEFAULT_DELETE_SINGLE_MUTATION, {
        id: itemId,
      });

      const rawValue = data ? Object.values(data)[0] : null;
      const deletedCount = rawValue == null ? 0 : 1;

      return Response.json({
        scope,
        itemId,
        deletedCount,
      });
    }

    if (scope === "shelf") {
      const shelfId = normalizeUuid(url.searchParams.get("shelfId"));
      if (!shelfId) {
        return Response.json({ error: "Missing or invalid shelfId." }, { status: 400 });
      }

      const { data } = await executeDataConnect(
        DEFAULT_LIST_QUERY.replace("__LIMIT__", "1000")
      );

      const shelfItems = extractItemRows(data)
        .map(normalizeStudentInventoryItem)
        .filter((row): row is StudentInventoryItem => row !== null)
        .filter((row) => row.shelfId === shelfId);

      let deletedCount = 0;
      for (const row of shelfItems) {
        await executeDataConnect(DEFAULT_DELETE_SINGLE_MUTATION, {
          id: row.id,
        });
        deletedCount += 1;
      }

      return Response.json({
        scope,
        shelfId,
        deletedCount,
      });
    }

    return Response.json(
      { error: "Unsupported scope. Use scope=item|shelf|all." },
      { status: 400 }
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to delete inventory items through Data Connect.";

    return Response.json({ error: message }, { status: 500 });
  }
}
