import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { MeasurementPanel } from "../MeasurementPanel";
import { OrderCard } from "../OrderCard";
import { formatKd, formatLong, message } from "../format";
import type { CustomerProfile } from "../types";

export function CustomerPage() {
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const selected = params.get("order");
  const [data, setData] = useState<CustomerProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const profile = await api.customer(id);
      setData(profile);
      setName(profile.customer.name);
      setPhone(profile.customer.phone);
      setError(null);
    } catch (err) {
      setError(message(err));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selected || !data) return;
    document.getElementById(`order-${selected}`)?.scrollIntoView({ block: "start" });
  }, [selected, data]);

  if (error && !data) {
    return (
      <div className="stack">
        <Link className="back" to="/">Back to the bench</Link>
        <p className="banner error">{error}</p>
      </div>
    );
  }
  if (!data) return <p>Loading customer…</p>;

  const open = data.orders.filter((order) => order.productionStatus === "in_progress");
  const past = data.orders.filter((order) => order.productionStatus === "finished");

  return (
    <div className="stack">
      <div className="profile-head">
        <Link className="back" to="/">Back to the bench</Link>
        <h2>{data.customer.name}</h2>
        <p><a href={`tel:${data.customer.phone.replace(/\s/g, "")}`}>{data.customer.phone}</a></p>
        <div className="badges">
          {data.customer.isNew && <span className="pill new">New customer</span>}
          {!data.customer.isNew && (
            <span className="pill neutral">
              Customer since {formatLong(data.customer.createdOn)} · {data.customer.daysAsCustomer.toLocaleString("en-GB")} days
            </span>
          )}
          {data.measurements.length === 0 && <span className="pill unpaid">No measurements at this shop</span>}
        </div>
        <details>
          <summary>Edit name or phone</summary>
          <form
            className="grid-2"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              api.updateCustomer(id, { name, phone }).then(() => load()).catch((err) => setError(message(err)));
            }}
          >
            <label className="field">Name<input value={name} onChange={(event) => setName(event.target.value)} required /></label>
            <label className="field">Phone<input value={phone} onChange={(event) => setPhone(event.target.value)} required /></label>
            <button className="btn secondary" type="submit">Save details</button>
          </form>
        </details>
        {notice && <p className="banner">{notice}</p>}
        {error && <p className="banner error">{error}</p>}
      </div>
      <div className="profile">
        <MeasurementPanel
          customerId={id}
          fields={data.fields}
          measurements={data.measurements}
          onSaved={load}
        />
        <div className="stack">
          <section className="stack">
            <h2>Open orders</h2>
            {open.length === 0 && <p className="muted">No open orders.</p>}
            {open.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                selected={order.id === selected}
                notificationsEnabled={data.shop.notificationsEnabled}
                onChanged={(nextId, nextNotice) => {
                  if (nextNotice) setNotice(nextNotice);
                  if (nextId) setParams({ order: nextId });
                  void load();
                }}
              />
            ))}
          </section>
          <NewOrder data={data} onCreated={async (orderId) => {
            setNotice("Order created.");
            setParams({ order: orderId });
            await load();
          }} />
          <section className="stack">
            <h2>Past orders</h2>
            {past.length === 0 && <p className="muted">No finished orders yet.</p>}
            {past.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                selected={order.id === selected}
                notificationsEnabled={data.shop.notificationsEnabled}
                onChanged={(nextId, nextNotice) => {
                  if (nextNotice) setNotice(nextNotice);
                  if (nextId) setParams({ order: nextId });
                  void load();
                }}
              />
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}

function NewOrder({ data, onCreated }: { data: CustomerProfile; onCreated: (orderId: string) => Promise<void> }) {
  const latest = data.measurements[0];
  const [setId, setSetId] = useState(latest?.id ?? "");
  const [pieces, setPieces] = useState(1);
  const [due, setDue] = useState(data.suggestedDueDate);
  const [total, setTotal] = useState("");
  const [paid, setPaid] = useState("0.000");
  const [fabric, setFabric] = useState("");
  const [style, setStyle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!setId && latest) setSetId(latest.id);
  }, [latest, setId]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.createOrder(data.customer.id, {
        measurementSetId: setId,
        pieceCount: pieces,
        expectedDueDate: due,
        totalAmount: total,
        amountPaid: paid || "0",
        fabricNotes: fabric,
        styleNotes: style,
      });
      setTotal("");
      setPaid("0.000");
      setFabric("");
      setStyle("");
      await onCreated(result.order.id);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card stack" onSubmit={onSubmit}>
      <h2>New order</h2>
      {data.measurements.length === 0 ? (
        <p>Save a measurement set before opening an order.</p>
      ) : (
        <>
          <label className="field">
            Measurement set
            <select value={setId} onChange={(event) => setSetId(event.target.value)} required>
              {data.measurements.map((set) => (
                <option key={set.id} value={set.id}>
                  {formatLong(set.takenOn)} · {set.method} · {set.unit}
                </option>
              ))}
            </select>
          </label>
          <div className="grid-2">
            <label className="field">
              Pieces
              <input type="number" min={1} max={20} value={pieces} onChange={(event) => setPieces(Number(event.target.value))} required />
            </label>
            <label className="field">
              Expected completion
              <input type="date" value={due} onChange={(event) => setDue(event.target.value)} required />
            </label>
            <label className="field">
              Total (KD)
              <input inputMode="decimal" placeholder="24.000" value={total} onChange={(event) => setTotal(event.target.value)} required />
            </label>
            <label className="field">
              Paid now / deposit (KD)
              <input inputMode="decimal" value={paid} onChange={(event) => setPaid(event.target.value)} required />
            </label>
          </div>
          <label className="field">
            Fabric
            <input value={fabric} onChange={(event) => setFabric(event.target.value)} />
          </label>
          <label className="field">
            Style
            <textarea value={style} onChange={(event) => setStyle(event.target.value)} />
          </label>
          <p className="tiny muted">Amounts use 3 decimals, for example {formatKd("1.250")}.</p>
          {error && <p className="banner error">{error}</p>}
          <button className="btn" disabled={busy} type="submit">{busy ? "Creating…" : "Create order"}</button>
        </>
      )}
    </form>
  );
}
