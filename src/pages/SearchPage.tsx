import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { message } from "../format";
import type { SearchResult } from "../types";

export function SearchPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const q = query.trim();
    if (!q) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const found = await api.search(q);
      if (found.result === "customer") navigate(`/customers/${found.customerId}`);
      else if (found.result === "order") navigate(`/customers/${found.customerId}?order=${found.orderId}`);
      else setResult(found);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <h1>Search</h1>
      <form className="search-form" onSubmit={onSubmit}>
        <label className="field" style={{ flex: 1 }}>
          <span className="visually-hidden">Phone or label code</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Phone or label code"
            inputMode="tel"
            autoComplete="off"
            aria-label="Phone or label code"
          />
        </label>
        <button className="btn" disabled={busy} type="submit">{busy ? "Searching…" : "Search"}</button>
      </form>
      {error && <p className="banner error">{error}</p>}
      {result?.result === "create" && (
        <div className="prompt">
          <p>No customer for {result.phone}.</p>
          <Link className="btn" to={`/customers/new?phone=${encodeURIComponent(result.phone)}`}>Create new customer</Link>
        </div>
      )}
      {result?.result === "none" && <p className="banner">{result.message}</p>}
    </div>
  );
}
