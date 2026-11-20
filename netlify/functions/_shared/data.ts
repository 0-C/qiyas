import type pg from "pg";
import { ensureReady, raw, withTx } from "./db";
import {
  HttpError,
  type DueGroup,
  type HandoverStatus,
  type MeasureMethod,
  type MeasureUnit,
  type PaymentStatus,
  type ProductionStatus,
  addDays,
  asBoolean,
  asText,
  dueGroup,
  firstName,
  formatLong,
  fromFils,
  isUniqueViolation,
  kuwaitDate,
  kuwaitToday,
  measurementAge,
  normalizePhone,
  parseDate,
  parseKd,
  paymentStatus,
  pieceLabelList,
  toFils,
  trackingToken,
} from "./domain";
import { getShopRow, listFields, lockShop, mapField, mapShop, type MeasurementField, type Shop } from "./shop";

interface CustomerRow {
  id: string;
  shop_id: string;
  name: string;
  phone: string;
  phone_digits: string;
  created_at: Date;
}

interface MeasurementRow {
  id: string;
  customer_id: string;
  taken_at: Date;
  unit: MeasureUnit;
  method: MeasureMethod;
  ease_included: boolean;
  values: Record<string, number>;
}

interface OrderRow {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  measurement_set_id: string | null;
  code: string;
  piece_count: number;
  piece_label: string | null;
  original_due_date: string;
  expected_due_date: string;
  total_amount: string;
  amount_paid: string;
  balance: string;
  delivery_fee_applied: boolean;
  fabric_notes: string;
  style_notes: string;
  production_status: ProductionStatus;
  finished_at: Date | null;
  handover_status: HandoverStatus;
  tracking_token: string;
  notifications_muted: boolean;
  is_adjustment: boolean;
  parent_order_id: string | null;
  parent_code: string | null;
  adjustment_note: string | null;
  created_at: Date;
}

interface PaymentRow {
  id: string;
  order_id: string;
  amount: string;
  source: "in_shop" | "link";
  note: string;
  created_at: Date;
}

interface MessageRow {
  id: string;
  order_id: string;
  channel: string;
  template: string;
  body: string;
  status: string;
  provider: string;
  detail: string | null;
  created_at: Date;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  createdAt: string;
  createdOn: string;
  daysAsCustomer: number;
  isNew: boolean;
}

export interface MeasurementSet {
  id: string;
  takenAt: string;
  takenOn: string;
  unit: MeasureUnit;
  method: MeasureMethod;
  easeIncluded: boolean;
  values: Record<string, number>;
  ageDays: number;
  ageTone: "green" | "orange" | "red";
  ageBand: string;
  agePhrase: string;
}

export interface Payment {
  id: string;
  amount: string;
  source: "in_shop" | "link";
  note: string;
  createdAt: string;
}

export interface MessageLog {
  id: string;
  channel: string;
  template: string;
  text: string;
  status: string;
  provider: string;
  detail: string | null;
  createdAt: string;
}

export interface Order {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  measurementSetId: string | null;
  code: string;
  pieceCount: number;
  pieceLabels: string[];
  pieceLabel: string | null;
  originalDueDate: string;
  expectedDueDate: string;
  totalAmount: string;
  amountPaid: string;
  balance: string;
  deliveryFeeApplied: boolean;
  fabricNotes: string;
  styleNotes: string;
  productionStatus: ProductionStatus;
  finishedAt: string | null;
  handoverStatus: HandoverStatus;
  trackingPath: string;
  notificationsMuted: boolean;
  isAdjustment: boolean;
  parentOrderId: string | null;
  parentCode: string | null;
  adjustmentNote: string | null;
  paymentStatus: PaymentStatus;
  dueGroup: DueGroup;
  createdAt: string;
  payments?: Payment[];
  messages?: MessageLog[];
}

const ORDER_SELECT = `
SELECT
  o.id,
  o.customer_id,
  c.name AS customer_name,
  c.phone AS customer_phone,
  o.measurement_set_id,
  o.code,
  o.piece_count,
  o.piece_label,
  o.original_due_date::text AS original_due_date,
  o.expected_due_date::text AS expected_due_date,
  o.total_amount::text AS total_amount,
  o.amount_paid::text AS amount_paid,
  (o.total_amount - o.amount_paid)::text AS balance,
  o.delivery_fee_applied,
  o.fabric_notes,
  o.style_notes,
  o.production_status,
  o.finished_at,
  o.handover_status,
  o.tracking_token,
  o.notifications_muted,
  o.is_adjustment,
  o.parent_order_id,
  p.code AS parent_code,
  o.adjustment_note,
  o.created_at
FROM orders o
JOIN customers c ON c.id = o.customer_id
LEFT JOIN orders p ON p.id = o.parent_order_id
`;

const HANDOVERS = new Set<HandoverStatus>([
  "awaiting_collection",
  "delivery_requested",
  "with_driver",
  "delivered",
]);

function money(value: string): string {
  return fromFils(toFils(value));
}

function mapCustomer(row: CustomerRow, orderCount: number, today: string): Customer {
  const createdOn = kuwaitDate(row.created_at);
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    createdAt: new Date(row.created_at).toISOString(),
    createdOn,
    daysAsCustomer: Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${createdOn}T00:00:00Z`)) / 86_400_000)),
    isNew: orderCount === 0,
  };
}

function mapMeasurement(row: MeasurementRow, greenDays: number, orangeDays: number, today: string): MeasurementSet {
  const values: Record<string, number> = {};
  for (const [key, value] of Object.entries(row.values ?? {})) {
    const number = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(number)) values[key] = number;
  }
  return {
    id: row.id,
    takenAt: new Date(row.taken_at).toISOString(),
    takenOn: kuwaitDate(row.taken_at),
    unit: row.unit,
    method: row.method,
    easeIncluded: row.ease_included,
    values,
    ...measurementAge(row.taken_at, greenDays, orangeDays, today),
  };
}

function mapOrder(row: OrderRow, today: string, extras?: { payments?: Payment[]; messages?: MessageLog[] }): Order {
  const total = money(row.total_amount);
  const paid = money(row.amount_paid);
  const balance = money(row.balance);
  return {
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    measurementSetId: row.measurement_set_id,
    code: row.code,
    pieceCount: row.piece_count,
    pieceLabels: pieceLabelList(row.code, row.piece_count, row.piece_label),
    pieceLabel: row.piece_label,
    originalDueDate: row.original_due_date,
    expectedDueDate: row.expected_due_date,
    totalAmount: total,
    amountPaid: paid,
    balance,
    deliveryFeeApplied: row.delivery_fee_applied,
    fabricNotes: row.fabric_notes,
    styleNotes: row.style_notes,
    productionStatus: row.production_status,
    finishedAt: row.finished_at ? new Date(row.finished_at).toISOString() : null,
    handoverStatus: row.handover_status,
    trackingPath: `/t/${row.tracking_token}`,
    notificationsMuted: row.notifications_muted,
    isAdjustment: row.is_adjustment,
    parentOrderId: row.parent_order_id,
    parentCode: row.parent_code,
    adjustmentNote: row.adjustment_note,
    paymentStatus: paymentStatus(total, paid),
    dueGroup: dueGroup(row.expected_due_date, today, row.production_status),
    createdAt: new Date(row.created_at).toISOString(),
    payments: extras?.payments,
    messages: extras?.messages,
  };
}

async function hydrate(rows: OrderRow[], today: string, full: boolean): Promise<Order[]> {
  if (!full || rows.length === 0) return rows.map((row) => mapOrder(row, today));
  const ids = rows.map((row) => row.id);
  const payments = await raw<PaymentRow>(
    "SELECT * FROM payments WHERE order_id = ANY($1::uuid[]) ORDER BY created_at",
    [ids],
  );
  const messages = await raw<MessageRow>(
    "SELECT * FROM messages WHERE order_id = ANY($1::uuid[]) ORDER BY created_at",
    [ids],
  );
  return rows.map((row) =>
    mapOrder(row, today, {
      payments: payments
        .filter((payment) => payment.order_id === row.id)
        .map((payment) => ({
          id: payment.id,
          amount: money(payment.amount),
          source: payment.source,
          note: payment.note,
          createdAt: new Date(payment.created_at).toISOString(),
        })),
      messages: messages
        .filter((message) => message.order_id === row.id)
        .map((message) => ({
          id: message.id,
          channel: message.channel,
          template: message.template,
          text: message.body,
          status: message.status,
          provider: message.provider,
          detail: message.detail,
          createdAt: new Date(message.created_at).toISOString(),
        })),
    }),
  );
}

async function readyShop() {
  await ensureReady();
  return getShopRow();
}

export async function getShopBundle(): Promise<{ shop: Shop; fields: MeasurementField[] }> {
  const shop = await readyShop();
  const fields = await listFields(shop.id);
  return { shop: mapShop(shop), fields: fields.map(mapField) };
}

export async function dashboard() {
  const shop = await readyShop();
  const today = kuwaitToday();
  const rows = await raw<OrderRow>(
    `${ORDER_SELECT}
     WHERE o.shop_id = $1 AND o.production_status = 'in_progress'
     ORDER BY o.expected_due_date, o.code`,
    [shop.id],
  );
  const orders = await hydrate(rows, today, false);
  const groups: Record<"overdue" | "today" | "tomorrow" | "upcoming", Order[]> = {
    overdue: [],
    today: [],
    tomorrow: [],
    upcoming: [],
  };
  for (const order of orders) {
    if (order.dueGroup === "past") continue;
    groups[order.dueGroup].push(order);
  }
  return { shop: mapShop(shop), today, groups };
}

export async function search(query: string) {
  const shop = await readyShop();
  const trimmed = query.trim();
  if (!trimmed) throw new HttpError(400, "Enter a phone number or label code.");
  const compact = trimmed.replace(/\s+/g, "");
  const codeMatch = compact.match(/^(\d{3,6})(?:-(\d{1,2}))?$/);
  const phone = normalizePhone(trimmed);
  const looksLikeCode = Boolean(codeMatch) && (compact.includes("-") || compact.length <= 6);

  if (looksLikeCode && codeMatch) {
    const piece = codeMatch[2] ? Number(codeMatch[2]) : null;
    const found = await findByCode(shop.id, codeMatch[1], piece);
    if (found) return { result: "order" as const, customerId: found.customerId, orderId: found.id };
    if (!phone) {
      return { result: "none" as const, message: `No order found for code ${compact}.` };
    }
  }

  if (phone) {
    const customers = await raw<{ id: string }>(
      "SELECT id FROM customers WHERE shop_id = $1 AND phone_digits = $2",
      [shop.id, phone.digits],
    );
    if (customers[0]) return { result: "customer" as const, customerId: customers[0].id };
    return { result: "create" as const, phone: phone.phone };
  }

  return {
    result: "none" as const,
    message: `No match for “${trimmed}”. Enter a phone number or a label code.`,
  };
}

async function findByCode(shopId: string, code: string, piece: number | null) {
  if (piece != null) {
    const label = `${code}-${piece}`;
    const adjustment = await raw<{ id: string; customer_id: string }>(
      `SELECT id, customer_id FROM orders
       WHERE shop_id = $1 AND piece_label = $2 AND production_status = 'in_progress'
       ORDER BY created_at DESC
       LIMIT 1`,
      [shopId, label],
    );
    if (adjustment[0]) return { id: adjustment[0].id, customerId: adjustment[0].customer_id };
  }
  const rows = await raw<{ id: string; customer_id: string; piece_count: number }>(
    `SELECT id, customer_id, piece_count FROM orders
     WHERE shop_id = $1 AND code = $2
     ORDER BY CASE WHEN production_status = 'in_progress' THEN 0 ELSE 1 END, created_at DESC`,
    [shopId, code],
  );
  if (rows.length === 0) return null;
  if (piece == null) return { id: rows[0].id, customerId: rows[0].customer_id };
  const valid = rows.find((row) => piece >= 1 && piece <= row.piece_count);
  if (!valid) return null;
  return { id: valid.id, customerId: valid.customer_id };
}

export async function createCustomer(input: Record<string, unknown>): Promise<Customer> {
  const shop = await readyShop();
  const name = asText(input.name, 80);
  const phone = normalizePhone(typeof input.phone === "string" ? input.phone : "");
  if (name.length < 2) throw new HttpError(400, "Enter the customer's name.");
  if (!phone) throw new HttpError(400, "Enter a phone number, for example 5123 4678.");
  try {
    const rows = await raw<CustomerRow>(
      `INSERT INTO customers (shop_id, name, phone, phone_digits)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [shop.id, name, phone.phone, phone.digits],
    );
    return mapCustomer(rows[0], 0, kuwaitToday());
  } catch (error) {
    if (isUniqueViolation(error)) throw new HttpError(409, "A customer with this phone is already on file.");
    throw error;
  }
}

export async function updateCustomer(id: string, input: Record<string, unknown>): Promise<Customer> {
  const shop = await readyShop();
  const name = asText(input.name, 80);
  const phone = normalizePhone(typeof input.phone === "string" ? input.phone : "");
  if (name.length < 2) throw new HttpError(400, "Enter the customer's name.");
  if (!phone) throw new HttpError(400, "Enter a phone number, for example 5123 4678.");
  try {
    const rows = await raw<CustomerRow>(
      `UPDATE customers SET name = $3, phone = $4, phone_digits = $5
       WHERE id = $1 AND shop_id = $2
       RETURNING *`,
      [id, shop.id, name, phone.phone, phone.digits],
    );
    if (!rows[0]) throw new HttpError(404, "Customer not found.");
    const orders = await raw<{ count: string }>(
      "SELECT count(*)::text AS count FROM orders WHERE customer_id = $1",
      [id],
    );
    return mapCustomer(rows[0], Number(orders[0]?.count ?? 0), kuwaitToday());
  } catch (error) {
    if (isUniqueViolation(error)) throw new HttpError(409, "A customer with this phone is already on file.");
    throw error;
  }
}

export async function getCustomer(id: string) {
  const shop = await readyShop();
  const today = kuwaitToday();
  const customers = await raw<CustomerRow>("SELECT * FROM customers WHERE id = $1 AND shop_id = $2", [id, shop.id]);
  if (!customers[0]) throw new HttpError(404, "Customer not found.");
  const fields = await listFields(shop.id);
  const sets = await raw<MeasurementRow>(
    "SELECT * FROM measurement_sets WHERE customer_id = $1 ORDER BY taken_at DESC",
    [id],
  );
  const orderRows = await raw<OrderRow>(
    `${ORDER_SELECT} WHERE o.customer_id = $1 AND o.shop_id = $2 ORDER BY o.created_at DESC`,
    [id, shop.id],
  );
  const orders = await hydrate(orderRows, today, true);
  return {
    today,
    shop: mapShop(shop),
    fields: fields.map(mapField),
    customer: mapCustomer(customers[0], orderRows.length, today),
    measurements: sets.map((set) => mapMeasurement(set, shop.green_days, shop.orange_days, today)),
    orders,
    suggestedDueDate: defaultDueDate(),
  };
}

export async function addMeasurement(customerId: string, input: Record<string, unknown>, takenAt?: string) {
  const shop = await readyShop();
  const customer = await raw<{ id: string }>("SELECT id FROM customers WHERE id = $1 AND shop_id = $2", [
    customerId,
    shop.id,
  ]);
  if (!customer[0]) throw new HttpError(404, "Customer not found.");
  const unit = input.unit === "in" || input.unit === "cm" ? input.unit : null;
  const method = input.method === "body" || input.method === "flat" || input.method === "finished" ? input.method : null;
  const ease = asBoolean(input.easeIncluded);
  if (!unit || !method || ease === null) {
    throw new HttpError(400, "Choose a unit, how the set was taken, and whether ease is included.");
  }
  const fields = (await listFields(shop.id)).filter((field) => field.active);
  const source = input.values;
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new HttpError(400, "Enter the measurements.");
  }
  const values: Record<string, number> = {};
  for (const field of fields) {
    const rawValue = (source as Record<string, unknown>)[field.key];
    const number = typeof rawValue === "number" ? rawValue : typeof rawValue === "string" ? Number(rawValue) : NaN;
    if (!Number.isFinite(number) || number <= 0 || number > 500) {
      throw new HttpError(400, `Enter a measurement for ${field.label}.`);
    }
    values[field.key] = Math.round(number * 10) / 10;
  }
  const rows = await raw<MeasurementRow>(
    `INSERT INTO measurement_sets (shop_id, customer_id, taken_at, unit, method, ease_included, values)
     VALUES ($1, $2, COALESCE($3::timestamptz, now()), $4, $5, $6, $7::jsonb)
     RETURNING *`,
    [shop.id, customerId, takenAt ?? null, unit, method, ease, JSON.stringify(values)],
  );
  return mapMeasurement(rows[0], shop.green_days, shop.orange_days, kuwaitToday());
}

async function insertPayment(client: pg.PoolClient, orderId: string, amount: string, source: "in_shop" | "link", note: string) {
  if (toFils(amount) <= 0) return;
  await client.query(
    `INSERT INTO payments (order_id, amount, source, note) VALUES ($1, $2, $3, $4)`,
    [orderId, amount, source, note],
  );
}

export async function createOrder(customerId: string, input: Record<string, unknown>) {
  const shop = await readyShop();
  const measurementSetId = typeof input.measurementSetId === "string" ? input.measurementSetId : "";
  const pieceCount = Number(input.pieceCount);
  const expected = parseDate(input.expectedDueDate);
  const total = parseKd(input.totalAmount);
  const paid = parseKd(input.amountPaid ?? "0");
  const fabric = asText(input.fabricNotes, 2000);
  const style = asText(input.styleNotes, 2000);
  if (!measurementSetId) throw new HttpError(400, "Choose a measurement set.");
  if (!Number.isInteger(pieceCount) || pieceCount < 1 || pieceCount > 20) {
    throw new HttpError(400, "Enter a quantity from 1 to 20.");
  }
  if (!expected) throw new HttpError(400, "Choose the expected completion date.");
  if (!total || !paid) throw new HttpError(400, "Enter the total and deposit in KD, up to 3 decimals.");
  if (toFils(paid) > toFils(total)) throw new HttpError(400, "The deposit cannot be more than the total.");

  const orderId = await withTx(async (client) => {
    const locked = await lockShop(client, shop.id);
    const owner = await client.query("SELECT id FROM customers WHERE id = $1 AND shop_id = $2", [customerId, shop.id]);
    if (!owner.rows[0]) throw new HttpError(404, "Customer not found.");
    const set = await client.query(
      "SELECT id FROM measurement_sets WHERE id = $1 AND customer_id = $2 AND shop_id = $3",
      [measurementSetId, customerId, shop.id],
    );
    if (!set.rows[0]) throw new HttpError(400, "That measurement set is not on this customer.");
    const code = String(locked.next_order_code);
    await client.query("UPDATE shops SET next_order_code = next_order_code + 1 WHERE id = $1", [shop.id]);
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO orders (
         shop_id, customer_id, measurement_set_id, code, piece_count,
         original_due_date, expected_due_date, total_amount, amount_paid,
         fabric_notes, style_notes, tracking_token
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $6, $7, $8,
         $9, $10, $11
       ) RETURNING id`,
      [shop.id, customerId, measurementSetId, code, pieceCount, expected, total, paid, fabric, style, trackingToken()],
    );
    await insertPayment(client, inserted.rows[0].id, paid, "in_shop", "Deposit at the counter");
    return inserted.rows[0].id;
  });
  return getOrder(orderId);
}

export async function getOrder(id: string): Promise<Order> {
  const shop = await readyShop();
  const rows = await raw<OrderRow>(`${ORDER_SELECT} WHERE o.id = $1 AND o.shop_id = $2`, [id, shop.id]);
  if (!rows[0]) throw new HttpError(404, "Order not found.");
  const [order] = await hydrate(rows, kuwaitToday(), true);
  return order;
}

export async function updateOrder(id: string, input: Record<string, unknown>): Promise<Order> {
  const shop = await readyShop();
  const current = await raw<OrderRow>(`${ORDER_SELECT} WHERE o.id = $1 AND o.shop_id = $2`, [id, shop.id]);
  if (!current[0]) throw new HttpError(404, "Order not found.");
  const sets: string[] = [];
  const params: unknown[] = [id, shop.id];
  if ("expectedDueDate" in input) {
    if (current[0].production_status !== "in_progress") {
      throw new HttpError(400, "The expected date stays with open work. This order is already finished.");
    }
    const expected = parseDate(input.expectedDueDate);
    if (!expected) throw new HttpError(400, "Choose a valid expected date.");
    params.push(expected);
    sets.push(`expected_due_date = $${params.length}`);
  }
  if ("handoverStatus" in input) {
    const handover = input.handoverStatus;
    if (typeof handover !== "string" || !HANDOVERS.has(handover as HandoverStatus)) {
      throw new HttpError(400, "Choose a handover status.");
    }
    params.push(handover);
    sets.push(`handover_status = $${params.length}`);
    const movingToDelivery = handover === "delivery_requested" || handover === "with_driver";
    if (movingToDelivery) {
      params.push(money(shop.delivery_fee));
      sets.push(
        `total_amount = total_amount + CASE WHEN delivery_fee_applied THEN 0 ELSE $${params.length}::numeric END`,
      );
      sets.push("delivery_fee_applied = true");
    }
  }
  if ("notificationsMuted" in input) {
    const muted = asBoolean(input.notificationsMuted);
    if (muted === null) throw new HttpError(400, "Choose whether messages are muted.");
    params.push(muted);
    sets.push(`notifications_muted = $${params.length}`);
  }
  if (sets.length === 0) throw new HttpError(400, "Nothing to update.");
  sets.push("updated_at = now()");
  await raw(`UPDATE orders SET ${sets.join(", ")} WHERE id = $1 AND shop_id = $2`, params);
  return getOrder(id);
}

export async function finishOrder(id: string): Promise<Order> {
  const shop = await readyShop();
  const rows = await raw<{ id: string }>(
    `UPDATE orders
     SET production_status = 'finished', finished_at = now(), updated_at = now()
     WHERE id = $1 AND shop_id = $2 AND production_status = 'in_progress'
     RETURNING id`,
    [id, shop.id],
  );
  if (!rows[0]) {
    const exists = await raw("SELECT id FROM orders WHERE id = $1 AND shop_id = $2", [id, shop.id]);
    if (!exists[0]) throw new HttpError(404, "Order not found.");
    throw new HttpError(400, "This order is already finished.");
  }
  return getOrder(id);
}

export async function recordPayment(id: string, input: Record<string, unknown>, source: "in_shop" | "link"): Promise<Order> {
  const shop = await readyShop();
  const amount = parseKd(input.amount);
  const note = asText(input.note, 200) || (source === "link" ? "Paid from the customer link" : "In-shop payment");
  if (!amount || toFils(amount) <= 0) throw new HttpError(400, "Enter a payment amount.");
  await withTx(async (client) => {
    const locked = await client.query<OrderRow>(
      `${ORDER_SELECT} WHERE o.id = $1 AND o.shop_id = $2 FOR UPDATE OF o`,
      [id, shop.id],
    );
    const row = locked.rows[0];
    if (!row) throw new HttpError(404, "Order not found.");
    if (toFils(amount) > toFils(money(row.balance))) {
      throw new HttpError(400, `The balance is KD ${money(row.balance)}.`);
    }
    await client.query(
      "UPDATE orders SET amount_paid = amount_paid + $2, updated_at = now() WHERE id = $1",
      [id, amount],
    );
    await insertPayment(client, id, amount, source, note);
  });
  return getOrder(id);
}

export async function payBalance(id: string, source: "in_shop" | "link"): Promise<Order> {
  const order = await getOrder(id);
  if (toFils(order.balance) <= 0) return order;
  return recordPayment(id, { amount: order.balance, note: source === "link" ? "Paid from the customer link" : "Balance paid in shop" }, source);
}

export async function createAdjustment(id: string, input: Record<string, unknown>): Promise<Order> {
  const shop = await readyShop();
  const note = asText(input.note, 500);
  const expected = parseDate(input.expectedDueDate);
  if (note.length < 3) throw new HttpError(400, "Describe the alteration.");
  if (!expected) throw new HttpError(400, "Choose a new due date.");
  const piece = input.piece == null || input.piece === "" ? null : Number(input.piece);
  const orderId = await withTx(async (client) => {
    await lockShop(client, shop.id);
    const parentResult = await client.query<OrderRow>(
      `${ORDER_SELECT} WHERE o.id = $1 AND o.shop_id = $2 FOR UPDATE OF o`,
      [id, shop.id],
    );
    const parent = parentResult.rows[0];
    if (!parent) throw new HttpError(404, "Order not found.");
    if (parent.production_status !== "finished") {
      throw new HttpError(400, "Re-adjust is for a finished order. This one is still open.");
    }
    let pieceLabel = `${parent.code}-1`;
    if (parent.piece_count > 1) {
      if (!Number.isInteger(piece) || piece == null || piece < 1 || piece > parent.piece_count) {
        throw new HttpError(400, "Choose the piece that needs the alteration.");
      }
      pieceLabel = `${parent.code}-${piece}`;
    }
    const locked = await client.query<{ next_order_code: number }>("SELECT next_order_code FROM shops WHERE id = $1", [
      shop.id,
    ]);
    const code = String(locked.rows[0].next_order_code);
    await client.query("UPDATE shops SET next_order_code = next_order_code + 1 WHERE id = $1", [shop.id]);
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO orders (
         shop_id, customer_id, measurement_set_id, code, piece_count, piece_label,
         original_due_date, expected_due_date, total_amount, amount_paid,
         fabric_notes, style_notes, tracking_token, is_adjustment, parent_order_id, adjustment_note
       ) VALUES (
         $1, $2, $3, $4, 1, $5,
         $6, $6, 0, 0,
         $7, $8, $9, true, $10, $11
       ) RETURNING id`,
      [
        shop.id,
        parent.customer_id,
        parent.measurement_set_id,
        code,
        pieceLabel,
        expected,
        parent.fabric_notes,
        parent.style_notes,
        trackingToken(),
        parent.id,
        note,
      ],
    );
    return inserted.rows[0].id;
  });
  return getOrder(orderId);
}

export interface Tracking {
  shopName: string;
  customerFirstName: string;
  code: string;
  pieceCount: number;
  pieceLabels: string[];
  isAdjustment: boolean;
  productionStatus: ProductionStatus;
  finishedAt: string | null;
  expectedDueDate: string;
  originalDueDate: string;
  expectedLabel: string;
  paymentStatus: PaymentStatus;
  totalAmount: string;
  amountPaid: string;
  balance: string;
  handoverStatus: HandoverStatus;
  deliveryFee: string;
  deliveryFeeApplied: boolean;
  today: string;
}

function toTracking(order: Order, shopName: string, deliveryFee: string, today: string): Tracking {
  return {
    shopName,
    customerFirstName: firstName(order.customerName),
    code: order.code,
    pieceCount: order.pieceCount,
    pieceLabels: order.pieceLabels,
    isAdjustment: order.isAdjustment,
    productionStatus: order.productionStatus,
    finishedAt: order.finishedAt,
    expectedDueDate: order.expectedDueDate,
    originalDueDate: order.originalDueDate,
    expectedLabel: formatLong(order.expectedDueDate),
    paymentStatus: order.paymentStatus,
    totalAmount: order.totalAmount,
    amountPaid: order.amountPaid,
    balance: order.balance,
    handoverStatus: order.handoverStatus,
    deliveryFee,
    deliveryFeeApplied: order.deliveryFeeApplied,
    today,
  };
}

async function orderByToken(token: string): Promise<{ order: Order; shopName: string; deliveryFee: string; today: string }> {
  await ensureReady();
  const rows = await raw<{ id: string }>("SELECT id FROM orders WHERE tracking_token = $1", [token]);
  if (!rows[0]) throw new HttpError(404, "This tracking link is not valid.");
  const order = await getOrder(rows[0].id);
  const shop = await getShopRow();
  return { order, shopName: shop.name, deliveryFee: money(shop.delivery_fee), today: kuwaitToday() };
}

export async function getTracking(token: string): Promise<Tracking> {
  const found = await orderByToken(token);
  return toTracking(found.order, found.shopName, found.deliveryFee, found.today);
}

export async function payTracking(token: string): Promise<Tracking> {
  const found = await orderByToken(token);
  await payBalance(found.order.id, "link");
  return getTracking(token);
}

export async function requestDelivery(token: string): Promise<Tracking> {
  const found = await orderByToken(token);
  if (found.order.handoverStatus === "with_driver" || found.order.handoverStatus === "delivered") {
    throw new HttpError(400, "This order is already on its way or has been delivered.");
  }
  await updateOrder(found.order.id, { handoverStatus: "delivery_requested" });
  return getTracking(token);
}

export function defaultDueDate(): string {
  return addDays(kuwaitToday(), 7);
}

