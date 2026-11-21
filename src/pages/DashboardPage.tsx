import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import useSWR, { preload, useSWRConfig } from "swr";
import { api, swrFetcher } from "../api";
import { duePhrase, formatKd, formatLong, message, PAYMENT_LABEL, piecesLabel, PRODUCTION_LABEL } from "../format";
import type { DashboardData, Order } from "../types";

const GROUPS = [
  ["overdue", "Overdue"],
  ["today", "Today"],
  ["tomorrow", "Tomorrow"],
  ["upcoming", "Upcoming"],
] as const;

export function DashboardPage() {
  const { data, error, isLoading } = useSWR<DashboardData>("/api/dashboard");
  const { mutate } = useSWRConfig();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    overdue: true,
    today: true,
    tomorrow: false,
    upcoming: false,
  });
  const [expanded, setExpanded] = useState<string | null>(null);

  async function refresh() {
    await mutate("/api/dashboard");
  }

  return (
    <div>
      <div className="page-head">
        <h1>Dashboard</h1>
      </div>
      {error && <p className="banner error">{message(error)}</p>}
      {isLoading && !data && <DashboardSkeleton />}
      {data && GROUPS.every(([key]) => data.groups[key].length === 0) && (
        <p className="empty">No open orders. <Link to="/settings">Load demo data</Link></p>
      )}
      {data && data.groups.overdue.length + data.groups.today.length + data.groups.tomorrow.length + data.groups.upcoming.length > 0 && (
        <div>
          {GROUPS.map(([key, title]) => {
            const orders = data.groups[key];
            const isOpen = openGroups[key];
            return (
              <section key={key} className="group">
                <button
                  className="group-toggle"
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => setOpenGroups((current) => ({ ...current, [key]: !current[key] }))}
                >
                  <span className={isOpen ? "chev open" : "chev"} />
                  <h2>{title}</h2>
                  <span className="count-badge">{orders.length}</span>
                </button>
                {isOpen && (
                  orders.length === 0 ? (
                    <p className="muted" style={{ padding: "0 16px 16px" }}>No orders in this group.</p>
                  ) : (
                    <div className="table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Code</th>
                            <th>Customer</th>
                            <th>Pieces</th>
                            <th>Expected</th>
                            <th>Payment</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {orders.map((order) => (
                            <OrderRows
                              key={order.id}
                              order={order}
                              today={data.today}
                              group={key}
                              expanded={expanded === order.id}
                              onToggle={() => setExpanded((current) => (current === order.id ? null : order.id))}
                              onChanged={refresh}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function OrderRows({
  order,
  today,
  group,
  expanded,
  onToggle,
  onChanged,
}: {
  order: Order;
  today: string;
  group: string;
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => Promise<void>;
}) {
  const [amount, setAmount] = useState(order.balance);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      await api.finishOrder(order.id);
      await onChanged();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  async function pay(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.payOrder(order.id, { amount });
      await onChanged();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <tr className={expanded ? "data-row is-open" : "data-row"} onClick={onToggle}>
        <td><span className="code">{order.code}</span></td>
        <td>
          <Link
            className="name"
            to={`/customers/${order.customerId}?order=${order.id}`}
            onMouseEnter={() => preload(`/api/customers/${order.customerId}`, swrFetcher)}
            onClick={(event) => event.stopPropagation()}
          >
            {order.customerName}
          </Link>
        </td>
        <td>{piecesLabel(order.pieceCount)}{order.pieceLabel ? ` · ${order.pieceLabel}` : ""}</td>
        <td>
          <span className={`pill ${group}`}>{duePhrase(order.expectedDueDate, today)}</span>
          <div className="muted">{formatLong(order.expectedDueDate)}</div>
        </td>
        <td><span className={`pill ${order.paymentStatus}`}>{PAYMENT_LABEL[order.paymentStatus]}</span></td>
        <td>
          <span className={`pill ${order.productionStatus}`}>{PRODUCTION_LABEL[order.productionStatus]}</span>
          {order.isAdjustment && <span className="pill adjustment" style={{ marginLeft: 6 }}>Adjustment</span>}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td className="detail-cell" colSpan={6}>
            <div className="detail-card">
              <p>
                {order.pieceLabels.join(", ")} · Due {formatKd(order.balance)} of {formatKd(order.totalAmount)}
                {order.originalDueDate !== order.expectedDueDate ? ` · Promised ${formatLong(order.originalDueDate)}` : ""}
              </p>
              {(order.fabricNotes || order.styleNotes || order.adjustmentNote) && (
                <p>{[order.adjustmentNote, order.fabricNotes, order.styleNotes].filter(Boolean).join(" · ")}</p>
              )}
              {error && <p className="banner error">{error}</p>}
              <div className="row">
                {order.productionStatus === "in_progress" && (
                  <button className="btn" type="button" disabled={busy} onClick={() => void finish()}>Mark finished</button>
                )}
                {Number(order.balance) > 0 && (
                  <form className="row" onSubmit={(event) => void pay(event)}>
                    <input aria-label="Payment amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
                    <button className="btn secondary" disabled={busy} type="submit">Record payment</button>
                  </form>
                )}
                <Link className="btn secondary" to={`/customers/${order.customerId}?order=${order.id}`}>Open customer</Link>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div className="skeleton">
      <span className="lg" />
      <span />
      <span />
      <span className="lg" />
    </div>
  );
}
