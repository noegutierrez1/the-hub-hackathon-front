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
  locationCenterX?: number | null;
  locationCenterY?: number | null;
  locationRadius?: number | null;
  imageWidth?: number | null;
  imageHeight?: number | null;
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

type ItemLocation = {
  centerX: number;
  centerY: number;
  radius: number;
  imageWidth: number;
  imageHeight: number;
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
  location: ItemLocation | null;
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
  location: ItemLocation | null;
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
  $locationCenterX: Float
  $locationCenterY: Float
  $locationRadius: Float
  $imageWidth: Float
  $imageHeight: Float
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
      locationCenterX: $locationCenterX
      locationCenterY: $locationCenterY
      locationRadius: $locationRadius
      imageWidth: $imageWidth
      imageHeight: $imageHeight
      createdAt: $createdAt
      updatedAt: $updatedAt
    }
  )
}
`.trim();

const LEGACY_INSERT_MUTATION = `
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
    locationCenterX
    locationCenterY
    locationRadius
    imageWidth
    imageHeight
  }
}
`.trim();

const LEGACY_LIST_QUERY = `
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

const LOCATION_MARKER_PREFIX = "[[LOC]]";
const LOCATION_SCHEMA_FIELDS = [
  "locationCenterX",
  "locationCenterY",
  "locationRadius",
  "imageWidth",
  "imageHeight",
];

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

function normalizeNumber(value: unknown) {
  if (value == null) {
    return null;
  }

  if (typeof value === "string" && value.trim() === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}

function normalizeLocationFromInput(item: InventoryItemRow): ItemLocation | null {
  const centerX = normalizeNumber(item.locationCenterX);
  const centerY = normalizeNumber(item.locationCenterY);
  const radius = normalizeNumber(item.locationRadius);
  const imageWidth = normalizeNumber(item.imageWidth);
  const imageHeight = normalizeNumber(item.imageHeight);

  if (
    centerX == null ||
    centerY == null ||
    radius == null ||
    imageWidth == null ||
    imageHeight == null ||
    radius <= 0 ||
    imageWidth <= 0 ||
    imageHeight <= 0
  ) {
    return null;
  }

  return {
    centerX,
    centerY,
    radius,
    imageWidth,
    imageHeight,
  };
}

function extractLocationMarker(description: string | null) {
  if (!description) {
    return {
      description: null,
      location: null as ItemLocation | null,
    };
  }

  const markerIndex = description.lastIndexOf(LOCATION_MARKER_PREFIX);
  if (markerIndex < 0) {
    return {
      description,
      location: null as ItemLocation | null,
    };
  }

  const rawJson = description.slice(markerIndex + LOCATION_MARKER_PREFIX.length).trim();
  const baseDescription = description.slice(0, markerIndex).trim() || null;

  try {
    const parsed = JSON.parse(rawJson) as Record<string, unknown>;
    const location = normalizeLocationFromInput({
      locationCenterX: normalizeNumber(parsed.centerX),
      locationCenterY: normalizeNumber(parsed.centerY),
      locationRadius: normalizeNumber(parsed.radius),
      imageWidth: normalizeNumber(parsed.imageWidth),
      imageHeight: normalizeNumber(parsed.imageHeight),
    });

    return {
      description: baseDescription,
      location,
    };
  } catch {
    return {
      description,
      location: null as ItemLocation | null,
    };
  }
}

function appendLocationMarker(description: string | null, location: ItemLocation | null) {
  if (!location) {
    return description;
  }

  const markerPayload = JSON.stringify({
    centerX: Number(location.centerX.toFixed(2)),
    centerY: Number(location.centerY.toFixed(2)),
    radius: Number(location.radius.toFixed(2)),
    imageWidth: Number(location.imageWidth.toFixed(2)),
    imageHeight: Number(location.imageHeight.toFixed(2)),
  });

  if (!description) {
    return `${LOCATION_MARKER_PREFIX}${markerPayload}`;
  }

  return `${description}\n${LOCATION_MARKER_PREFIX}${markerPayload}`;
}

function isLocationSchemaMismatch(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  const mentionsLocationField = LOCATION_SCHEMA_FIELDS.some((field) => message.includes(field));

  if (!mentionsLocationField) {
    return false;
  }

  return /(Cannot query field|Unknown argument|Unknown field|not defined by type|not found in type)/i.test(
    message
  );
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
  const location = normalizeLocationFromInput(item);
  const cleanDescription = item.description?.trim() || null;
  const nowIso = new Date().toISOString();

  return {
    id,
    shelfId,
    name,
    brand: explicitBrand || sku || "Unknown",
    quantity,
    size,
    category,
    description: cleanDescription,
    photoUrl,
    createdAt: nowIso,
    updatedAt: nowIso,
    location,
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
  const locationFromColumns = normalizeLocationFromInput({
    locationCenterX: normalizeNumber(row.locationCenterX),
    locationCenterY: normalizeNumber(row.locationCenterY),
    locationRadius: normalizeNumber(row.locationRadius),
    imageWidth: normalizeNumber(row.imageWidth),
    imageHeight: normalizeNumber(row.imageHeight),
  });
  const parsedDescription = extractLocationMarker(readString(row.description));

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
    description: parsedDescription.description,
    photoUrl: readString(row.photoUrl),
    size: readString(row.size),
    location: locationFromColumns || parsedDescription.location,
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

function buildListQuery(limit: number, includeLocationFields: boolean) {
  const template = includeLocationFields ? DEFAULT_LIST_QUERY : LEGACY_LIST_QUERY;
  return template.replace("__LIMIT__", String(limit));
}

async function executeInventoryListQuery(limit: number, customQuery: string | null) {
  if (customQuery) {
    try {
      return await executeDataConnect(customQuery);
    } catch (error) {
      if (!isLocationSchemaMismatch(error)) {
        throw error;
      }
    }
  }

  try {
    return await executeDataConnect(buildListQuery(limit, true));
  } catch (error) {
    if (!isLocationSchemaMismatch(error)) {
      throw error;
    }

    return executeDataConnect(buildListQuery(limit, false));
  }
}

async function executeDefaultInsertWithFallback(rowsWithShelf: NormalizedRow[]) {
  let savedCount = 0;
  let useLegacyMutation = false;

  for (const row of rowsWithShelf) {
    const baseVariables = {
      id: row.id,
      shelfId: row.shelfId,
      name: row.name,
      brand: row.brand,
      quantity: row.quantity,
      size: row.size,
      category: row.category,
      photoUrl: row.photoUrl,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };

    if (useLegacyMutation) {
      await executeDataConnect(LEGACY_INSERT_MUTATION, {
        ...baseVariables,
        description: appendLocationMarker(row.description, row.location),
      });
      savedCount += 1;
      continue;
    }

    try {
      await executeDataConnect(DEFAULT_INSERT_MUTATION, {
        ...baseVariables,
        description: row.description,
        locationCenterX: row.location?.centerX ?? null,
        locationCenterY: row.location?.centerY ?? null,
        locationRadius: row.location?.radius ?? null,
        imageWidth: row.location?.imageWidth ?? null,
        imageHeight: row.location?.imageHeight ?? null,
      });
    } catch (error) {
      if (!isLocationSchemaMismatch(error)) {
        throw error;
      }

      useLegacyMutation = true;
      await executeDataConnect(LEGACY_INSERT_MUTATION, {
        ...baseVariables,
        description: appendLocationMarker(row.description, row.location),
      });
    }

    savedCount += 1;
  }

  return savedCount;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = normalizeListLimit(url.searchParams.get("limit"));
    const search = url.searchParams.get("search") || "";
    const shelfId = url.searchParams.get("shelfId");

    const customQuery = process.env.FIREBASE_DATA_CONNECT_LIST_QUERY?.trim() || null;
    const { data } = await executeInventoryListQuery(limit, customQuery);
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
      const customMutationItems = rowsWithShelf.map((row) => ({
        id: row.id,
        shelfId: row.shelfId,
        name: row.name,
        brand: row.brand,
        quantity: row.quantity,
        size: row.size,
        category: row.category,
        description: row.description,
        photoUrl: row.photoUrl,
        locationCenterX: row.location?.centerX ?? null,
        locationCenterY: row.location?.centerY ?? null,
        locationRadius: row.location?.radius ?? null,
        imageWidth: row.location?.imageWidth ?? null,
        imageHeight: row.location?.imageHeight ?? null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }));

      try {
        const { data } = await executeDataConnect(customMutation, {
          items: customMutationItems,
        });
        return Response.json({
          savedCount: inferSavedCount(data, rowsWithShelf.length),
          shelf,
        });
      } catch (error) {
        if (!isLocationSchemaMismatch(error)) {
          throw error;
        }
      }
    }

    const savedCount = await executeDefaultInsertWithFallback(rowsWithShelf);

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

      const customQuery = process.env.FIREBASE_DATA_CONNECT_LIST_QUERY?.trim() || null;
      const { data } = await executeInventoryListQuery(1000, customQuery);

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
