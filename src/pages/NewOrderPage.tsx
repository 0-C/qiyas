import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { MeasurementForm } from "../MeasurementPanel";
import { formatKd, formatLong, message } from "../format";
import type { CustomerProfile, Order } from "../types";

export function NewOrderPage() {
  const { id = "" } = useParams();
  const [data, setData] = useState<CustomerProfile | null>(null);
  const [step, setStep] = useState<"measure" | "details" | "done">("details");
  const [created, setCreated] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const profile = await api.customer(id);
    setData(profile);
    return profile;
  }

  useEffect(() => {
    load()
      .then((profile) => {
        if (profile.measurements.length === 0) setStep("measure");
      })
      .catch((err) => setError(message(err)));
  }, [id]);

  if (error && !data) return <p className="banner error">{error}</p>;
  if (!data) return <p>Loading…</p>;

  const needsMeasure = data.measurements.length === 0;
  const steps = needsMeasure || step === "measure" ? ["Measurements", "Order", "Done"] : ["Order", "Done"];
  const current =
    step === "measure" ? "Measurements" : step === "details" ? "Order" : "Done";

  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      <p><Link to={`/customers/${id}`}>{data.customer.name}</Link></p>
      <h1>{step === "done" ? "Order ready" : step === "measure" ? "Measurements" : "New order"}</h1>
      <div className="steps">
        {steps.map((label) => (
          <span key={label} className={label === current ? "on" : undefined}>{label}</span>
        ))}
      </div>
      {step === "measure" && (
        <MeasurementForm
          customerId={id}
          fields={data.fields}
          submitLabel="Save and continue"
          onSaved={async () => {
            await load();
            setStep("details");
          }}
        />
      )}
      {step === "details" && (
        <OrderDetails
          data={data}
          onCreated={(order) => {
            setCreated(order);
            setStep("done");
          }}
        />
      )}
      {step === "done" && created && (
        <section className="panel stack">
          <p className="code" style={{ fontSize: "1.5rem" }}>{created.code}</p>
          <p>{created.pieceLabels.join(", ")}</p>
          <p>
            {created.pieceCount} {created.pieceCount === 1 ? "piece" : "pieces"} · Due {formatLong(created.expectedDueDate)} · {formatKd(created.totalAmount)}
          </p>
          <div className="row">
            <Link className="btn" to={`/customers/${id}?order=${created.id}`}>Done</Link>
            <a className="btn secondary" href={created.trackingPath} target="_blank" rel="noreferrer">Tracking link</a>
          </div>
        </section>
      )}
    </div>
  );
}

function OrderDetails({
  data,
  onCreated,
}: {
  data: CustomerProfile;
  onCreated: (order: Order) => void;
}) {
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
      onCreated(result.order);
    } catch (err) {
      setError(message(err));
      setBusy(false);
    }
  }

  if (!latest) {
    return <p>Save measurements before creating the order.</p>;
  }

  return (
    <form className="stack" onSubmit={onSubmit}>
      <div className="grid-2">
        <label className="field">
          Total (KD)
          <input inputMode="decimal" placeholder="24.000" value={total} onChange={(event) => setTotal(event.target.value)} required autoFocus />
        </label>
        <label className="field">
          Deposit (KD)
          <input inputMode="decimal" value={paid} onChange={(event) => setPaid(event.target.value)} required />
        </label>
        <label className="field">
          Pieces
          <input type="number" min={1} max={20} value={pieces} onChange={(event) => setPieces(Number(event.target.value))} required />
        </label>
        <label className="field">
          Due date
          <input type="date" value={due} onChange={(event) => setDue(event.target.value)} required />
        </label>
      </div>
      <details>
        <summary>Measurement set, fabric, style</summary>
        <div className="stack">
          <label className="field">
            Measurement set
            <select value={setId} onChange={(event) => setSetId(event.target.value)}>
              {data.measurements.map((set) => (
                <option key={set.id} value={set.id}>
                  {formatLong(set.takenOn)} · {set.method} · {set.unit}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Fabric
            <input value={fabric} onChange={(event) => setFabric(event.target.value)} />
          </label>
          <label className="field">
            Style
            <input value={style} onChange={(event) => setStyle(event.target.value)} />
          </label>
        </div>
      </details>
      {error && <p className="banner error">{error}</p>}
      <button className="btn" disabled={busy} type="submit">{busy ? "Creating…" : "Create order"}</button>
    </form>
  );
}
