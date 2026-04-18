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

function normalizeText(value: string | null | undefined) {
  return (value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function findInventoryMatch(
  checkoutItem: NormalizedCheckoutItem,
  inventory: InventoryItemRecord[]
) {
  const nameNorm = normalizeText(checkoutItem.name);
  const brandNorm = normalizeText(checkoutItem.brand);
  const sizeNorm = normalizeText(checkoutItem.size);
  const categoryNorm = normalizeText(checkoutItem.category);

  if (!nameNorm) {
    return null;
  }

  const available = inventory.filter((item) => item.quantity > 0);

  let candidates = available.filter(
    (item) =>
      normalizeText(item.name) === nameNorm &&
      (!brandNorm || normalizeText(item.brand) === brandNorm) &&
      (!sizeNorm || normalizeText(item.size) === sizeNorm)
  );

  if (!candidates.length) {
    candidates = available.filter(
      (item) =>
        normalizeText(item.name) === nameNorm &&
        (!brandNorm || normalizeText(item.brand) === brandNorm)
    );
  }

  if (!candidates.length && brandNorm) {
    candidates = available.filter(
      (item) =>
        normalizeText(item.brand) === brandNorm &&
        normalizeText(item.name).includes(nameNorm)
    );
  }

  if (!candidates.length) {
    candidates = available.filter((item) => {
      const inventoryName = normalizeText(item.name);
      return inventoryName.includes(nameNorm) || nameNorm.includes(inventoryName);
    });
  }

  if (!candidates.length) {
    return null;
  }

  if (categoryNorm) {
    const categoryMatches = candidates.filter(
      (item) => normalizeText(item.category) === categoryNorm
    );

    if (categoryMatches.length) {
      candidates = categoryMatches;
    }
  }

  candidates.sort((a, b) => b.quantity - a.quantity);
  return candidates[0] || null;
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

    const decrementById = new Map<
      string,
      {
        row: InventoryItemRecord;
        requestedDecrement: number;
      }
    >();

    const unmatched: NormalizedCheckoutItem[] = [];
    let matchedItems = 0;

    for (const checkoutItem of checkoutItems) {
      const match = findInventoryMatch(checkoutItem, inventoryRows);
      if (!match) {
        unmatched.push(checkoutItem);
        continue;
      }

      matchedItems += 1;

      const existing = decrementById.get(match.id);
      if (existing) {
        existing.requestedDecrement += checkoutItem.quantity;
      } else {
        decrementById.set(match.id, {
          row: match,
          requestedDecrement: checkoutItem.quantity,
        });
      }
    }

    const updateMutation =
      process.env.FIREBASE_DATA_CONNECT_CHECKOUT_UPDATE_MUTATION?.trim() ||
      DEFAULT_CHECKOUT_UPDATE_MUTATION;

    const updated: UpdatedItemSummary[] = [];
    let totalDecremented = 0;
    const updatedAt = new Date().toISOString();

    for (const entry of decrementById.values()) {
      const beforeQuantity = entry.row.quantity;
      const decrementedBy = Math.min(beforeQuantity, entry.requestedDecrement);
      const afterQuantity = Math.max(0, beforeQuantity - entry.requestedDecrement);

      if (decrementedBy <= 0) {
        continue;
      }

      await executeDataConnect(updateMutation, {
        id: entry.row.id,
        quantity: afterQuantity,
        updatedAt,
      });

      updated.push({
        id: entry.row.id,
        name: entry.row.name,
        brand: entry.row.brand,
        beforeQuantity,
        decrementedBy,
        afterQuantity,
      });

      totalDecremented += decrementedBy;
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
