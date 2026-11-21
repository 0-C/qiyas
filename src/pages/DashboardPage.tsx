import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { duePhrase, message, PAYMENT_LABEL, piecesLabel } from "../format";
import type { DashboardData, Order } from "../types";

const GROUPS = [
  ["overdue", "Overdue"],
  ["today", "Today"],
  ["tomorrow", "Tomorrow"],
  ["upcoming", "Upcoming"],
] as const;

export function DashboardPage() {
  const [board, setBoard] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.dashboard().then(setBoard).catch((err) => setError(message(err)));
  }, []);

  const empty = board && GROUPS.every(([key]) => board.groups[key].length === 0);

  return (
    <div>
      <div className="page-head">
        <h1>Dashboard</h1>
      </div>
      {error && <p className="banner error">{error}</p>}
      {!board && !error && <p>Loading…</p>}
      {empty && (
        <p>
          No open orders. <Link to="/settings">Load demo data</Link>
        </p>
      )}
      {board && (
        <section className="board" aria-label="Orders by due date">
          {GROUPS.map(([key, title]) => (
            <section key={key} className="column">
              <header>
                <h2>{title}</h2>
                <span className="count">{board.groups[key].length}</span>
              </header>
              {board.groups[key].length === 0 && <p className="muted" style={{ padding: "0 12px 12px" }}>None</p>}
              {board.groups[key].map((order) => (
                <Ticket key={order.id} order={order} today={board.today} />
              ))}
            </section>
          ))}
        </section>
      )}
    </div>
  );
}

function Ticket({ order, today }: { order: Order; today: string }) {
  return (
    <article className="ticket">
      <div className="spread">
        <span className="code">{order.code}</span>
        <span className={`status ${order.paymentStatus}`}>{PAYMENT_LABEL[order.paymentStatus]}</span>
      </div>
      <h3>
        <Link className="name" to={`/customers/${order.customerId}?order=${order.id}`}>{order.customerName}</Link>
      </h3>
      <p>
        {piecesLabel(order.pieceCount)}
        {order.pieceLabel ? ` · ${order.pieceLabel}` : ""}
        {" · "}
        {duePhrase(order.expectedDueDate, today)}
        {order.isAdjustment ? " · Adjustment" : ""}
      </p>
      <Link className="btn secondary" to={`/customers/${order.customerId}?order=${order.id}`}>View</Link>
    </article>
  );
}
