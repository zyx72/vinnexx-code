import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth-context";

export function Layout() {
  const { user } = useAuth();
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" to="/">
          <span className="brand-mark">V</span>
          <span>Vinnexx Code</span>
        </Link>
        <nav className="nav-links" aria-label="Primary navigation">
          <NavLink to="/install">Install</NavLink>
          <NavLink to="/docs">Docs</NavLink>
          <NavLink to="/playground">Playground</NavLink>
          {user ? <NavLink to="/account">Account</NavLink> : <NavLink to="/login">Login</NavLink>}
          {user?.role === "admin" ? <NavLink to="/admin">Admin</NavLink> : null}
        </nav>
      </header>
      <main className="main-content">
        <Outlet />
      </main>
      <footer className="footer">
        <span>Vinnexx Code v0.3.0</span>
        <span>Privacy-first terminal coding</span>
      </footer>
    </div>
  );
}
