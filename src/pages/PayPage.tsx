import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { formatKd, message } from "../format";
import type { Tracking } from "../types";

export function PayPage() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Tracking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [card, setCard] = useState("");

  useEffect(() => {
    api.track(token).then(setOrder).catch((err) => setError(message(err)));
  }, [token]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.payTrack(token);
      navigate(`/t/${token}?paid=1`);
    } catch (err) {
      setError(message(err));
      setBusy(false);
    }
  }

  return (
    <main className="public">
      <form className="public-card stack" onSubmit={onSubmit}>
        <h1>{order ? formatKd(order.balance) : "Pay"}</h1>
        <p>{order ? `${order.shopName} · ${order.code}` : "Loading…"}</p>
        <p className="banner">Demo only. No card is charged or stored. Confirming marks the order paid.</p>
        {order && Number(order.balance) <= 0 ? (
          <p>This order is already paid. <Link className="back" to={`/t/${token}`}>Back to tracking</Link></p>
        ) : (
          <>
            <label className="field">
              Name on card
              <input value={name} onChange={(event) => setName(event.target.value)} required autoComplete="off" />
            </label>
            <label className="field">
              Card number
              <input
                value={card}
                onChange={(event) => setCard(event.target.value)}
                inputMode="numeric"
                autoComplete="off"
                required
                minLength={12}
                maxLength={19}
                placeholder="4242 4242 4242 4242"
              />
            </label>
            <div className="grid-2">
              <label className="field">Expiry<input required placeholder="12 / 28" autoComplete="off" /></label>
              <label className="field">CVC<input required inputMode="numeric" minLength={3} maxLength={4} autoComplete="off" /></label>
            </div>
            {error && <p className="banner error">{error}</p>}
            <button className="btn" disabled={busy || !order} type="submit">{busy ? "Confirming…" : "Confirm payment"}</button>
            <Link className="back" to={`/t/${token}`}>Cancel</Link>
          </>
        )}
      </form>
    </main>
  );
}
