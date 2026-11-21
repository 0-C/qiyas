import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { NavLink, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { preload } from "swr";
import { api, swrFetcher } from "./api";
import { message } from "./format";
import { CustomerPage } from "./pages/CustomerPage";
import { DashboardPage } from "./pages/DashboardPage";
import { NewCustomerPage } from "./pages/NewCustomerPage";
import { NewOrderPage } from "./pages/NewOrderPage";
import { PayPage } from "./pages/PayPage";
import { SearchPage } from "./pages/SearchPage";
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
  const location = useLocation();
  const [open, setOpen] = useState(false);
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

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  const shopName = shop?.name ?? "Qiyas";

  return (
    <ShopContext.Provider value={{ shop, error, reload }}>
      <div className="app-shell">
        <aside className={open ? "side open" : "side"}>
          <div className="side-top">
            <div className="brand">
              <span className="logo">Q</span>
              <NavLink to="/" className="shop-name" onMouseEnter={() => preload("/api/dashboard", swrFetcher)}>{shopName}</NavLink>
            </div>
            <nav aria-label="Shop">
              <NavLink to="/" end className={({ isActive }) => (isActive ? "nav active" : "nav")} onMouseEnter={() => preload("/api/dashboard", swrFetcher)}>
                <Icon d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />
                Dashboard
              </NavLink>
              <NavLink to="/search" className={({ isActive }) => (isActive ? "nav active" : "nav")}>
                <Icon d="M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm10 2-5.2-5.2" />
                Search
              </NavLink>
            </nav>
          </div>
          <div className="side-bottom">
            <NavLink to="/settings" className={({ isActive }) => (isActive ? "nav active" : "nav")} onMouseEnter={() => preload("/api/shop", swrFetcher)}>
              <Icon d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z M19.4 13a7.8 7.8 0 0 0 .1-2l2-1.2-2-3.4-2.3.6a8 8 0 0 0-1.7-1L15 3h-6l-.5 2.9a8 8 0 0 0-1.7 1L4.5 6.4l-2 3.4L4.5 11a7.8 7.8 0 0 0 0 2l-2 1.2 2 3.4 2.3-.6a8 8 0 0 0 1.7 1L9 21h6l.5-2.9a8 8 0 0 0 1.7-1l2.3.6 2-3.4-2-1.3Z" />
              Settings
            </NavLink>
          </div>
        </aside>
        <div className="main-col">
          <div className="mobile-bar">
            <button className="menu-btn" type="button" onClick={() => setOpen((value) => !value)}>
              {open ? "Close" : "Menu"}
            </button>
            <span className="shop-name">{shopName}</span>
          </div>
          <main className="wrap">
            {error && <p className="banner error">{error}</p>}
            <Outlet />
          </main>
        </div>
      </div>
    </ShopContext.Provider>
  );
}

function Icon({ d }: { d: string }) {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function NotFound() {
  return (
    <main className="wrap">
      <h1>Page not found</h1>
      <p><a href="/">Dashboard</a></p>
    </main>
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<StaffShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="search" element={<SearchPage />} />
        <Route path="customers/new" element={<NewCustomerPage />} />
        <Route path="customers/:id" element={<CustomerPage />} />
        <Route path="customers/:id/new-order" element={<NewOrderPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="t/:token" element={<TrackingPage />} />
      <Route path="t/:token/pay" element={<PayPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
