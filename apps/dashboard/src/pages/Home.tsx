import { Link } from "react-router-dom";

export function Home() {
  return (
    <section className="hero-grid">
      <div className="hero-copy">
        <div className="eyebrow">VINNEXX CODE · STRUMMER0.5 · UNITED0.5</div>
        <h1>Build and automate from a focused terminal workspace.</h1>
        <p>Vinnexx Code keeps account, prompt, routing, and usage controls on the server while local tools remain under the user's approval.</p>
        <div className="hero-actions">
          <Link className="button primary" to="/install">Install v0.3.0</Link>
          <Link className="button ghost" to="/docs">Read documentation</Link>
        </div>
        <div className="code-block"><code>npm install -g .</code></div>
      </div>
      <div className="terminal-card" aria-label="Terminal preview">
        <div className="terminal-head"><span></span><span></span><span></span></div>
        <pre>{`Vinnexx Code v0.3.0 · signed in · Strummer0.5
workspace /sdcard/.vinnexx/workspace

YOU
  Create a small web project.

PROCESSING 00:07 · Writing index.html · 50%
› `}</pre>
      </div>
      <div className="feature-grid full-span">
        <article className="feature-card"><h3>Two public modes</h3><p>Strummer0.5 focuses on coding. United0.5 focuses on automation and workflows.</p></article>
        <article className="feature-card"><h3>Fixed terminal UI</h3><p>Persistent header, conversation viewport, status footer, input history, and safe cleanup.</p></article>
        <article className="feature-card"><h3>Local control</h3><p>Workspace boundaries, symlink checks, command approval, deletion approval, and undo history.</p></article>
      </div>
    </section>
  );
}
