export function Install() {
  return (
    <section className="content-page">
      <div className="eyebrow">INSTALLATION</div>
      <h1>Install Vinnexx Code</h1>
      <p>Vinnexx Code v0.3.0 requires Node.js 20 or newer.</p>
      <h2>From the source folder</h2>
      <div className="code-block"><code>bash install.sh</code></div>
      <p>Or build the client and install its command globally:</p>
      <div className="code-block"><code>cd apps/client<br />npm ci<br />npm run build<br />npm install -g .</code></div>
      <p>After installation, run:</p>
      <div className="code-block"><code>vinnexx</code></div>
      <div className="notice">Account connection is performed from the terminal with /login. Local credentials are stored with restricted file permissions.</div>
    </section>
  );
}
