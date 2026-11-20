import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { NavLink, Outlet, Route, Routes } from "react-router-dom";
import { api } from "./api";
import { message } from "./format";
import { CustomerPage } from "./pages/CustomerPage";
import { DashboardPage } from "./pages/DashboardPage";
import { NewCustomerPage } from "./pages/NewCustomerPage";
import { PayPage } from "./pages/PayPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TrackingPage } from "./pages/TrackingPage";
import type { Shop } from "./types";

interface ShopState {
  shop: Shop | null;
  error: string | null;
  reload: () => Promise<void>;
}

const ShopContext = createContext<ShopState>({ shop: null, error: null, reload: async () => {} });

export function useShop(): ShopState {
  return useContext(ShopContext);
}

function StaffShell() {
  const [shop, setShop] = useState<Shop | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      const data = await api.shop();
      setShop(data.shop);
      setError(null);
    } catch (err) {
      setError(message(err));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <ShopContext.Provider value={{ shop, error, reload }}>
      <div className="tape" aria-hidden="true" />
      <header className="topbar">
        <a className="brand" href="/">
          <span className="eyebrow">Qiyas</span>
          <h1>{shop?.name ?? "Tailor bench"}</h1>
        </a>
        <nav className="nav-row" aria-label="Shop">
          <NavLink to="/" end className={({ isActive }) => (isActive ? "nav active" : "nav")}>
            Dashboard
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => (isActive ? "nav active" : "nav")}>
            Settings
          </NavLink>
        </nav>
      </header>
      <main className="wrap">
        {error && <p className="banner error">{error}</p>}
        <Outlet />
      </main>
    </ShopContext.Provider>
  );
}

function NotFound() {
  return (
    <main className="wrap">
      <h1>Page not found</h1>
      <a className="back" href="/">Back to the bench</a>
    </main>
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<StaffShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="customers/new" element={<NewCustomerPage />} />
        <Route path="customers/:id" element={<CustomerPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="t/:token" element={<TrackingPage />} />
      <Route path="t/:token/pay" element={<PayPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
