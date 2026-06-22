import { Link } from "react-router-dom";

export function Home() {
  return (
    <section className="hero-grid">
      <div className="hero-copy">
        <div className="eyebrow">VINNEXX CODE · SORA0.5</div>
        <h1>Build from your terminal with a secure account-backed coding agent.</h1>
        <p>
          Vinnexx Code keeps AI logic, account data, prompts, model routing and usage controls on the server,
          while local tools remain under your device's control.
        </p>
        <div className="hero-actions">
          <Link className="button primary" to="/install">Install v0.2.0</Link>
          <Link className="button ghost" to="/docs">Read documentation</Link>
        </div>
        <div className="code-block"><code>curl -fsSL https://raw.githubusercontent.com/zyx72/vinnexx-code/main/install.sh | bash</code></div>
      </div>
      <div className="terminal-card" aria-label="Terminal preview">
        <div className="terminal-head"><span></span><span></span><span></span></div>
        <pre>{`$ vinnexx

Vinnexx Code v0.2.0
Sora0.5 · terminal coding agent

Thinking... 7s
[>_]Processing request...

Working... [18s] 80% [################____]
[>_]Editing src/index.ts...`}</pre>
      </div>
      <div className="feature-grid full-span">
        <article className="feature-card"><h3>Server-side intelligence</h3><p>Provider credentials, prompts and model routing never ship with the client.</p></article>
        <article className="feature-card"><h3>Layered API security</h3><p>Device tokens, HMAC-SHA256, timestamps, nonces, rate limits and strict validation.</p></article>
        <article className="feature-card"><h3>Local control</h3><p>File and command tools are executed locally only after workspace and risk checks.</p></article>
      </div>
    </section>
  );
}
