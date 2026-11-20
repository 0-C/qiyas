import type {
  Customer,
  CustomerProfile,
  DashboardData,
  MeasurementField,
  MeasurementSet,
  MessageLog,
  Order,
  SearchResult,
  Shop,
  Tracking,
} from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(path, { ...init, headers });
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data as T;
}

export const api = {
  shop: () => request<{ shop: Shop; fields: MeasurementField[] }>("/api/shop"),
  updateShop: (body: {
    name: string;
    greenDays: number;
    orangeDays: number;
    deliveryFee: string;
    notificationsEnabled: boolean;
  }) => request<{ shop: Shop }>("/api/shop", { method: "PATCH", body: JSON.stringify(body) }),
  addField: (body: { label: string; labelAr?: string }) =>
    request<{ field: MeasurementField }>("/api/fields", { method: "POST", body: JSON.stringify(body) }),
  removeField: (id: string) => request<{ ok: true }>(`/api/fields/${id}`, { method: "DELETE" }),
  dashboard: () => request<DashboardData>("/api/dashboard"),
  search: (q: string) => request<SearchResult>(`/api/search?q=${encodeURIComponent(q)}`),
  createCustomer: (body: { name: string; phone: string }) =>
    request<{ customer: Customer }>("/api/customers", { method: "POST", body: JSON.stringify(body) }),
  updateCustomer: (id: string, body: { name: string; phone: string }) =>
    request<{ customer: Customer }>(`/api/customers/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  customer: (id: string) => request<CustomerProfile>(`/api/customers/${id}`),
  addMeasurement: (
    id: string,
    body: { unit: string; method: string; easeIncluded: boolean; values: Record<string, string> },
  ) => request<{ measurement: MeasurementSet }>(`/api/customers/${id}/measurements`, { method: "POST", body: JSON.stringify(body) }),
  createOrder: (id: string, body: Record<string, unknown>) =>
    request<{ order: Order; message: MessageLog | null }>(`/api/customers/${id}/orders`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateOrder: (id: string, body: Record<string, unknown>) =>
    request<{ order: Order }>(`/api/orders/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  finishOrder: (id: string) => request<{ order: Order }>(`/api/orders/${id}/finish`, { method: "POST", body: "{}" }),
  payOrder: (id: string, body: { amount: string; note?: string }) =>
    request<{ order: Order }>(`/api/orders/${id}/payments`, { method: "POST", body: JSON.stringify(body) }),
  adjustOrder: (id: string, body: { note: string; expectedDueDate: string; piece?: number }) =>
    request<{ order: Order }>(`/api/orders/${id}/adjust`, { method: "POST", body: JSON.stringify(body) }),
  sendMessage: (id: string) =>
    request<{ order: Order; message: MessageLog | null }>(`/api/orders/${id}/messages`, { method: "POST", body: "{}" }),
  track: (token: string) => request<Tracking>(`/api/track/${token}`),
  payTrack: (token: string) => request<Tracking>(`/api/track/${token}/pay`, { method: "POST", body: "{}" }),
  deliverTrack: (token: string) => request<Tracking>(`/api/track/${token}/delivery`, { method: "POST", body: "{}" }),
  seed: (reset: boolean) => request<{ seeded: boolean; message?: string }>("/api/seed", { method: "POST", body: JSON.stringify({ reset }) }),
};
