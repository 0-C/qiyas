import type pg from "pg";
import { ensureReady, raw, withTx } from "./db";
import {
  DEFAULT_FIELDS,
  HttpError,
  asBoolean,
  asText,
  fromFils,
  parseKd,
  toFils,
} from "./domain";
import { getEnv } from "./env";

interface ShopRow {
  id: string;
  name: string;
  green_days: number;
  orange_days: number;
  delivery_fee: string;
  notifications_enabled: boolean;
  next_order_code: number;
  created_at: Date;
}

export interface FieldRow {
  id: string;
  shop_id: string;
  key: string;
  label: string;
  label_ar: string | null;
  is_custom: boolean;
  sort_order: number;
  active: boolean;
}

export interface Shop {
  id: string;
  name: string;
  greenDays: number;
  orangeDays: number;
  deliveryFee: string;
  notificationsEnabled: boolean;
  createdAt: string;
}

export interface MeasurementField {
  id: string;
  key: string;
  label: string;
  labelAr: string | null;
  isCustom: boolean;
  sortOrder: number;
  active: boolean;
}

export function mapShop(row: ShopRow): Shop {
  return {
    id: row.id,
    name: row.name,
    greenDays: row.green_days,
    orangeDays: row.orange_days,
    deliveryFee: fromFils(toFils(row.delivery_fee)),
    notificationsEnabled: row.notifications_enabled,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export function mapField(row: FieldRow): MeasurementField {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    labelAr: row.label_ar,
    isCustom: row.is_custom,
    sortOrder: row.sort_order,
    active: row.active,
  };
}

export async function ensureShop(): Promise<void> {
  const existing = await raw<{ id: string; n: number }>(
    `SELECT s.id,
            (SELECT count(*)::int FROM measurement_fields f WHERE f.shop_id = s.id AND f.is_custom = false) AS n
     FROM shops s
     ORDER BY s.created_at
     LIMIT 1`,
  );
  if (existing[0] && existing[0].n >= DEFAULT_FIELDS.length) return;

  await withTx(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(8675309)");
    const existing = await client.query<{ id: string }>("SELECT id FROM shops ORDER BY created_at LIMIT 1");
    let shopId = existing.rows[0]?.id;
    if (!shopId) {
      const name = getEnv("SHOP_NAME")?.trim() || "Al Neel Tailoring";
      const inserted = await client.query<{ id: string }>("INSERT INTO shops (name) VALUES ($1) RETURNING id", [
        name.slice(0, 80),
      ]);
      shopId = inserted.rows[0].id;
    }
    for (const [index, field] of DEFAULT_FIELDS.entries()) {
      await client.query(
        `INSERT INTO measurement_fields (shop_id, key, label, label_ar, is_custom, sort_order, active)
         VALUES ($1, $2, $3, $4, false, $5, true)
         ON CONFLICT (shop_id, key) DO NOTHING`,
        [shopId, field.key, field.label, field.labelAr, index + 1],
      );
    }
  });
}

export async function getShopRow(): Promise<ShopRow> {
  const rows = await raw<ShopRow>("SELECT * FROM shops ORDER BY created_at LIMIT 1");
  if (!rows[0]) throw new HttpError(500, "Shop was not created.");
  return rows[0];
}

export async function getShop(): Promise<Shop> {
  return mapShop(await getShopRow());
}

export async function listFields(shopId: string): Promise<FieldRow[]> {
  return raw<FieldRow>(
    "SELECT * FROM measurement_fields WHERE shop_id = $1 ORDER BY sort_order, label",
    [shopId],
  );
}

export async function updateShop(input: Record<string, unknown>): Promise<Shop> {
  await ensureReady();
  const current = await getShopRow();
  const name = asText(input.name, 80);
  const greenDays = Number(input.greenDays);
  const orangeDays = Number(input.orangeDays);
  const deliveryFee = parseKd(input.deliveryFee);
  const notifications = asBoolean(input.notificationsEnabled);
  if (!name) throw new HttpError(400, "Enter a shop name.");
  if (!Number.isInteger(greenDays) || greenDays < 1 || greenDays > 3650) {
    throw new HttpError(400, "Green threshold must be a whole number of days.");
  }
  if (!Number.isInteger(orangeDays) || orangeDays <= greenDays || orangeDays > 3650) {
    throw new HttpError(400, "Orange threshold must be a whole number of days above the green threshold.");
  }
  if (!deliveryFee) throw new HttpError(400, "Enter a delivery fee in KD, up to 3 decimals.");
  if (notifications === null) throw new HttpError(400, "Choose whether notifications are on.");
  const rows = await raw<ShopRow>(
    `UPDATE shops
     SET name = $2, green_days = $3, orange_days = $4, delivery_fee = $5, notifications_enabled = $6
     WHERE id = $1
     RETURNING *`,
    [current.id, name, greenDays, orangeDays, deliveryFee, notifications],
  );
  return mapShop(rows[0]);
}

function fieldKey(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 32);
  return `custom_${slug || "field"}`;
}

export async function addField(input: Record<string, unknown>): Promise<MeasurementField> {
  await ensureReady();
  const shop = await getShopRow();
  const label = asText(input.label, 60);
  const labelAr = asText(input.labelAr, 60) || null;
  if (label.length < 2) throw new HttpError(400, "Enter a field name.");
  const base = fieldKey(label);
  const existing = await listFields(shop.id);
  let key = base;
  let suffix = 2;
  while (existing.some((field) => field.key === key)) {
    key = `${base}_${suffix}`;
    suffix += 1;
  }
  const sort = existing.reduce((max, field) => Math.max(max, field.sort_order), 0) + 1;
  const rows = await raw<FieldRow>(
    `INSERT INTO measurement_fields (shop_id, key, label, label_ar, is_custom, sort_order, active)
     VALUES ($1, $2, $3, $4, true, $5, true)
     RETURNING *`,
    [shop.id, key, label, labelAr, sort],
  );
  return mapField(rows[0]);
}

export async function removeField(id: string): Promise<void> {
  await ensureReady();
  const shop = await getShopRow();
  const rows = await raw<{ id: string }>(
    `UPDATE measurement_fields
     SET active = false
     WHERE id = $1 AND shop_id = $2 AND is_custom = true AND active = true
     RETURNING id`,
    [id, shop.id],
  );
  if (!rows[0]) throw new HttpError(404, "That custom field is not on this shop.");
}

export async function lockShop(client: pg.PoolClient, shopId: string): Promise<ShopRow> {
  const result = await client.query<ShopRow>("SELECT * FROM shops WHERE id = $1 FOR UPDATE", [shopId]);
  if (!result.rows[0]) throw new HttpError(500, "Shop was not created.");
  return result.rows[0];
}
