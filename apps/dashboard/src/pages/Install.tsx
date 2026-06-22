export function Install() {
  return (
    <section className="content-page">
      <div className="eyebrow">INSTALLATION</div>
      <h1>Install Vinnexx Code</h1>
      <p>Vinnexx v0.2.0 requires Node.js 20 or newer, an internet connection, and a supported shell.</p>
      <h2>Termux, Linux and macOS</h2>
      <div className="code-block"><code>curl -fsSL https://raw.githubusercontent.com/zyx72/vinnexx-code/main/install.sh | bash</code></div>
      <p>After installation, restart the terminal if needed and run:</p>
      <div className="code-block"><code>vinnexx</code></div>
      <h2>First login</h2>
      <ol>
        <li>Run <code>vinnexx</code>.</li>
        <li>The CLI opens a temporary account connection link.</li>
        <li>Sign in here and approve the displayed device.</li>
        <li>The terminal receives permanent device credentials and stores them locally with restricted permissions.</li>
      </ol>
      <div className="notice">For a private repository, host the installer and compiled client archive on a public download endpoint or generate short-lived signed download URLs.</div>
    </section>
  );
}
