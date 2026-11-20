import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { duePhrase, formatLong, formatWeekday, message, PAYMENT_LABEL, piecesLabel } from "../format";
import type { DashboardData, Order, SearchResult } from "../types";

const GROUPS = [
  ["overdue", "Overdue"],
  ["today", "Today"],
  ["tomorrow", "Tomorrow"],
  ["upcoming", "Upcoming"],
] as const;

export function DashboardPage() {
  const navigate = useNavigate();
  const [board, setBoard] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [prompt, setPrompt] = useState<SearchResult | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.dashboard().then(setBoard).catch((err) => setError(message(err)));
  }, []);

  async function onSearch(event: FormEvent) {
    event.preventDefault();
    const q = query.trim();
    if (!q) return;
    setBusy(true);
    setPrompt(null);
    setError(null);
    try {
      const result = await api.search(q);
      if (result.result === "customer") navigate(`/customers/${result.customerId}`);
      else if (result.result === "order") navigate(`/customers/${result.customerId}?order=${result.orderId}`);
      else setPrompt(result);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  const empty = board && GROUPS.every(([key]) => board.groups[key].length === 0);

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h2>Due work</h2>
          <p className="muted">{board ? `Kuwait · ${formatWeekday(board.today)}` : "Loading the bench…"}</p>
        </div>
      </div>
      <form className="search" onSubmit={onSearch}>
        <label className="field">
          Phone number or label code
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="5123 4678 or 6768-1"
            inputMode="tel"
            autoComplete="off"
          />
        </label>
        <button className="btn" disabled={busy} type="submit">
          {busy ? "Searching…" : "Search"}
        </button>
      </form>
      {error && <p className="banner error">{error}</p>}
      {prompt?.result === "create" && (
        <div className="prompt">
          <p>No profile for <strong>{prompt.phone}</strong>.</p>
          <Link className="btn" to={`/customers/new?phone=${encodeURIComponent(prompt.phone)}`}>
            Create new customer?
          </Link>
        </div>
      )}
      {prompt?.result === "none" && <p className="banner">{prompt.message}</p>}
      {empty && (
        <div className="prompt">
          <p>No open orders on the bench.</p>
          <Link className="btn secondary" to="/settings">Load demo data in settings</Link>
        </div>
      )}
      {board && (
        <section className="board" aria-label="Orders by due date">
          {GROUPS.map(([key, title]) => (
            <section key={key} className={`column ${key}`}>
              <header>
                <h2>{title}</h2>
                <span className="count">{board.groups[key].length}</span>
              </header>
              {board.groups[key].length === 0 && <p className="muted tiny">Nothing in this group.</p>}
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
      <div className="ticket-top">
        <span className="code">{order.code}</span>
        <span className={`pill ${order.paymentStatus}`}>{PAYMENT_LABEL[order.paymentStatus]}</span>
      </div>
      <h3>
        <Link to={`/customers/${order.customerId}?order=${order.id}`}>{order.customerName}</Link>
      </h3>
      {order.isAdjustment && <span className="pill adjustment">Adjustment</span>}
      <dl>
        <div>
          <dt>Pieces</dt>
          <dd>
            {piecesLabel(order.pieceCount)}
            {order.pieceLabel ? ` · ${order.pieceLabel}` : ""}
          </dd>
        </div>
        <div>
          <dt>Expected</dt>
          <dd>
            {duePhrase(order.expectedDueDate, today)}
            <div className="tiny muted">{formatLong(order.expectedDueDate)}</div>
          </dd>
        </div>
      </dl>
      <Link className="btn secondary" to={`/customers/${order.customerId}?order=${order.id}`}>
        View
      </Link>
    </article>
  );
}
