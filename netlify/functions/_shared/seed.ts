import { ensureReady, raw } from "./db";
import { addDays, kuwaitToday, normalizePhone, trackingToken } from "./domain";
import { maybeNotify } from "./messages";
import { getShopRow } from "./shop";

interface DemoCustomer {
  name: string;
  phone: string;
  since: string;
  measuredDaysAgo: number;
  unit: "cm" | "in";
  method: "body" | "flat" | "finished";
  ease: boolean;
  values: Record<string, number>;
}

const PEOPLE: DemoCustomer[] = [
  {
    name: "Saud Al Sabah",
    phone: "51234678",
    since: "2023-02-17",
    measuredDaysAgo: 47,
    unit: "cm",
    method: "body",
    ease: true,
    values: { length: 148, shoulder: 46, chest: 108, waist: 102, hip: 110, sleeve: 64, wrist: 22, neck: 40 },
  },
  {
    name: "Fahad Al Mutairi",
    phone: "60012244",
    since: "2024-11-02",
    measuredDaysAgo: 120,
    unit: "cm",
    method: "body",
    ease: true,
    values: { length: 152, shoulder: 48, chest: 114, waist: 112, hip: 116, sleeve: 66, wrist: 23, neck: 42 },
  },
  {
    name: "Nasser Al Hajri",
    phone: "97770101",
    since: "2022-08-01",
    measuredDaysAgo: 210,
    unit: "cm",
    method: "finished",
    ease: false,
    values: { length: 146, shoulder: 45, chest: 104, waist: 98, hip: 106, sleeve: 63, wrist: 21, neck: 39 },
  },
  {
    name: "Jassim Al Otaibi",
    phone: "51109080",
    since: "2025-06-12",
    measuredDaysAgo: 10,
    unit: "cm",
    method: "flat",
    ease: false,
    values: { length: 150, shoulder: 47, chest: 110, waist: 100, hip: 108, sleeve: 65, wrist: 22, neck: 41 },
  },
  {
    name: "Bader Al Enezi",
    phone: "99881234",
    since: "2024-01-09",
    measuredDaysAgo: 30,
    unit: "cm",
    method: "body",
    ease: true,
    values: { length: 144, shoulder: 44, chest: 100, waist: 96, hip: 104, sleeve: 62, wrist: 20, neck: 38 },
  },
];

function atNoon(day: string): string {
  return `${day}T09:00:00.000Z`;
}

export async function seedDemo(origin: string, reset: boolean) {
  await ensureReady();
  const shop = await getShopRow();
  const existing = await raw<{ count: string }>("SELECT count(*)::text AS count FROM customers WHERE shop_id = $1", [
    shop.id,
  ]);
  const count = Number(existing[0]?.count ?? 0);
  if (!reset && count > 0) {
    return { seeded: false, message: "Shop already has customers.", customers: count };
  }
  if (reset) {
    await raw("DELETE FROM customers WHERE shop_id = $1", [shop.id]);
  }

  const today = kuwaitToday();
  const ids = new Map<string, { customerId: string; measurementId: string }>();

  for (const person of PEOPLE) {
    const phone = normalizePhone(person.phone);
    if (!phone) throw new Error(`Bad seed phone for ${person.name}`);
    const customer = await raw<{ id: string }>(
      `INSERT INTO customers (shop_id, name, phone, phone_digits, created_at)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [shop.id, person.name, phone.phone, phone.digits, atNoon(person.since)],
    );
    const takenOn = addDays(today, -person.measuredDaysAgo);
    const measurement = await raw<{ id: string }>(
      `INSERT INTO measurement_sets (shop_id, customer_id, taken_at, unit, method, ease_included, values)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       RETURNING id`,
      [
        shop.id,
        customer[0].id,
        atNoon(takenOn),
        person.unit,
        person.method,
        person.ease,
        JSON.stringify(person.values),
      ],
    );
    ids.set(person.name, { customerId: customer[0].id, measurementId: measurement[0].id });
  }

  const saud = ids.get("Saud Al Sabah")!;
  const fahad = ids.get("Fahad Al Mutairi")!;
  const nasser = ids.get("Nasser Al Hajri")!;
  const jassim = ids.get("Jassim Al Otaibi")!;
  const bader = ids.get("Bader Al Enezi")!;

  const tomorrow = addDays(today, 1);
  const yesterday = addDays(today, -1);
  const overdue = addDays(today, -3);
  const upcoming = addDays(today, 5);
  const finishedDay = addDays(today, -1);

  async function insertOrder(input: {
    customerId: string;
    measurementId: string;
    code: string;
    pieces: number;
    pieceLabel?: string;
    original: string;
    expected: string;
    total: string;
    paid: string;
    fabric: string;
    style: string;
    finished?: boolean;
    adjustment?: { parentCode: string; note: string };
  }) {
    const parent = input.adjustment
      ? await raw<{ id: string }>("SELECT id FROM orders WHERE shop_id = $1 AND code = $2", [
          shop.id,
          input.adjustment.parentCode,
        ])
      : [];
    const row = await raw<{ id: string }>(
      `INSERT INTO orders (
         shop_id, customer_id, measurement_set_id, code, piece_count, piece_label,
         original_due_date, expected_due_date, total_amount, amount_paid,
         fabric_notes, style_notes, production_status, finished_at, tracking_token,
         is_adjustment, parent_order_id, adjustment_note, created_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6,
         $7, $8, $9, $10,
         $11, $12, $13, $14, $15,
         $16, $17, $18, $19
       ) RETURNING id`,
      [
        shop.id,
        input.customerId,
        input.measurementId,
        input.code,
        input.pieces,
        input.pieceLabel ?? null,
        input.original,
        input.expected,
        input.total,
        input.paid,
        input.fabric,
        input.style,
        input.finished ? "finished" : "in_progress",
        input.finished ? atNoon(finishedDay) : null,
        trackingToken(),
        Boolean(input.adjustment),
        parent[0]?.id ?? null,
        input.adjustment?.note ?? null,
        atNoon(addDays(input.original, -4)),
      ],
    );
    if (Number(input.paid) > 0) {
      await raw(
        `INSERT INTO payments (order_id, amount, source, note, created_at)
         VALUES ($1, $2, 'in_shop', $3, $4)`,
        [row[0].id, input.paid, Number(input.paid) < Number(input.total) ? "Deposit at the counter" : "Paid in shop", atNoon(addDays(input.original, -4))],
      );
    }
    return row[0].id;
  }

  const orderIds = [
    await insertOrder({
      customerId: bader.customerId,
      measurementId: bader.measurementId,
      code: "6766",
      pieces: 2,
      original: addDays(today, -12),
      expected: addDays(today, -10),
      total: "20.000",
      paid: "20.000",
      fabric: "Sand Japanese cotton",
      style: "Kuwaiti collar, plain cuffs",
      finished: true,
    }),
    await insertOrder({
      customerId: saud.customerId,
      measurementId: saud.measurementId,
      code: "6767",
      pieces: 2,
      original: addDays(today, -18),
      expected: addDays(today, -16),
      total: "22.000",
      paid: "22.000",
      fabric: "Ivory cotton",
      style: "Hidden placket, one chest pocket",
      finished: true,
    }),
    await insertOrder({
      customerId: saud.customerId,
      measurementId: saud.measurementId,
      code: "6768",
      pieces: 2,
      original: tomorrow,
      expected: tomorrow,
      total: "24.000",
      paid: "0.000",
      fabric: "White Japanese cotton",
      style: "Kuwaiti collar, hidden buttons, single chest pocket",
    }),
    await insertOrder({
      customerId: fahad.customerId,
      measurementId: fahad.measurementId,
      code: "6769",
      pieces: 1,
      original: yesterday,
      expected: today,
      total: "18.500",
      paid: "8.000",
      fabric: "Pale blue royal oxford",
      style: "Stand collar, button cuffs",
    }),
    await insertOrder({
      customerId: nasser.customerId,
      measurementId: nasser.measurementId,
      code: "6770",
      pieces: 1,
      original: overdue,
      expected: overdue,
      total: "15.000",
      paid: "0.000",
      fabric: "Grey linen blend",
      style: "Summer weight, no pocket",
    }),
    await insertOrder({
      customerId: jassim.customerId,
      measurementId: jassim.measurementId,
      code: "6771",
      pieces: 3,
      original: upcoming,
      expected: upcoming,
      total: "45.000",
      paid: "45.000",
      fabric: "Cream Swiss cotton",
      style: "Formal Kuwaiti cut, covered buttons",
    }),
    await insertOrder({
      customerId: bader.customerId,
      measurementId: bader.measurementId,
      code: "6772",
      pieces: 1,
      pieceLabel: "6766-1",
      original: today,
      expected: today,
      total: "3.500",
      paid: "0.000",
      fabric: "Sand Japanese cotton",
      style: "Kuwaiti collar, plain cuffs",
      adjustment: { parentCode: "6766", note: "Shorten the hem by 2 cm and ease the cuff." },
    }),
  ];

  await raw("UPDATE shops SET next_order_code = 6773 WHERE id = $1", [shop.id]);

  for (const orderId of orderIds) {
    await maybeNotify(orderId, origin);
  }

  return { seeded: true, customers: PEOPLE.length, orders: orderIds.length };
}
