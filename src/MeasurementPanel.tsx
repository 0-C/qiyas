import { FormEvent, useState } from "react";
import { api } from "./api";
import { formatLong, formatMeasure, message, METHOD_LABEL } from "./format";
import type { MeasurementField, MeasurementSet, MeasureMethod, MeasureUnit } from "./types";

export function MeasurementForm({
  customerId,
  fields,
  onSaved,
  submitLabel,
}: {
  customerId: string;
  fields: MeasurementField[];
  onSaved: () => Promise<void>;
  submitLabel: string;
}) {
  const active = fields.filter((field) => field.active);
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
      await onSaved();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="stack" onSubmit={onSubmit}>
      <div className="metrics">
        {active.map((field) => (
          <label className="field" key={field.key}>
            {field.label}
            <input
              inputMode="decimal"
              required
              placeholder={field.labelAr ?? ""}
              value={values[field.key] ?? ""}
              onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
            />
          </label>
        ))}
      </div>
      <details>
        <summary>Unit and method</summary>
        <div className="stack">
          <label className="field">
            Unit
            <select value={unit} onChange={(event) => setUnit(event.target.value as MeasureUnit)}>
              <option value="cm">cm</option>
              <option value="in">in</option>
            </select>
          </label>
          <label className="field">
            Method
            <select value={method} onChange={(event) => setMethod(event.target.value as MeasureMethod)}>
              <option value="body">Measured on body</option>
              <option value="flat">Flat on garment</option>
              <option value="finished">Finished garment</option>
            </select>
          </label>
          <label className="check">
            <input type="checkbox" checked={ease} onChange={(event) => setEase(event.target.checked)} />
            Ease is included
          </label>
        </div>
      </details>
      {error && <p className="banner error">{error}</p>}
      <button className="btn" disabled={busy} type="submit">{busy ? "Saving…" : submitLabel}</button>
    </form>
  );
}

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

  return (
    <section className="panel stack">
      <h2>Measurements</h2>
      {!latest && <p>No measurements at this shop.</p>}
      {latest && (
        <>
          <p className={`age ${latest.ageTone}`}>{latest.agePhrase} · {latest.ageBand}</p>
          <p className="muted">
            {formatLong(latest.takenOn)} · {METHOD_LABEL[latest.method]} · {latest.unit} · {latest.easeIncluded ? "Ease included" : "Ease not included"}
          </p>
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
      <details>
        <summary>{latest ? "New measurement set" : "Add measurements"}</summary>
        <MeasurementForm customerId={customerId} fields={fields} onSaved={onSaved} submitLabel="Save measurements" />
      </details>
      {measurements.length > 0 && (
        <details>
          <summary>History</summary>
          <div className="stack">
            {measurements.map((set) => (
              <article key={set.id}>
                <div className="spread">
                  <strong>{formatLong(set.takenOn)}</strong>
                  <span className={`age ${set.ageTone}`}>{set.agePhrase}</span>
                </div>
                <p className="muted">
                  {METHOD_LABEL[set.method]} · {set.easeIncluded ? "Ease included" : "Ease not included"}
                </p>
                <p>
                  {fields
                    .filter((field) => set.values[field.key] != null)
                    .map((field) => `${field.label} ${formatMeasure(set.values[field.key], set.unit)}`)
                    .join(" · ")}
                </p>
              </article>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
