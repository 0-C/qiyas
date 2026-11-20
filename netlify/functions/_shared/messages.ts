import { ensureReady, raw } from "./db";
import {
  type TemplateId,
  firstName,
  formatKd,
  fromFils,
  toFils,
  whenPhrase,
  kuwaitToday,
  HttpError,
} from "./domain";
import { getEnv } from "./env";
import { getShopRow } from "./shop";

/**
 * Message providers.
 *
 * MESSAGE_PROVIDER=mock (default) records the message and does not call a network API.
 * MESSAGE_PROVIDER=whatsapp_cloud uses the WhatsApp Cloud API when WHATSAPP_TOKEN
 * and WHATSAPP_PHONE_NUMBER_ID are set.
 * MESSAGE_PROVIDER=twilio uses the Twilio Messages API.
 * MESSAGE_FALLBACK_SMS=true tries Twilio SMS after a WhatsApp failure.
 */

export interface SendResult {
  provider: string;
  channel: "whatsapp" | "sms";
  status: "logged" | "sent" | "queued" | "failed";
  detail: string | null;
}

interface OrderMessageContext {
  id: string;
  shop_id: string;
  customer_id: string;
  customer_name: string;
  phone_digits: string;
  code: string;
  expected_due_date: string;
  total_amount: string;
  amount_paid: string;
  balance: string;
  production_status: "in_progress" | "finished";
  tracking_token: string;
  notifications_muted: boolean;
}

const ORDER_FOR_MESSAGE = `
SELECT
  o.id,
  o.shop_id,
  o.customer_id,
  c.name AS customer_name,
  c.phone_digits,
  o.code,
  o.expected_due_date::text AS expected_due_date,
  o.total_amount::text AS total_amount,
  o.amount_paid::text AS amount_paid,
  (o.total_amount - o.amount_paid)::text AS balance,
  o.production_status,
  o.tracking_token,
  o.notifications_muted
FROM orders o
JOIN customers c ON c.id = o.customer_id
`;

export function chooseTemplate(order: {
  productionStatus: "in_progress" | "finished";
  balance: string;
}): TemplateId | null {
  const owed = toFils(order.balance) > 0;
  if (order.productionStatus === "finished") return owed ? "finished_unpaid" : "finished_paid";
  if (owed) return "order_created_unpaid";
  return null;
}

export function renderTemplate(
  template: TemplateId,
  input: { name: string; whenPhrase: string; payUrl: string; trackUrl: string; deliveryFee: string },
): string {
  const name = input.name;
  if (template === "order_created_unpaid") {
    return [
      `Hi ${name}! Your dishdasha is expected to be ready ${input.whenPhrase}. You can pay now using the link below.`,
      "",
      `Pay now: ${input.payUrl}`,
      `Request a new link: ${input.trackUrl}`,
    ].join("\n");
  }
  if (template === "finished_paid") {
    return [
      `Hi ${name}! Your dishdasha is ready. You can collect it from the shop or have it delivered to your home for ${input.deliveryFee}.`,
      "",
      `Request delivery: ${input.trackUrl}`,
      `Track order: ${input.trackUrl}`,
      "",
      "You can ignore if you're picking it up at the store!",
    ].join("\n");
  }
  return [
    `Hi ${name}! Your dishdasha is ready. Pay the remaining balance using the link below. After payment, you can request home delivery for ${input.deliveryFee}.`,
    "",
    `Pay now: ${input.payUrl}`,
    `Request a new link: ${input.trackUrl}`,
    "",
    "You can ignore if you're picking it up at the store!",
  ].join("\n");
}

async function sendWhatsAppCloud(toDigits: string, text: string): Promise<SendResult> {
  const token = getEnv("WHATSAPP_TOKEN");
  const phoneNumberId = getEnv("WHATSAPP_PHONE_NUMBER_ID");
  if (!token || !phoneNumberId) {
    return {
      provider: "whatsapp_cloud",
      channel: "whatsapp",
      status: "failed",
      detail: "Set WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID to send with WhatsApp Cloud API.",
    };
  }
  const response = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toDigits,
      type: "text",
      text: { preview_url: true, body: text },
    }),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    return { provider: "whatsapp_cloud", channel: "whatsapp", status: "failed", detail };
  }
  return { provider: "whatsapp_cloud", channel: "whatsapp", status: "sent", detail: null };
}

async function sendTwilio(channel: "whatsapp" | "sms", toDigits: string, text: string): Promise<SendResult> {
  const sid = getEnv("TWILIO_ACCOUNT_SID");
  const token = getEnv("TWILIO_AUTH_TOKEN");
  const from = channel === "whatsapp" ? getEnv("TWILIO_WHATSAPP_FROM") : getEnv("TWILIO_SMS_FROM");
  if (!sid || !token || !from) {
    return {
      provider: "twilio",
      channel,
      status: "failed",
      detail: "Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and the matching From number.",
    };
  }
  const fromValue = channel === "whatsapp" && !from.startsWith("whatsapp:") ? `whatsapp:${from}` : from;
  const to = channel === "whatsapp" ? `whatsapp:+${toDigits}` : `+${toDigits}`;
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: fromValue, Body: text }),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    return { provider: "twilio", channel, status: "failed", detail };
  }
  return { provider: "twilio", channel, status: "sent", detail: null };
}

export async function deliverMessage(toDigits: string, text: string): Promise<SendResult> {
  const provider = (getEnv("MESSAGE_PROVIDER") || "mock").toLowerCase();
  const fallback = (getEnv("MESSAGE_FALLBACK_SMS") || "").toLowerCase() === "true";
  if (provider === "mock") {
    console.log(`[qiyas:message] provider=mock channel=whatsapp to=${toDigits} status=logged\n${text}`);
    return { provider: "mock", channel: "whatsapp", status: "logged", detail: null };
  }
  if (provider === "whatsapp_cloud") {
    const result = await sendWhatsAppCloud(toDigits, text);
    if (result.status === "failed" && fallback) return sendTwilio("sms", toDigits, text);
    return result;
  }
  if (provider === "twilio") {
    const result = await sendTwilio("whatsapp", toDigits, text);
    if (result.status === "failed" && fallback) return sendTwilio("sms", toDigits, text);
    return result;
  }
  return {
    provider,
    channel: "whatsapp",
    status: "failed",
    detail: `Unknown MESSAGE_PROVIDER "${provider}". Use mock, whatsapp_cloud, or twilio.`,
  };
}

export async function maybeNotify(
  orderId: string,
  origin: string,
  options: { manual?: boolean } = {},
): Promise<{ id: string; template: string; status: string; channel: string; text: string } | null> {
  await ensureReady();
  const manual = options.manual === true;
  const rows = await raw<OrderMessageContext>(`${ORDER_FOR_MESSAGE} WHERE o.id = $1`, [orderId]);
  const order = rows[0];
  if (!order) throw new HttpError(404, "Order not found.");
  const shop = await getShopRow();
  if (shop.id !== order.shop_id) throw new HttpError(404, "Order not found.");
  if (!shop.notifications_enabled) {
    if (manual) throw new HttpError(400, "Notifications are off for this shop.");
    return null;
  }
  if (order.notifications_muted && !manual) return null;
  const template = chooseTemplate({
    productionStatus: order.production_status,
    balance: fromFils(toFils(order.balance)),
  });
  if (!template) {
    if (manual) throw new HttpError(400, "No message applies to a paid order that is still in progress.");
    return null;
  }
  const base = origin.replace(/\/$/, "");
  const text = renderTemplate(template, {
    name: firstName(order.customer_name),
    whenPhrase: whenPhrase(order.expected_due_date, kuwaitToday()),
    payUrl: `${base}/t/${order.tracking_token}/pay`,
    trackUrl: `${base}/t/${order.tracking_token}`,
    deliveryFee: formatKd(fromFils(toFils(shop.delivery_fee))),
  });
  let result: SendResult;
  try {
    result = await deliverMessage(order.phone_digits, text);
  } catch (error) {
    result = {
      provider: getEnv("MESSAGE_PROVIDER") || "mock",
      channel: "whatsapp",
      status: "failed",
      detail: error instanceof Error ? error.message : "Send failed",
    };
  }
  const saved = await raw<{ id: string }>(
    `INSERT INTO messages (shop_id, order_id, customer_id, channel, template, body, status, provider, detail)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      order.shop_id,
      order.id,
      order.customer_id,
      result.channel,
      template,
      text,
      result.status,
      result.provider,
      result.detail,
    ],
  );
  return { id: saved[0].id, template, status: result.status, channel: result.channel, text };
}
