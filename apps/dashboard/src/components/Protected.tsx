import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../auth-context";
import type { ReactNode } from "react";

export function Protected({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="panel">Loading account…</div>;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (admin && user.role !== "admin") return <Navigate to="/account" replace />;
  return <>{children}</>;
}
