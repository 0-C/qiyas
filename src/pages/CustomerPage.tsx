import { FormEvent, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import useSWR from "swr";
import { api } from "../api";
import { MeasurementPanel } from "../MeasurementPanel";
import { OrderDetail } from "../OrderCard";
import { duePhrase, formatKd, formatLong, message, PAYMENT_LABEL, piecesLabel } from "../format";
import type { CustomerProfile, Order } from "../types";

export function CustomerPage() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const selected = params.get("order");
  const { data, error, isLoading, mutate } = useSWR<CustomerProfile>(id ? `/api/customers/${id}` : null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(selected);
  const [pastExpanded, setPastExpanded] = useState(false);

  useEffect(() => {
    if (!data) return;
    setName(data.customer.name);
    setPhone(data.customer.phone);
  }, [data]);

  useEffect(() => {
    if (selected) setOpenId(selected);
  }, [selected]);

  const pastIds = data?.orders.filter((order) => order.productionStatus === "finished").map((order) => order.id).join(",") ?? "";
  useEffect(() => {
    if (openId && pastIds.split(",").includes(openId)) setPastExpanded(true);
  }, [openId, pastIds]);

  async function reload(nextNotice?: string) {
    if (nextNotice) setNotice(nextNotice);
    await mutate();
  }

  if (error && !data) return <p className="banner error">{message(error)}</p>;
  if (isLoading && !data) return <ProfileSkeleton />;
  if (!data) return null;

  const open = data.orders.filter((order) => order.productionStatus === "in_progress");
  const past = data.orders.filter((order) => order.productionStatus === "finished");
  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1 className="name">{data.customer.name}</h1>
          <p style={{ margin: "6px 0 0" }}>
            <a href={`tel:${data.customer.phone.replace(/\s/g, "")}`}>{data.customer.phone}</a>
          </p>
          {data.customer.isNew && <p>New customer</p>}
          {!data.customer.isNew && (
            <p className="muted">Customer since {formatLong(data.customer.createdOn)} · {data.customer.daysAsCustomer.toLocaleString("en-GB")} days</p>
          )}
        </div>
        <Link className="btn" to={`/customers/${id}/new-order`}>New order</Link>
      </div>
      {notice && <p className="banner">{notice}</p>}
      <div className="profile-grid">
        <MeasurementPanel
          customerId={id}
          fields={data.fields}
          measurements={data.measurements}
          onSaved={async () => { await mutate(); }}
        />
        <section className="panel">
          <h2>Open orders</h2>
          {open.length === 0 && <p className="empty" style={{ marginTop: 12 }}>No open orders.</p>}
          {open.map((order) => (
            <OrderDrop
              key={order.id}
              order={order}
              today={data.today}
              expanded={openId === order.id}
              notificationsEnabled={data.shop.notificationsEnabled}
              onToggle={() => setOpenId((current) => (current === order.id ? null : order.id))}
              onChanged={(nextId, nextNotice) => {
                if (nextId) setOpenId(nextId);
                void reload(nextNotice);
              }}
            />
          ))}
        </section>
      </div>
      <details className="panel" open={pastExpanded} onToggle={(event) => setPastExpanded(event.currentTarget.open)}>
        <summary>Past orders ({past.length})</summary>
        {past.length === 0 && <p className="muted">None yet.</p>}
        {past.map((order) => (
          <OrderDrop
            key={order.id}
            order={order}
            today={data.today}
            expanded={openId === order.id}
            notificationsEnabled={data.shop.notificationsEnabled}
            onToggle={() => setOpenId((current) => (current === order.id ? null : order.id))}
            onChanged={(nextId, nextNotice) => {
              if (nextId) setOpenId(nextId);
              void reload(nextNotice);
            }}
          />
        ))}
      </details>
      <details className="panel">
        <summary>Edit name or phone</summary>
        <form
          className="grid-2"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            api.updateCustomer(id, { name, phone }).then(() => reload("Details saved.")).catch((err) => setNotice(message(err)));
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

function OrderDrop({
  order,
  today,
  expanded,
  notificationsEnabled,
  onToggle,
  onChanged,
}: {
  order: Order;
  today: string;
  expanded: boolean;
  notificationsEnabled: boolean;
  onToggle: () => void;
  onChanged: (nextOrderId?: string, notice?: string) => void;
}) {
  return (
    <div className="order-drop" id={`order-${order.id}`}>
      <button className="order-drop-head" type="button" aria-expanded={expanded} onClick={onToggle}>
        <span className={expanded ? "chev open" : "chev"} />
        <span className="code">{order.code}</span>
        <span className="grow">
          {piecesLabel(order.pieceCount)}
          {order.pieceLabel ? ` · ${order.pieceLabel}` : ""}
          {" · "}
          {duePhrase(order.expectedDueDate, today)}
          {order.isAdjustment ? " · Adjustment" : ""}
          {Number(order.balance) > 0 ? ` · ${formatKd(order.balance)} due` : ""}
        </span>
        <span className={`pill ${order.paymentStatus}`}>{PAYMENT_LABEL[order.paymentStatus]}</span>
      </button>
      {expanded && (
        <div className="order-drop-body">
          <OrderDetail order={order} today={today} notificationsEnabled={notificationsEnabled} onChanged={onChanged} />
        </div>
      )}
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="profile-grid">
      <div className="skeleton"><span className="lg" /><span /><span /></div>
      <div className="skeleton"><span /><span /><span className="lg" /></div>
    </div>
  );
}
