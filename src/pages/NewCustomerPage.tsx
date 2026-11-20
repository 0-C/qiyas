import { FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { message } from "../format";

export function NewCustomerPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState(params.get("phone") ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.createCustomer({ name, phone });
      navigate(`/customers/${result.customer.id}`);
    } catch (err) {
      setError(message(err));
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <Link className="back" to="/">Back to the bench</Link>
      <h2>New customer</h2>
      <form className="card stack" onSubmit={onSubmit}>
        <label className="field">
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} required maxLength={80} />
        </label>
        <label className="field">
          Phone
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            required
            inputMode="tel"
            placeholder="5123 4678"
          />
        </label>
        <p className="muted tiny">Kuwait mobile numbers can be entered as 8 digits. The country code is added for you.</p>
        {error && <p className="banner error">{error}</p>}
        <button className="btn" disabled={busy} type="submit">{busy ? "Saving…" : "Create customer"}</button>
      </form>
    </div>
  );
}
