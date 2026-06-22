import { useEffect, useState } from "react";
import { api, jsonBody } from "../api";

type AdminUser = { id: string; email: string; username: string; plan: "free" | "pro"; role: string; createdAt: string };
type Config = { publicModelName: string; providerModel: string; corePrompt: string; identityPrompt: string };

export function Admin() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [config, setConfig] = useState<Config | null>(null);
  async function load() { const [u, c] = await Promise.all([api<AdminUser[]>("/admin/users"), api<Config>("/admin/system-config")]); setUsers(u); setConfig(c); }
  useEffect(() => { void load(); }, []);
  return <section className="content-page"><div className="eyebrow">ADMINISTRATION</div><h1>Vinnexx management</h1><div className="panel"><h2>Users</h2><div className="list-stack">{users.map((user) => <div className="list-row" key={user.id}><div><strong>{user.username}</strong><span>{user.email} · {user.role}</span></div><select value={user.plan} onChange={async (event) => { await api("/admin/users/plan", { method: "PUT", body: jsonBody({ userId: user.id, plan: event.target.value }) }); await load(); }}><option value="free">free</option><option value="pro">pro</option></select></div>)}</div></div>{config ? <form className="panel admin-config" onSubmit={async (event) => { event.preventDefault(); await api("/admin/system-config", { method: "PUT", body: jsonBody(config) }); alert("Configuration saved."); }}><h2>AI server configuration</h2><label>Public model name<input value={config.publicModelName} onChange={(event) => setConfig({ ...config, publicModelName: event.target.value })} /></label><label>Provider model<input value={config.providerModel} onChange={(event) => setConfig({ ...config, providerModel: event.target.value })} /></label><label>Core prompt<textarea rows={14} value={config.corePrompt} onChange={(event) => setConfig({ ...config, corePrompt: event.target.value })} /></label><label>Identity prompt<textarea rows={7} value={config.identityPrompt} onChange={(event) => setConfig({ ...config, identityPrompt: event.target.value })} /></label><button className="button primary">Save server configuration</button></form> : null}</section>;
}
