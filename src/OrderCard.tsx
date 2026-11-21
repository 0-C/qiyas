import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "./api";
import {
  duePhrase,
  formatKd,
  formatLong,
  formatWhen,
  HANDOVER_LABEL,
  message,
  PAYMENT_LABEL,
  piecesLabel,
  PRODUCTION_LABEL,
  TEMPLATE_LABEL,
} from "./format";
import type { HandoverStatus, Order } from "./types";

const HANDOVERS = Object.keys(HANDOVER_LABEL) as HandoverStatus[];

async function runAction(
  action: () => Promise<string | void>,
  onChanged: (nextOrderId?: string, notice?: string) => void,
  success: string,
  setError: (value: string | null) => void,
  setBusy: (value: boolean) => void,
) {
  setBusy(true);
  setError(null);
  try {
    const nextId = await action();
    onChanged(typeof nextId === "string" ? nextId : undefined, success);
  } catch (err) {
    setError(message(err));
  } finally {
    setBusy(false);
  }
}

export function OrderRow({
  order,
  today,
  onChanged,
}: {
  order: Order;
  today: string;
  onChanged: (nextOrderId?: string, notice?: string) => void;
}) {
  const [paying, setPaying] = useState(false);
  const [amount, setAmount] = useState(order.balance);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAmount(order.balance);
  }, [order.balance]);

  return (
    <div className="order-row">
      <div>
        <Link className="code" to={`/customers/${order.customerId}?order=${order.id}`}>{order.code}</Link>
        {order.isAdjustment && <span className="tag"> · Adjustment</span>}
        <p style={{ margin: "4px 0 0" }}>
          {piecesLabel(order.pieceCount)}
          {order.pieceLabel ? ` · ${order.pieceLabel}` : ""}
          {" · "}
          {duePhrase(order.expectedDueDate, today)}
          {" · "}
          <span className={`status ${order.paymentStatus}`}>{PAYMENT_LABEL[order.paymentStatus]}</span>
          {Number(order.balance) > 0 ? ` · ${formatKd(order.balance)} due` : ""}
        </p>
        {error && <p className="banner error">{error}</p>}
      </div>
      <div className="row">
        {paying && (
          <input aria-label="Amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
        )}
        {order.productionStatus === "in_progress" && (
          <button
            className="btn"
            type="button"
            disabled={busy}
            onClick={() =>
              void runAction(
                () => api.finishOrder(order.id).then(() => undefined),
                onChanged,
                "Marked as finished.",
                setError,
                setBusy,
              )
            }
          >
            Mark finished
          </button>
        )}
        {Number(order.balance) > 0 && (
          <button
            className={paying ? "btn" : "btn secondary"}
            type="button"
            disabled={busy}
            onClick={() => {
              if (!paying) {
                setPaying(true);
                return;
              }
              void runAction(
                () => api.payOrder(order.id, { amount }).then(() => undefined),
                onChanged,
                "Payment recorded.",
                setError,
                setBusy,
              );
            }}
          >
            {paying ? "Save payment" : "Record payment"}
          </button>
        )}
        <Link className="btn secondary" to={`/customers/${order.customerId}?order=${order.id}`}>Open</Link>
      </div>
    </div>
  );
}

export function OrderDetail({
  order,
  today,
  notificationsEnabled,
  onChanged,
}: {
  order: Order;
  today: string;
  notificationsEnabled: boolean;
  onChanged: (nextOrderId?: string, notice?: string) => void;
}) {
  const [expected, setExpected] = useState(order.expectedDueDate);
  const [amount, setAmount] = useState(order.balance);
  const [payNote, setPayNote] = useState("");
  const [alteration, setAlteration] = useState("");
  const [adjustDate, setAdjustDate] = useState(order.expectedDueDate);
  const [piece, setPiece] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}${order.trackingPath}`;

  useEffect(() => {
    setExpected(order.expectedDueDate);
    setAmount(order.balance);
  }, [order.expectedDueDate, order.balance]);

  return (
    <article id={`order-${order.id}`} className="order-detail stack">
      <div className="spread">
        <div>
          <div className="code">{order.code}{order.isAdjustment ? " · Adjustment" : ""}</div>
          <p style={{ margin: "4px 0 0" }}>
            {piecesLabel(order.pieceCount)} · {order.pieceLabels.join(", ")} · {duePhrase(order.expectedDueDate, today)} · {formatLong(order.expectedDueDate)}
          </p>
        </div>
        <span className={`status ${order.paymentStatus}`}>{PAYMENT_LABEL[order.paymentStatus]} · {PRODUCTION_LABEL[order.productionStatus]}</span>
      </div>
      <p className="money-line">
        <span>Total <strong style={{ color: "var(--ink)" }}>{formatKd(order.totalAmount)}</strong></span>
        <span>Paid <strong style={{ color: "var(--ink)" }}>{formatKd(order.amountPaid)}</strong></span>
        <span>Due <strong style={{ color: "var(--ink)" }}>{formatKd(order.balance)}</strong></span>
      </p>
      {order.adjustmentNote && <p>{order.adjustmentNote}</p>}
      {(order.fabricNotes || order.styleNotes) && (
        <p>{[order.fabricNotes, order.styleNotes].filter(Boolean).join(" · ")}</p>
      )}
      <div className="row">
        {order.productionStatus === "in_progress" && (
          <button
            className="btn"
            type="button"
            disabled={busy}
            onClick={() =>
              void runAction(() => api.finishOrder(order.id).then(() => undefined), onChanged, "Marked as finished.", setError, setBusy)
            }
          >
            Mark finished
          </button>
        )}
      </div>
      {Number(order.balance) > 0 && (
        <form
          className="row"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            void runAction(
              () => api.payOrder(order.id, { amount, note: payNote }).then(() => undefined),
              onChanged,
              "Payment recorded.",
              setError,
              setBusy,
            );
          }}
        >
          <input aria-label="Payment amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} required />
          <button className="btn" disabled={busy} type="submit">Record payment</button>
        </form>
      )}
      {error && <p className="banner error">{error}</p>}
      <details>
        <summary>More</summary>
        <div className="stack">
          {order.originalDueDate !== order.expectedDueDate && <p>Promised {formatLong(order.originalDueDate)}</p>}
          {order.finishedAt && <p>Finished {formatWhen(order.finishedAt)}</p>}
          {order.parentCode && <p>Adjustment of {order.parentCode}. The original order stays on record.</p>}
          {order.productionStatus === "in_progress" && (
            <form
              className="row"
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                void runAction(
                  () => api.updateOrder(order.id, { expectedDueDate: expected }).then(() => undefined),
                  onChanged,
                  "Expected date updated.",
                  setError,
                  setBusy,
                );
              }}
            >
              <input aria-label="Expected date" type="date" value={expected} onChange={(event) => setExpected(event.target.value)} required />
              <button className="btn secondary" disabled={busy} type="submit">Save date</button>
            </form>
          )}
          <label className="field">
            Handover
            <select
              value={order.handoverStatus}
              disabled={busy}
              onChange={(event) =>
                void runAction(
                  () => api.updateOrder(order.id, { handoverStatus: event.target.value }).then(() => undefined),
                  onChanged,
                  "Handover updated.",
                  setError,
                  setBusy,
                )
              }
            >
              {HANDOVERS.map((status) => (
                <option key={status} value={status}>{HANDOVER_LABEL[status]}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Payment note
            <input value={payNote} onChange={(event) => setPayNote(event.target.value)} />
          </label>
          {order.productionStatus === "finished" && (
            <form
              className="stack"
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                void runAction(
                  async () => {
                    const result = await api.adjustOrder(order.id, {
                      note: alteration,
                      expectedDueDate: adjustDate,
                      piece: order.pieceCount > 1 ? piece : undefined,
                    });
                    return result.order.id;
                  },
                  onChanged,
                  "Adjustment opened.",
                  setError,
                  setBusy,
                );
              }}
            >
              <h3>Re-adjust</h3>
              <textarea aria-label="Alteration" value={alteration} onChange={(event) => setAlteration(event.target.value)} required />
              <div className="grid-2">
                <input aria-label="New due date" type="date" value={adjustDate} onChange={(event) => setAdjustDate(event.target.value)} required />
                {order.pieceCount > 1 && (
                  <select aria-label="Piece" value={piece} onChange={(event) => setPiece(Number(event.target.value))}>
                    {order.pieceLabels.map((label, index) => (
                      <option key={label} value={index + 1}>{label}</option>
                    ))}
                  </select>
                )}
              </div>
              <button className="btn secondary" disabled={busy} type="submit">Re-adjust</button>
            </form>
          )}
          <label className="check">
            <input
              type="checkbox"
              checked={order.notificationsMuted}
              disabled={busy}
              onChange={(event) =>
                void runAction(
                  () => api.updateOrder(order.id, { notificationsMuted: event.target.checked }).then(() => undefined),
                  onChanged,
                  event.target.checked ? "Messages muted." : "Messages unmuted.",
                  setError,
                  setBusy,
                )
              }
            />
            Mute messages
          </label>
          <div className="row">
            <button
              className="btn secondary"
              type="button"
              disabled={busy || !notificationsEnabled}
              onClick={() =>
                void runAction(() => api.sendMessage(order.id).then(() => undefined), onChanged, "Message logged.", setError, setBusy)
              }
            >
              Send status message
            </button>
            {!notificationsEnabled && <span className="muted">Notifications are off.</span>}
          </div>
          <label className="field">
            Tracking link
            <input readOnly value={link} onFocus={(event) => event.currentTarget.select()} />
          </label>
          <div className="row">
            <button
              className="btn secondary"
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(link).then(() => setCopied(true)).catch(() => setCopied(false));
              }}
            >
              {copied ? "Copied" : "Copy link"}
            </button>
            <a href={order.trackingPath} target="_blank" rel="noreferrer">Open tracking page</a>
          </div>
          {order.payments && order.payments.length > 0 && (
            <div>
              <h3>Payments</h3>
              {order.payments.map((payment) => (
                <p key={payment.id}>
                  {formatWhen(payment.createdAt)} · {formatKd(payment.amount)} · {payment.source === "link" ? "Link" : "In shop"}
                  {payment.note ? ` · ${payment.note}` : ""}
                </p>
              ))}
            </div>
          )}
          <div className="log">
            <h3>Messages</h3>
            {(!order.messages || order.messages.length === 0) && <p className="muted">No messages yet.</p>}
            {order.messages?.map((entry) => (
              <article key={entry.id}>
                <div className="spread">
                  <strong>{TEMPLATE_LABEL[entry.template] ?? entry.template}</strong>
                  <span className="muted">{formatWhen(entry.createdAt)}</span>
                </div>
                <p className="muted">
                  {entry.channel === "sms" ? "SMS" : "WhatsApp"} · {entry.provider} · {entry.status}
                  {entry.detail ? ` · ${entry.detail}` : ""}
                </p>
                <pre>{entry.text}</pre>
              </article>
            ))}
          </div>
        </div>
      </details>
    </article>
  );
}
