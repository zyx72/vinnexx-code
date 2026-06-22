import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, ApiError, jsonBody } from "../api";
import { useAuth } from "../auth-context";

type Inspect = {
  userCode: string;
  deviceName: string;
  platform: string;
  status: "pending" | "approved" | "denied";
  expiresAt: string;
};

export function AuthConnect() {
  const [search] = useSearchParams();
  const code = (search.get("id") || "").toUpperCase();
  const { user } = useAuth();
  const [request, setRequest] = useState<Inspect | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!code) return;
    api<Inspect>(`/device/inspect?id=${encodeURIComponent(code)}`)
      .then(setRequest)
      .catch((value) => setError(value instanceof ApiError ? value.message : "Connection request unavailable."));
  }, [code]);

  async function decide(action: "approve" | "deny") {
    setError("");
    try {
      await api(`/device/${action}`, { method: "POST", body: jsonBody({ userCode: code }) });
      setDone(true);
    } catch (value) {
      setError(value instanceof ApiError ? value.message : "Unable to update connection request.");
    }
  }

  if (!code) return <section className="panel"><h1>Missing connection code</h1></section>;
  if (!user) {
    const next = `/auth?id=${encodeURIComponent(code)}`;
    return <section className="auth-wrap"><div className="panel auth-card"><h1>Connect Vinnexx Code</h1><p>Sign in before approving this terminal.</p><Link className="button primary" to={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link><Link className="button ghost" to={`/register?next=${encodeURIComponent(next)}`}>Create account</Link></div></section>;
  }
  if (done) return <section className="auth-wrap"><div className="panel auth-card"><div className="success-mark">✓</div><h1>Connection updated</h1><p>Return to your terminal. Vinnexx Code will continue automatically.</p></div></section>;

  return (
    <section className="auth-wrap">
      <div className="panel auth-card">
        <div className="eyebrow">DEVICE AUTHORIZATION</div>
        <h1>Connect account to Vinnexx Code?</h1>
        {request ? <div className="device-preview"><strong>{request.deviceName}</strong><span>{request.platform}</span><code>{request.userCode}</code></div> : <p>Loading request…</p>}
        <p>Approving gives this terminal access to your Vinnexx account, plan, memory and Sora0.5 quota. Local project access remains controlled by the terminal.</p>
        {error ? <div className="error-box">{error}</div> : null}
        <div className="button-row"><button className="button primary" disabled={!request} onClick={() => void decide("approve")}>Connect account</button><button className="button ghost" disabled={!request} onClick={() => void decide("deny")}>Deny</button></div>
      </div>
    </section>
  );
}
