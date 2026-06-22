export function Docs() {
  return (
    <section className="content-page docs-layout">
      <div>
        <div className="eyebrow">DOCUMENTATION</div>
        <h1>Using Vinnexx Code</h1>
        <p>Run Vinnexx inside the project directory you want Sora0.5 to work with.</p>
        <div className="code-block"><code>cd my-project<br />vinnexx</code></div>
        <h2>Commands</h2>
        <div className="command-table">
          {[
            ["/help", "Show commands"], ["/login", "Connect an account"], ["/status", "Show plan and hourly quota"],
            ["/project PATH", "Switch and trust a workspace"], ["/memory", "List synced account memories"],
            ["/memory set KEY VALUE", "Save a preference"], ["/undo", "Undo the last local task"],
            ["/redo", "Redo an undone task"], ["/logout", "Revoke this device"]
          ].map(([command, description]) => <div key={command}><code>{command}</code><span>{description}</span></div>)}
        </div>
        <h2>Free-plan usage</h2>
        <p>Free accounts receive 1,000 Vinnexx tokens each UTC hour. One Vinnexx token equals five Unicode characters, including spaces. Unused tokens do not accumulate.</p>
        <h2>Privacy model</h2>
        <p>The initial request sends only your instruction and a limited workspace tree. File content is sent only when Sora0.5 explicitly requests <code>read_file</code>. Secrets should never be sent; the prompt and local client both reject unsafe access patterns.</p>
        <h2>Tool permissions</h2>
        <p>Paths are constrained to the trusted workspace. Shell commands and deletions require explicit local confirmation. Critical destructive command patterns are blocked.</p>
      </div>
    </section>
  );
}
