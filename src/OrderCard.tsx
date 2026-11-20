import { FormEvent, useEffect, useState } from "react";
import { api } from "./api";
import {
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

export function OrderCard({
  order,
  selected,
  notificationsEnabled,
  onChanged,
}: {
  order: Order;
  selected: boolean;
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
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}${order.trackingPath}`;

  useEffect(() => {
    setExpected(order.expectedDueDate);
    setAmount(order.balance);
  }, [order.expectedDueDate, order.balance]);

  async function run(action: () => Promise<string | void>, success: string) {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const nextId = await action();
      setNote(success);
      onChanged(typeof nextId === "string" ? nextId : undefined, success);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article id={`order-${order.id}`} className={selected ? "order-card card selected stack" : "order-card card stack"}>
      <div className="spread">
        <div>
          <div className="code-line">
            <span className="code">{order.code}</span>
            {order.isAdjustment && <span className="pill adjustment">Adjustment</span>}
            <span className={`pill ${order.paymentStatus}`}>{PAYMENT_LABEL[order.paymentStatus]}</span>
          </div>
          <h2 style={{ marginTop: 6 }}>{piecesLabel(order.pieceCount)}</h2>
        </div>
        <span className="pill neutral">{PRODUCTION_LABEL[order.productionStatus]}</span>
      </div>
      <div className="labels">
        {order.pieceLabels.map((label) => (
          <span className="pill neutral" key={label}>{label}</span>
        ))}
      </div>
      {order.parentCode && <p className="tiny">Adjustment of {order.parentCode}. The original order stays on record.</p>}
      {order.adjustmentNote && <p>{order.adjustmentNote}</p>}
      <p>
        Expected {formatLong(order.expectedDueDate)}
        {order.originalDueDate !== order.expectedDueDate && (
          <span className="muted"> · Promised {formatLong(order.originalDueDate)}</span>
        )}
        {order.finishedAt && <span className="muted"> · Finished {formatWhen(order.finishedAt)}</span>}
      </p>
      <div className="money-grid">
        <div><span>Total</span><strong>{formatKd(order.totalAmount)}</strong></div>
        <div><span>Paid</span><strong>{formatKd(order.amountPaid)}</strong></div>
        <div><span>Due</span><strong>{formatKd(order.balance)}</strong></div>
      </div>
      {(order.fabricNotes || order.styleNotes) && (
        <p className="tiny">
          {order.fabricNotes && <>Fabric: {order.fabricNotes}. </>}
          {order.styleNotes && <>Style: {order.styleNotes}</>}
        </p>
      )}
      {order.deliveryFeeApplied && <p className="tiny">Home delivery fee is included in the total.</p>}

      <label className="field">
        Handover
        <select
          value={order.handoverStatus}
          disabled={busy}
          onChange={(event) =>
            void run(
              () => api.updateOrder(order.id, { handoverStatus: event.target.value }).then(() => undefined),
              "Handover updated.",
            )
          }
        >
          {HANDOVERS.map((status) => (
            <option key={status} value={status}>{HANDOVER_LABEL[status]}</option>
          ))}
        </select>
      </label>

      {order.productionStatus === "in_progress" && (
        <form
          className="row"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            void run(
              () => api.updateOrder(order.id, { expectedDueDate: expected }).then(() => undefined),
              "Expected date updated. The original promised date is unchanged.",
            );
          }}
        >
          <label className="field">
            Update expected date
            <input type="date" value={expected} onChange={(event) => setExpected(event.target.value)} required />
          </label>
          <button className="btn secondary" disabled={busy} type="submit">Save date</button>
        </form>
      )}

      {Number(order.balance) > 0 && (
        <form
          className="row"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            void run(
              () => api.payOrder(order.id, { amount, note: payNote }).then(() => undefined),
              "Payment recorded.",
            );
          }}
        >
          <label className="field">
            In-shop payment (KD)
            <input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} required />
          </label>
          <label className="field">
            Note
            <input value={payNote} onChange={(event) => setPayNote(event.target.value)} />
          </label>
          <button className="btn" disabled={busy} type="submit">Record payment</button>
        </form>
      )}

      {order.productionStatus === "in_progress" && (
        <button className="btn" disabled={busy} type="button" onClick={() => void run(() => api.finishOrder(order.id).then(() => undefined), "Marked as finished.")}>
          Mark as finished
        </button>
      )}

      {order.productionStatus === "finished" && (
        <form
          className="stack"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            void run(async () => {
              const result = await api.adjustOrder(order.id, {
                note: alteration,
                expectedDueDate: adjustDate,
                piece: order.pieceCount > 1 ? piece : undefined,
              });
              return result.order.id;
            }, "Adjustment opened.");
          }}
        >
          <h3>Re-adjust</h3>
          <label className="field">
            Alteration
            <textarea value={alteration} onChange={(event) => setAlteration(event.target.value)} required />
          </label>
          <div className="grid-2">
            <label className="field">
              New due date
              <input type="date" value={adjustDate} onChange={(event) => setAdjustDate(event.target.value)} required />
            </label>
            {order.pieceCount > 1 && (
              <label className="field">
                Piece
                <select value={piece} onChange={(event) => setPiece(Number(event.target.value))}>
                  {order.pieceLabels.map((label, index) => (
                    <option key={label} value={index + 1}>{label}</option>
                  ))}
                </select>
              </label>
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
            void run(
              () => api.updateOrder(order.id, { notificationsMuted: event.target.checked }).then(() => undefined),
              event.target.checked ? "Messages muted for this order." : "Messages unmuted.",
            )
          }
        />
        Mute automatic messages for this order
      </label>
      <div className="row">
        <button
          className="btn secondary"
          type="button"
          disabled={busy || !notificationsEnabled}
          onClick={() => void run(() => api.sendMessage(order.id).then(() => undefined), "Message logged.")}
        >
          Send status message
        </button>
        {!notificationsEnabled && <span className="tiny muted">Notifications are off in settings.</span>}
      </div>
      <label className="field">
        Customer tracking link
        <input readOnly value={link} onFocus={(event) => event.currentTarget.select()} />
      </label>
      <button
        className="btn quiet"
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(link).then(() => setCopied(true)).catch(() => setCopied(false));
        }}
      >
        {copied ? "Copied" : "Copy link"}
      </button>
      <a className="back" href={order.trackingPath} target="_blank" rel="noreferrer">Open tracking page</a>

      {order.payments && order.payments.length > 0 && (
        <div>
          <h3>Payments</h3>
          {order.payments.map((payment) => (
            <p className="tiny" key={payment.id}>
              {formatWhen(payment.createdAt)} · {formatKd(payment.amount)} · {payment.source === "link" ? "Payment link" : "In shop"}
              {payment.note ? ` · ${payment.note}` : ""}
            </p>
          ))}
        </div>
      )}

      <div className="log">
        <h3>Messages</h3>
        {(!order.messages || order.messages.length === 0) && <p className="tiny muted">No messages yet.</p>}
        {order.messages?.map((entry) => (
          <article key={entry.id}>
            <div className="spread">
              <strong>{TEMPLATE_LABEL[entry.template] ?? entry.template}</strong>
              <span className="tiny">{formatWhen(entry.createdAt)}</span>
            </div>
            <p className="tiny muted">
              {entry.channel === "sms" ? "SMS" : "WhatsApp"} · {entry.provider} · {entry.status}
              {entry.detail ? ` · ${entry.detail}` : ""}
            </p>
            <pre>{entry.text}</pre>
          </article>
        ))}
      </div>
      {note && <p className="banner">{note}</p>}
      {error && <p className="banner error">{error}</p>}
    </article>
  );
}
