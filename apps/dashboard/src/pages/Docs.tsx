export function Docs() {
  return (
    <section className="content-page docs-layout"><div>
      <div className="eyebrow">DOCUMENTATION</div>
      <h1>Using Vinnexx Code</h1>
      <p>Run Vinnexx and select a trusted workspace. New projects are created inside that workspace, never inside the Vinnexx source directory.</p>
      <div className="code-block"><code>vinnexx</code></div>
      <h2>Commands</h2>
      <div className="command-table">{[
        ["/help", "Show commands"], ["/login", "Connect an account"], ["/profile", "Show account and limits"],
        ["/model strummer", "Coding-focused mode"], ["/model united", "Automation-focused mode"],
        ["/setup edit", "Edit local settings"], ["/project PATH", "Switch trusted workspace"],
        ["/memory", "List synced memories"], ["/undo", "Undo the last local task"], ["/redo", "Redo an undone task"]
      ].map(([command, description]) => <div key={command}><code>{command}</code><span>{description}</span></div>)}</div>
      <h2>Privacy</h2>
      <p>The initial request sends the instruction and a limited workspace tree. File content is sent only after a file tool request. Sensitive file patterns require explicit approval.</p>
      <h2>Tool permissions</h2>
      <p>Paths remain inside the trusted workspace. Symbolic-link escapes are rejected. Shell commands and deletions require local confirmation.</p>
    </div></section>
  );
}
