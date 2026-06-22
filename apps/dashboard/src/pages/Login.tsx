import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError, jsonBody } from "../api";
import { useAuth } from "../auth-context";
import type { User } from "../types";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [search] = useSearchParams();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const user = await api<User>("/auth/login", {
        method: "POST",
        body: jsonBody({ email, password })
      });
      setUser(user);
      navigate(search.get("next") || "/account", { replace: true });
    } catch (value) {
      setError(value instanceof ApiError ? value.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-wrap">
      <form className="panel auth-card" onSubmit={submit}>
        <div className="eyebrow">ACCOUNT ACCESS</div>
        <h1>Sign in to Vinnexx</h1>
        <label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        {error ? <div className="error-box">{error}</div> : null}
        <button className="button primary" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        <p className="muted">No account? <Link to="/register">Create one</Link>.</p>
      </form>
    </section>
  );
}
