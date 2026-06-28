import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError, jsonBody } from "../api";
import { useAuth } from "../auth-context";
import type { User } from "../types";

export function Register() {
  const [form, setForm] = useState({ email: "", username: "", password: "" });
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
      const user = await api<User>("/auth/register", {
        method: "POST",
        body: jsonBody(form)
      });
      setUser(user);
      navigate(search.get("next") || "/account", { replace: true });
    } catch (value) {
      setError(value instanceof ApiError ? value.message : "Unable to create account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-wrap">
      <form className="panel auth-card" onSubmit={submit}>
        <div className="eyebrow">CREATE ACCOUNT</div>
        <h1>Start with the Free plan</h1>
        <label>Username<input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} minLength={3} maxLength={32} required /></label>
        <label>Email<input type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></label>
        <label>Password<input type="password" autoComplete="new-password" minLength={10} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required /></label>
        <p className="muted">Use at least 10 characters. Passwords are stored as salted scrypt hashes.</p>
        {error ? <div className="error-box">{error}</div> : null}
        <button className="button primary" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
        <p className="muted">Already registered? <Link to="/login">Sign in</Link>.</p>
      </form>
    </section>
  );
}
