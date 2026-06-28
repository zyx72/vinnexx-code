# Vinnexx Code v0.3.0 Architecture

## Flow

```text
terminal input
  -> local command or authenticated chat request
  -> server prompt mode selection
  -> tool calls
  -> validated local execution in trusted workspace
  -> tool result review
  -> final response
```

The client exposes only Strummer0.5 and United0.5. Internal routing, credentials, and hidden prompts remain server-side.

## Client modules

```text
apps/client/src/
├── index.ts
├── api.ts
├── auth.ts
├── storage.ts
├── tools.ts
├── workspace.ts
└── tui/
    ├── app.ts
    ├── screen.ts
    ├── input.ts
    ├── activity.ts
    ├── markdown.ts
    ├── setup-menu.ts
    └── theme.ts
```

## Reliability

- monotonic activity timers;
- one active renderer timer;
- AbortController cancellation;
- eight tool-review rounds maximum;
- request and continuation IDs;
- head/tail truncation for large tool output;
- cached and bounded workspace trees;
- honest local fallback when final review times out.
