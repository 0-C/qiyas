import { FormEvent, useEffect, useState } from "react";
import { api } from "../api";
import { useShop } from "../App";
import { message } from "../format";
import type { MeasurementField, Shop } from "../types";

export function SettingsPage() {
  const { reload } = useShop();
  const [shop, setShop] = useState<Shop | null>(null);
  const [fields, setFields] = useState<MeasurementField[]>([]);
  const [name, setName] = useState("");
  const [green, setGreen] = useState(90);
  const [orange, setOrange] = useState(180);
  const [fee, setFee] = useState("1.250");
  const [notifications, setNotifications] = useState(true);
  const [label, setLabel] = useState("");
  const [labelAr, setLabelAr] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const data = await api.shop();
    setShop(data.shop);
    setFields(data.fields);
    setName(data.shop.name);
    setGreen(data.shop.greenDays);
    setOrange(data.shop.orangeDays);
    setFee(data.shop.deliveryFee);
    setNotifications(data.shop.notificationsEnabled);
  }

  useEffect(() => {
    load().catch((err) => setError(message(err)));
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await api.updateShop({
        name,
        greenDays: Number(green),
        orangeDays: Number(orange),
        deliveryFee: fee,
        notificationsEnabled: notifications,
      });
      await load();
      await reload();
      setNote("Settings saved.");
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <h1>Settings</h1>
      {!shop && !error && <p>Loading settings…</p>}
      {shop && (
        <form className="card stack" onSubmit={save}>
          <label className="field">
            Shop name
            <input value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} />
          </label>
          <div className="grid-3">
            <label className="field">
              Green under (days)
              <input type="number" min={1} value={green} onChange={(event) => setGreen(Number(event.target.value))} required />
            </label>
            <label className="field">
              Orange under (days)
              <input type="number" min={2} value={orange} onChange={(event) => setOrange(Number(event.target.value))} required />
            </label>
            <label className="field">
              Delivery fee (KD)
              <input inputMode="decimal" value={fee} onChange={(event) => setFee(event.target.value)} required />
            </label>
          </div>
          <p className="muted">
            Under {green} days is recent. Under {orange} days needs a fit check. Older sets should be retaken.
          </p>
          <label className="check">
            <input type="checkbox" checked={notifications} onChange={(event) => setNotifications(event.target.checked)} />
            Send order and ready messages
          </label>
          {note && <p className="banner">{note}</p>}
          {error && <p className="banner error">{error}</p>}
          <button className="btn" disabled={busy} type="submit">{busy ? "Saving…" : "Save settings"}</button>
        </form>
      )}
      <section className="card">
        <h2>Measurement fields</h2>
        <ul className="field-list">
          {fields.filter((field) => field.active).map((field) => (
            <li key={field.id}>
              <span>
                {field.label}
                {field.labelAr ? <span className="muted"> · {field.labelAr}</span> : null}
                {field.isCustom ? "" : <span className="tiny muted"> · default</span>}
              </span>
              {field.isCustom && (
                <button
                  className="btn quiet"
                  type="button"
                  onClick={() => {
                    api.removeField(field.id).then(load).catch((err) => setError(message(err)));
                  }}
                >
                  Remove
                </button>
              )}
            </li>
          ))}
        </ul>
        <form
          className="grid-2"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            api.addField({ label, labelAr }).then(() => {
              setLabel("");
              setLabelAr("");
              return load();
            }).catch((err) => setError(message(err)));
          }}
        >
          <label className="field">
            Custom field
            <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Cuff opening" required />
          </label>
          <label className="field">
            Arabic label
            <input value={labelAr} onChange={(event) => setLabelAr(event.target.value)} dir="auto" />
          </label>
          <button className="btn secondary" type="submit">Add field</button>
        </form>
      </section>
      <section className="card stack">
        <h2>Demo data</h2>
        <p>Replace customers and orders with the demo shop.</p>
        <button
          className="btn secondary"
          type="button"
          onClick={() => {
            if (!window.confirm("Replace current customers and orders with the demo shop?")) return;
            api.seed(true).then(() => {
              setNote("Demo shop loaded.");
            }).catch((err) => setError(message(err)));
          }}
        >
          Replace with demo data
        </button>
      </section>
    </div>
  );
}
