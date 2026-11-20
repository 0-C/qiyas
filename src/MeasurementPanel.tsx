import { FormEvent, useState } from "react";
import { api } from "./api";
import { BAND_HINT, formatLong, formatMeasure, message, METHOD_LABEL } from "./format";
import type { MeasurementField, MeasurementSet, MeasureMethod, MeasureUnit } from "./types";

export function MeasurementPanel({
  customerId,
  fields,
  measurements,
  onSaved,
}: {
  customerId: string;
  fields: MeasurementField[];
  measurements: MeasurementSet[];
  onSaved: () => Promise<void>;
}) {
  const latest = measurements[0];
  const active = fields.filter((field) => field.active);
  const [open, setOpen] = useState(!latest);
  const [unit, setUnit] = useState<MeasureUnit>("cm");
  const [method, setMethod] = useState<MeasureMethod>("body");
  const [ease, setEase] = useState(true);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.addMeasurement(customerId, { unit, method, easeIncluded: ease, values });
      setValues({});
      setOpen(false);
      await onSaved();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <section className="measure-card">
        <div className="spread">
          <h2>Measurements</h2>
          {latest && (
            <span className={`age ${latest.ageTone}`}>
              <i />
              {latest.ageBand}
            </span>
          )}
        </div>
        {!latest && (
          <p>
            <strong>No measurements at this shop.</strong> Save a set before cutting an order. A new set is dated and
            never overwrites an older one.
          </p>
        )}
        {latest && (
          <>
            <p className={`age ${latest.ageTone}`}>
              <i />
              {latest.agePhrase}
            </p>
            <p className="muted tiny">
              {formatLong(latest.takenOn)} · {METHOD_LABEL[latest.method]} · {latest.unit} ·{" "}
              {latest.easeIncluded ? "Ease included" : "Ease not included"}
            </p>
            <p className="tiny">{BAND_HINT[latest.ageBand]}</p>
            <div className="metrics">
              {active.map((field) => (
                <div className="metric" key={field.key}>
                  <span>{field.label}</span>
                  <b>{formatMeasure(latest.values[field.key], latest.unit)}</b>
                  {field.labelAr && <small>{field.labelAr}</small>}
                </div>
              ))}
            </div>
          </>
        )}
        <button className="btn secondary" type="button" onClick={() => setOpen((value) => !value)}>
          {open ? "Close form" : latest ? "New measurement set" : "Enter measurements"}
        </button>
        {open && (
          <form className="stack" onSubmit={onSubmit} style={{ marginTop: 12 }}>
            <div className="field">
              Unit
              <div className="segmented">
                {(["cm", "in"] as const).map((option) => (
                  <label key={option}>
                    <input type="radio" name="unit" checked={unit === option} onChange={() => setUnit(option)} />
                    {option}
                  </label>
                ))}
              </div>
            </div>
            <div className="field">
              How it was taken
              <div className="segmented">
                {(
                  [
                    ["body", "Measured on body"],
                    ["flat", "Flat on garment"],
                    ["finished", "Finished garment"],
                  ] as const
                ).map(([id, label]) => (
                  <label key={id}>
                    <input type="radio" name="method" checked={method === id} onChange={() => setMethod(id)} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <label className="check">
              <input type="checkbox" checked={ease} onChange={(event) => setEase(event.target.checked)} />
              Ease is included
            </label>
            <p className="tiny muted">Ease means extra room for movement is already in the numbers.</p>
            <div className="metrics">
              {active.map((field) => (
                <label className="field" key={field.key}>
                  {field.label}
                  {field.labelAr ? ` · ${field.labelAr}` : ""}
                  <input
                    inputMode="decimal"
                    required
                    value={values[field.key] ?? ""}
                    onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
                  />
                </label>
              ))}
            </div>
            {error && <p className="banner error">{error}</p>}
            <button className="btn" disabled={busy} type="submit">{busy ? "Saving…" : "Save measurement set"}</button>
          </form>
        )}
      </section>
      {measurements.length > 0 && (
        <section className="card">
          <h2>History</h2>
          <div className="history">
            {measurements.map((set, index) => (
              <article key={set.id}>
                <div className="spread">
                  <strong>{formatLong(set.takenOn)}</strong>
                  <span className={`age ${set.ageTone}`}><i />{set.agePhrase}</span>
                </div>
                <p className="tiny muted">
                  {index === 0 ? "Latest · " : ""}
                  {METHOD_LABEL[set.method]} · {set.easeIncluded ? "Ease included" : "Ease not included"}
                </p>
                <p className="tiny">
                  {fields
                    .filter((field) => set.values[field.key] != null)
                    .map((field) => `${field.label} ${formatMeasure(set.values[field.key], set.unit)}`)
                    .join(" · ")}
                </p>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
