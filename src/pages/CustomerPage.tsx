import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { MeasurementPanel } from "../MeasurementPanel";
import { OrderDetail, OrderRow } from "../OrderCard";
import { formatLong, message } from "../format";
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
        <p className="banner error">{error}</p>
      </div>
    );
  }
  if (!data) return <p>Loading…</p>;

  const open = data.orders.filter((order) => order.productionStatus === "in_progress");
  const past = data.orders.filter((order) => order.productionStatus === "finished");
  const selectedOrder = data.orders.find((order) => order.id === selected);
  const onChanged = (nextId?: string, nextNotice?: string) => {
    if (nextNotice) setNotice(nextNotice);
    if (nextId) setParams({ order: nextId });
    void load();
  };

  return (
    <div className="stack">
      <div>
        <h1 className="name">{data.customer.name}</h1>
        <p><a href={`tel:${data.customer.phone.replace(/\s/g, "")}`}>{data.customer.phone}</a></p>
        {data.customer.isNew && <p>New customer</p>}
        {!data.customer.isNew && (
          <p className="muted">Customer since {formatLong(data.customer.createdOn)} · {data.customer.daysAsCustomer.toLocaleString("en-GB")} days</p>
        )}
      </div>
      {notice && <p className="banner">{notice}</p>}
      {error && <p className="banner error">{error}</p>}
      <div className="row">
        <Link className="btn" to={`/customers/${id}/new-order`}>New order</Link>
      </div>
      {selectedOrder && (
        <OrderDetail
          order={selectedOrder}
          today={data.today}
          notificationsEnabled={data.shop.notificationsEnabled}
          onChanged={onChanged}
        />
      )}
      <MeasurementPanel
        customerId={id}
        fields={data.fields}
        measurements={data.measurements}
        onSaved={load}
      />
      <section>
        <h2>Open orders</h2>
        {open.length === 0 && <p className="muted">No open orders.</p>}
        {open.map((order) => (
          <OrderRow key={order.id} order={order} today={data.today} onChanged={onChanged} />
        ))}
      </section>
      <details>
        <summary>Past orders ({past.length})</summary>
        {past.length === 0 && <p className="muted">None yet.</p>}
        {past.map((order) => (
          <OrderRow key={order.id} order={order} today={data.today} onChanged={onChanged} />
        ))}
      </details>
      <details>
        <summary>Edit name or phone</summary>
        <form
          className="grid-2"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            api.updateCustomer(id, { name, phone }).then(() => load()).catch((err) => setError(message(err)));
          }}
        >
          <label className="field">
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
          <label className="field">
            Phone
            <input value={phone} onChange={(event) => setPhone(event.target.value)} required />
          </label>
          <button className="btn secondary" type="submit">Save</button>
        </form>
      </details>
    </div>
  );
}
