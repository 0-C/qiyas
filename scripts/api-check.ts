import { readFileSync } from "node:fs";
import { getPool, raw } from "../netlify/functions/_shared/db";
import { handle } from "../netlify/functions/_shared/router";
import { SCHEMA_SQL } from "../netlify/functions/_shared/schema";
import { loadEnvFile } from "./load-env";

loadEnvFile();
process.env.DATABASE_URL ||= "postgres://qiyas:qiyas@127.0.0.1:5432/qiyas";
process.env.PUBLIC_BASE_URL ||= "http://localhost:5173";

const fileSql = readFileSync("db/schema.sql", "utf8");
if (fileSql !== SCHEMA_SQL) {
  throw new Error("db/schema.sql and the bundled schema are out of sync.");
}

async function call(method: string, path: string, body?: unknown) {
  const response = await handle(
    new Request(`http://localhost:5173${path}`, {
      method,
      headers: body ? { "content-type": "application/json", origin: "http://localhost:5173" } : { origin: "http://localhost:5173" },
      body: body ? JSON.stringify(body) : undefined,
    }),
  );
  const data = (await response.json()) as Record<string, unknown>;
  return { status: response.status, data };
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const health = await call("GET", "/api/health");
assert(health.status === 200 && health.data.ok === true && health.data.db === "ok", `health failed ${JSON.stringify(health)}`);

const seeded = await call("POST", "/api/seed", { reset: true });
assert(seeded.status === 200 && seeded.data.seeded === true, `seed failed ${JSON.stringify(seeded)}`);

const board = await call("GET", "/api/dashboard");
assert(board.status === 200, "dashboard failed");
const groups = board.data.groups as Record<string, Array<{ code: string; isAdjustment: boolean }>>;
for (const name of ["overdue", "today", "tomorrow", "upcoming"]) {
  assert(groups[name]?.length, `missing ${name} group`);
}
const todayCodes = groups.today.map((order) => order.code);
assert(todayCodes.includes("6769"), "today should include Fahad");
assert(groups.today.some((order) => order.isAdjustment && order.code === "6772"), "today should include the adjustment");
assert(groups.overdue.some((order) => order.code === "6770"), "overdue code");
assert(groups.tomorrow.some((order) => order.code === "6768"), "tomorrow code");
assert(groups.upcoming.some((order) => order.code === "6771"), "upcoming code");

const byPhone = await call("GET", "/api/search?q=51234678");
assert(byPhone.data.result === "customer", "phone search");
const saudId = byPhone.data.customerId as string;

const byCode = await call("GET", "/api/search?q=6768");
assert(byCode.data.result === "order" && byCode.data.customerId === saudId, "code search");

const byLabel = await call("GET", "/api/search?q=6766-1");
assert(byLabel.data.result === "order", "piece label search");
const adjustment = await call("GET", `/api/orders/${byLabel.data.orderId as string}`);
assert((adjustment.data.order as { code: string }).code === "6772", "label should open the open adjustment");

const missing = await call("GET", "/api/search?q=50000000");
assert(missing.data.result === "create", "unknown phone should offer create");

const created = await call("POST", "/api/customers", { name: "Huda Al Test", phone: "55500011" });
assert(created.status === 201, `create customer ${JSON.stringify(created.data)}`);
const customerId = (created.data.customer as { id: string }).id;
const duplicate = await call("POST", "/api/customers", { name: "Huda Again", phone: "+965 5550 0011" });
assert(duplicate.status === 409, "duplicate phone");

const measurement = await call("POST", `/api/customers/${customerId}/measurements`, {
  unit: "cm",
  method: "body",
  easeIncluded: true,
  values: { length: 140, shoulder: 42, chest: 96, waist: 90, hip: 100, sleeve: 60, wrist: 18, neck: 36 },
});
assert(measurement.status === 201, "measurement");
const setId = (measurement.data.measurement as { id: string }).id;
const second = await call("POST", `/api/customers/${customerId}/measurements`, {
  unit: "cm",
  method: "flat",
  easeIncluded: false,
  values: { length: 141, shoulder: 42.5, chest: 97, waist: 91, hip: 101, sleeve: 60, wrist: 18, neck: 36 },
});
assert(second.status === 201, "second measurement");

const profile = await call("GET", `/api/customers/${customerId}`);
assert((profile.data.measurements as unknown[]).length === 2, "history keeps both sets");
assert((profile.data.customer as { isNew: boolean }).isNew === true, "new customer before an order");

const due = (profile.data.suggestedDueDate as string);
const orderResponse = await call("POST", `/api/customers/${customerId}/orders`, {
  measurementSetId: setId,
  pieceCount: 2,
  expectedDueDate: due,
  totalAmount: "21.500",
  amountPaid: "5.000",
  fabricNotes: "Test cotton",
  styleNotes: "Hidden buttons",
});
assert(orderResponse.status === 201, `order ${JSON.stringify(orderResponse.data)}`);
const order = orderResponse.data.order as {
  id: string;
  code: string;
  pieceLabels: string[];
  paymentStatus: string;
  originalDueDate: string;
  trackingPath: string;
  messages?: Array<{ template: string; status: string; channel: string }>;
};
assert(order.paymentStatus === "part_paid", "deposit is part-paid");
assert(order.pieceLabels.length === 2 && order.pieceLabels[0] === `${order.code}-1`, "piece labels");
assert(order.messages?.some((message) => message.template === "order_created_unpaid" && message.status === "logged"), "created message logged");

const later = await call("PATCH", `/api/orders/${order.id}`, { expectedDueDate: "2026-12-01" });
const moved = later.data.order as { expectedDueDate: string; originalDueDate: string };
assert(moved.expectedDueDate === "2026-12-01" && moved.originalDueDate === order.originalDueDate, "original date kept");

const paid = await call("POST", `/api/orders/${order.id}/payments`, { amount: "16.500", note: "Balance" });
assert((paid.data.order as { paymentStatus: string }).paymentStatus === "paid", "paid in shop");

const finished = await call("POST", `/api/orders/${order.id}/finish`);
const finishedOrder = finished.data.order as { productionStatus: string; finishedAt: string | null; messages: Array<{ template: string }> };
assert(finishedOrder.productionStatus === "finished" && finishedOrder.finishedAt, "finished");
assert(finishedOrder.messages.some((message) => message.template === "finished_paid"), "finished paid message");

const adjusted = await call("POST", `/api/orders/${order.id}/adjust`, {
  note: "Take in the waist by 1 cm",
  expectedDueDate: due,
  piece: 2,
});
assert(adjusted.status === 201, `adjust ${JSON.stringify(adjusted.data)}`);
const adj = adjusted.data.order as { isAdjustment: boolean; pieceLabel: string; parentCode: string };
assert(adj.isAdjustment && adj.pieceLabel === `${order.code}-2` && adj.parentCode === order.code, "adjustment record");

const token = order.trackingPath.split("/").pop();
const unpaid = await call("POST", `/api/customers/${customerId}/orders`, {
  measurementSetId: setId,
  pieceCount: 1,
  expectedDueDate: due,
  totalAmount: "10.000",
  amountPaid: "0",
  fabricNotes: "",
  styleNotes: "",
});
const unpaidOrder = unpaid.data.order as { trackingPath: string; id: string };
const unpaidToken = unpaidOrder.trackingPath.split("/").pop();
const track = await call("GET", `/api/track/${unpaidToken}`);
assert(track.status === 200 && (track.data.balance as string) === "10.000", "tracking balance");
const delivered = await call("POST", `/api/track/${unpaidToken}/delivery`);
assert((delivered.data.balance as string) === "11.250", `delivery fee ${delivered.data.balance}`);
assert(delivered.data.handoverStatus === "delivery_requested", "delivery requested");
const mockPay = await call("POST", `/api/track/${unpaidToken}/pay`);
assert(mockPay.data.paymentStatus === "paid" && mockPay.data.balance === "0.000", "mock pay");

const field = await call("POST", "/api/fields", { label: "Cuff opening", labelAr: "فتحة الكم" });
assert(field.status === 201, "custom field");
const fieldId = (field.data.field as { id: string }).id;
const removed = await call("DELETE", `/api/fields/${fieldId}`);
assert(removed.status === 200, "remove field");

await raw("DELETE FROM customers WHERE id = $1", [customerId]);
console.log("API check passed.");
console.log(`Demo orders kept. Finished-order token ${token ? "present" : "missing"}.`);
await getPool().end();
