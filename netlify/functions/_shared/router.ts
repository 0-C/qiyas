import { ensureReady, json, raw } from "./db";
import { HttpError } from "./domain";
import { getEnv } from "./env";
import { maybeNotify } from "./messages";
import { seedDemo } from "./seed";
import {
  addMeasurement,
  createAdjustment,
  createCustomer,
  createOrder,
  dashboard,
  finishOrder,
  getCustomer,
  getOrder,
  getShopBundle,
  getTracking,
  payTracking,
  recordPayment,
  requestDelivery,
  search,
  updateCustomer,
  updateOrder,
} from "./data";
import { addField, removeField, updateShop } from "./shop";

const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

interface Route {
  method: string;
  re: RegExp;
  fn: (req: Request, params: Record<string, string>) => Promise<Response>;
}

function normalizePath(pathname: string): string {
  const marker = "/.netlify/functions/api";
  let path = pathname.startsWith(marker) ? `/api${pathname.slice(marker.length)}` : pathname;
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  return path;
}

export function requestOrigin(req: Request): string {
  const configured = (getEnv("PUBLIC_BASE_URL") || getEnv("DEPLOY_PRIME_URL") || getEnv("URL") || "").replace(/\/$/, "");
  const origin = req.headers.get("origin")?.replace(/\/$/, "") || "";
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
  if (origin && (origin === configured || local.test(origin))) return origin;
  if (configured) return configured;
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

async function readJson(req: Request): Promise<Record<string, unknown>> {
  const text = await req.text();
  if (!text) return {};
  try {
    const value = JSON.parse(text) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new HttpError(400, "Invalid JSON.");
    }
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "Invalid JSON.");
  }
}

async function health(): Promise<Response> {
  try {
    await ensureReady();
    await raw("SELECT 1 AS ok");
    return json({ ok: true, db: "ok" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database error";
    return json({ ok: false, db: "error", error: message }, 503);
  }
}

const routes: Route[] = [
  { method: "GET", re: /^\/api\/health$/, fn: () => health() },
  { method: "GET", re: /^\/api\/shop$/, fn: async () => json(await getShopBundle()) },
  {
    method: "PATCH",
    re: /^\/api\/shop$/,
    fn: async (req) => json({ shop: await updateShop(await readJson(req)) }),
  },
  {
    method: "POST",
    re: /^\/api\/fields$/,
    fn: async (req) => json({ field: await addField(await readJson(req)) }, 201),
  },
  {
    method: "DELETE",
    re: new RegExp(`^/api/fields/(?<id>${UUID})$`),
    fn: async (_req, params) => {
      await removeField(params.id);
      return json({ ok: true });
    },
  },
  { method: "GET", re: /^\/api\/dashboard$/, fn: async () => json(await dashboard()) },
  {
    method: "GET",
    re: /^\/api\/search$/,
    fn: async (req) => {
      const q = new URL(req.url).searchParams.get("q") ?? "";
      return json(await search(q));
    },
  },
  {
    method: "POST",
    re: /^\/api\/customers$/,
    fn: async (req) => json({ customer: await createCustomer(await readJson(req)) }, 201),
  },
  {
    method: "GET",
    re: new RegExp(`^/api/customers/(?<id>${UUID})$`),
    fn: async (_req, params) => json(await getCustomer(params.id)),
  },
  {
    method: "PATCH",
    re: new RegExp(`^/api/customers/(?<id>${UUID})$`),
    fn: async (req, params) => json({ customer: await updateCustomer(params.id, await readJson(req)) }),
  },
  {
    method: "POST",
    re: new RegExp(`^/api/customers/(?<id>${UUID})/measurements$`),
    fn: async (req, params) => json({ measurement: await addMeasurement(params.id, await readJson(req)) }, 201),
  },
  {
    method: "POST",
    re: new RegExp(`^/api/customers/(?<id>${UUID})/orders$`),
    fn: async (req, params) => {
      const order = await createOrder(params.id, await readJson(req));
      const message = await maybeNotify(order.id, requestOrigin(req));
      return json({ order: await getOrder(order.id), message }, 201);
    },
  },
  {
    method: "GET",
    re: new RegExp(`^/api/orders/(?<id>${UUID})$`),
    fn: async (_req, params) => json({ order: await getOrder(params.id) }),
  },
  {
    method: "PATCH",
    re: new RegExp(`^/api/orders/(?<id>${UUID})$`),
    fn: async (req, params) => json({ order: await updateOrder(params.id, await readJson(req)) }),
  },
  {
    method: "POST",
    re: new RegExp(`^/api/orders/(?<id>${UUID})/finish$`),
    fn: async (req, params) => {
      await finishOrder(params.id);
      await maybeNotify(params.id, requestOrigin(req));
      return json({ order: await getOrder(params.id) });
    },
  },
  {
    method: "POST",
    re: new RegExp(`^/api/orders/(?<id>${UUID})/payments$`),
    fn: async (req, params) => json({ order: await recordPayment(params.id, await readJson(req), "in_shop") }),
  },
  {
    method: "POST",
    re: new RegExp(`^/api/orders/(?<id>${UUID})/adjust$`),
    fn: async (req, params) => json({ order: await createAdjustment(params.id, await readJson(req)) }, 201),
  },
  {
    method: "POST",
    re: new RegExp(`^/api/orders/(?<id>${UUID})/messages$`),
    fn: async (req, params) => {
      const message = await maybeNotify(params.id, requestOrigin(req), { manual: true });
      return json({ message, order: await getOrder(params.id) });
    },
  },
  {
    method: "GET",
    re: /^\/api\/track\/(?<token>[0-9a-fA-F]{20,64})$/,
    fn: async (_req, params) => json(await getTracking(params.token)),
  },
  {
    method: "POST",
    re: /^\/api\/track\/(?<token>[0-9a-fA-F]{20,64})\/pay$/,
    fn: async (_req, params) => json(await payTracking(params.token)),
  },
  {
    method: "POST",
    re: /^\/api\/track\/(?<token>[0-9a-fA-F]{20,64})\/delivery$/,
    fn: async (_req, params) => json(await requestDelivery(params.token)),
  },
  {
    method: "POST",
    re: /^\/api\/seed$/,
    fn: async (req) => {
      if ((getEnv("ALLOW_SEED") || "true").toLowerCase() === "false") {
        return json({ error: "Demo seed is disabled." }, 403);
      }
      const body = await readJson(req);
      return json(await seedDemo(requestOrigin(req), body.reset === true));
    },
  },
];

export async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = normalizePath(url.pathname);
  const method = req.method.toUpperCase();
  try {
    let sawPath = false;
    for (const route of routes) {
      const match = route.re.exec(path);
      if (!match) continue;
      sawPath = true;
      if (route.method !== method) continue;
      return await route.fn(req, match.groups ?? {});
    }
    if (sawPath) return json({ error: "Method not allowed." }, 405);
    return json({ error: "Not found." }, 404);
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    console.error(error);
    return json({ error: "Something went wrong." }, 500);
  }
}
