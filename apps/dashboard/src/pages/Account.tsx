import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError, jsonBody } from "../api";
import { useAuth } from "../auth-context";
import type { Device, MemoryItem, Summary, Usage } from "../types";

export function Account() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [memory, setMemory] = useState({ key: "", value: "" });
  const [error, setError] = useState("");

  async function load() {
    try {
      const [nextUsage, nextDevices, nextMemories, nextSummaries] = await Promise.all([
        api<Usage>("/account/usage"), api<Device[]>("/device/list"), api<MemoryItem[]>("/account/memory"), api<Summary[]>("/account/summaries")
      ]);
      setUsage(nextUsage); setDevices(nextDevices); setMemories(nextMemories); setSummaries(nextSummaries);
    } catch (value) { setError(value instanceof ApiError ? value.message : "Unable to load account."); }
  }

  useEffect(() => { void load(); }, []);

  async function saveMemory(event: FormEvent) {
    event.preventDefault();
    await api("/account/memory", { method: "PUT", body: jsonBody(memory) });
    setMemory({ key: "", value: "" });
    await load();
  }

  async function logout() {
    await api("/auth/logout", { method: "POST", body: "{}" });
    setUser(null); navigate("/");
  }

  const percentage = usage?.limit ? Math.min(100, Math.round((usage.used / usage.limit) * 100)) : 0;
  return (
    <section className="dashboard-grid">
      <div className="panel account-header full-span"><div><div className="eyebrow">ACCOUNT</div><h1>{user?.username}</h1><p>{user?.email}</p></div><div className="plan-badge">{user?.plan}</div></div>
      {error ? <div className="error-box full-span">{error}</div> : null}
      <div className="panel"><h2>Hourly usage</h2><div className="usage-number">{usage?.remaining ?? "∞"}<small> remaining</small></div><div className="meter"><span style={{ width: `${percentage}%` }} /></div><p className="muted">{usage?.used ?? 0} used of {usage?.limit ?? "unlimited"}. Reset {usage ? new Date(usage.resetAt).toLocaleTimeString() : "—"}.</p></div>
      <div className="panel"><h2>Plan</h2><h3>{user?.plan === "free" ? "Free" : "Pro"}</h3><p>{user?.plan === "free" ? "1,000 Vinnexx tokens per UTC hour." : "Managed limits configured by Vinnexx."}</p></div>
      <div className="panel full-span"><h2>Connected devices</h2><div className="list-stack">{devices.length ? devices.map((device) => <div className="list-row" key={device.id}><div><strong>{device.name}</strong><span>{device.platform} · last seen {new Date(device.lastSeenAt).toLocaleString()}</span></div><button className="button danger small" disabled={!device.active} onClick={async () => { await api("/device/revoke", { method: "POST", body: jsonBody({ deviceId: device.id }) }); await load(); }}>{device.active ? "Revoke" : "Revoked"}</button></div>) : <p className="muted">No connected terminal yet.</p>}</div></div>
      <div className="panel full-span"><h2>Account memory</h2><form className="inline-form" onSubmit={saveMemory}><input placeholder="key" value={memory.key} onChange={(event) => setMemory({ ...memory, key: event.target.value })} required /><input placeholder="preference or behavior" value={memory.value} onChange={(event) => setMemory({ ...memory, value: event.target.value })} required /><button className="button primary">Save</button></form><div className="list-stack">{memories.map((item) => <div className="list-row" key={item.key}><div><strong>{item.key}</strong><span>{item.value}</span></div><button className="button ghost small" onClick={async () => { await api("/account/memory", { method: "DELETE", body: jsonBody({ key: item.key }) }); await load(); }}>Delete</button></div>)}</div></div>
      <div className="panel full-span"><h2>Recent task summaries</h2><div className="summary-list">{summaries.length ? summaries.map((summary) => <details key={summary.id}><summary>{summary.prompt.slice(0, 100)} <span>{new Date(summary.createdAt).toLocaleString()}</span></summary><p>{summary.finalAnswer}</p><ul>{summary.changes.map((change) => <li key={`${change.kind}-${change.path}`}>{change.kind}: <code>{change.path}</code></li>)}</ul></details>) : <p className="muted">No completed CLI tasks yet.</p>}</div></div>
      <div className="full-span"><button className="button ghost" onClick={() => void logout()}>Sign out</button></div>
    </section>
  );
}
