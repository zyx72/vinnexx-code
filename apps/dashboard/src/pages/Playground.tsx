import { useState, type FormEvent } from "react";
import { api, ApiError, jsonBody } from "../api";
import type { Usage } from "../types";

export function Playground() {
  const [message, setMessage] = useState("");
  const [answer, setAnswer] = useState("");
  const [usage, setUsage] = useState<Usage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setAnswer("");
    try {
      const result = await api<{ content: string; usage: Usage }>("/playground/chat", { method: "POST", body: jsonBody({ message }) });
      setAnswer(result.content); setUsage(result.usage);
    } catch (value) { setError(value instanceof ApiError ? value.message : "Playground request failed."); }
    finally { setBusy(false); }
  }
  return <section className="content-page"><div className="eyebrow">PLAYGROUND</div><h1>Try Strummer0.5 in the browser</h1><p>The playground is chat-only. It cannot access or modify files on your device.</p><form className="playground" onSubmit={submit}><textarea rows={8} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Ask a coding question…" required /><button className="button primary" disabled={busy}>{busy ? "Thinking…" : "Send"}</button></form>{error ? <div className="error-box">{error}</div> : null}{answer ? <div className="panel response-card"><pre>{answer}</pre>{usage ? <p className="muted">{usage.remaining ?? "∞"} tokens remain this hour.</p> : null}</div> : null}</section>;
}
