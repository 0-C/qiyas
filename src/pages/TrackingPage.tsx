import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { formatKd, formatLong, HANDOVER_LABEL, message, PAYMENT_LABEL, piecesLabel, PRODUCTION_LABEL } from "../format";
import type { Tracking } from "../types";

export function TrackingPage() {
  const { token = "" } = useParams();
  const [params] = useSearchParams();
  const [order, setOrder] = useState<Tracking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(params.get("paid") ? "Payment received. Thank you." : null);
  const [busy, setBusy] = useState(false);

  function load() {
    return api.track(token).then(setOrder).catch((err) => setError(message(err)));
  }

  useEffect(() => {
    void load();
  }, [token]);

  if (error) {
    return (
      <main className="track">
        <div className="track-shell">
          <p className="banner error">{error}</p>
        </div>
      </main>
    );
  }
  if (!order) {
    return (
      <main className="track">
        <div className="track-shell"><p>Loading your order…</p></div>
      </main>
    );
  }

  const owed = Number(order.balance) > 0;
  const canDeliver = order.handoverStatus === "awaiting_collection" || order.handoverStatus === "delivery_requested";

  return (
    <main className="track">
      <div className="tape" aria-hidden="true" />
      <div className="track-shell">
        <p className="eyebrow">Qiyas</p>
        <div className="track-hero">
          <h1>{order.shopName}</h1>
          <p className="muted">Hello {order.customerFirstName}. This page is only for order {order.code}.</p>
        </div>
        <section className="track-card stack">
          {note && <p className="banner">{note}</p>}
          <div className="spread">
            <strong className="code">{order.code}</strong>
            {order.isAdjustment && <span className="pill adjustment">Adjustment</span>}
          </div>
          <p>{piecesLabel(order.pieceCount)} · {order.pieceLabels.join(", ")}</p>
          <div className="tracks">
            <article>
              <span>Production</span>
              <strong>{PRODUCTION_LABEL[order.productionStatus]}</strong>
            </article>
            <article>
              <span>Payment</span>
              <strong>{PAYMENT_LABEL[order.paymentStatus]}</strong>
            </article>
            <article>
              <span>Handover</span>
              <strong>{HANDOVER_LABEL[order.handoverStatus]}</strong>
            </article>
          </div>
          <p>Expected {formatLong(order.expectedDueDate)}</p>
          {order.originalDueDate !== order.expectedDueDate && (
            <p className="tiny muted">Originally promised {formatLong(order.originalDueDate)}</p>
          )}
          <p className="tiny muted">Balance</p>
          <p className="balance">{formatKd(order.balance)}</p>
          <p className="tiny">Total {formatKd(order.totalAmount)} · Paid {formatKd(order.amountPaid)}</p>
          <div className="row">
            {owed && <Link className="btn" to={`/t/${token}/pay`}>Pay now</Link>}
            {canDeliver && order.handoverStatus !== "delivery_requested" && (
              <button
                className="btn secondary"
                type="button"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  api.deliverTrack(token).then((next) => {
                    setOrder(next);
                    setNote(`Delivery requested. ${formatKd(next.deliveryFee)} was added to the balance.`);
                  }).catch((err) => setError(message(err))).finally(() => setBusy(false));
                }}
              >
                Request delivery · {formatKd(order.deliveryFee)}
              </button>
            )}
            {order.handoverStatus === "delivery_requested" && <span className="pill neutral">Delivery requested</span>}
          </div>
          {owed && <p className="tiny muted">If you still owe a balance, pay first. You can ignore delivery if you are picking the dishdasha up at the shop.</p>}
        </section>
      </div>
    </main>
  );
}
