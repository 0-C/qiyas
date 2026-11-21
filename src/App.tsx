import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { NavLink, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { api } from "./api";
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
            <NavLink to="/" className="shop-name">{shopName}</NavLink>
            <nav aria-label="Shop">
              <NavLink to="/" end className={({ isActive }) => (isActive ? "nav active" : "nav")}>
                Dashboard
              </NavLink>
              <NavLink to="/search" className={({ isActive }) => (isActive ? "nav active" : "nav")}>
                Search
              </NavLink>
            </nav>
          </div>
          <div className="side-bottom">
            <NavLink to="/settings" className={({ isActive }) => (isActive ? "nav active" : "nav")}>
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
