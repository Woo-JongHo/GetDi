---
name: designer-guide
description: Guide a non-developer designer through GetDi setup, startup, workflow, troubleshooting, and local Claude/Codex model connection. Use when the user invokes /designer-guide or asks how to install, run, connect, or recover GetDi in Claude Code.
---

# Designer Guide

Guide the user in Korean, one verified step at a time. Treat `docs/designer-guide.md` as the knowledge source of truth; read only the section needed for the current step instead of reproducing the whole guide.

## Start

1. Run `node .claude/skills/designer-guide/scripts/diagnose.mjs` from the repository root.
2. Read the JSON report. Never infer a pass that the report did not establish.
3. Start with the first `fail`; if none exists, start with the first `unknown`. If every stage passes, offer the workflow entry point.
4. Explain what the result means in plain Korean.
5. Give exactly one command or one UI action, followed by its visible success signal.
6. Wait for the result before advancing when the action changes the environment or requires login.

Do not install packages, start login, edit configuration, or change files unless the user explicitly asks. Do not ask for, read, echo, or store API keys, tokens, cookies, or credential-file contents.

## Route requests

- No argument or `status`: diagnose and resume at the first incomplete stage.
- `api`: explain the model connection below, then diagnose only the relevant CLI/server stages.
- `workflow`: use `docs/designer-guide.md` sections 5–8 to walk through crawl → card list → summary → draft.
- `troubleshoot`: diagnose first, then use section 9 for the matching symptom.
- A specific error: address that error first and preserve the one-step rule.

## Explain the model connection

Use this exact boundary:

```text
Browser UI
  → /api/* on the local Vite server
  → server/model.mjs
  → local `claude -p` or `codex exec` CLI
  → the CLI's own signed-in account
```

Clarify that GetDi does not call a hosted model API directly and does not need an API key pasted into this repository. The diagnostic proves command availability, not account authentication. To confirm authentication, have the user open the relevant CLI and follow its own login screen; never inspect its credential storage. Production is read-only and uses `public/snapshot/`, so generation is local-only.

## Interpret stages

- `runtime`: Node 20+ and npm must pass before package setup.
- `dependencies`: if missing, offer `npm install`; success is a completed command without `npm ERR!`.
- `claude_cli` / `codex_cli`: at least the CLI selected for the intended model task must be present. An absent optional provider is not a blocker unless the user selects it.
- `local_server`: `unknown` means the server is not currently reachable, not that installation is broken. Offer `npm run dev`; success is `Local: http://localhost:5545/`.
- `authentication`: always manual/unknown unless the user reports a successful CLI login. Never turn absence of evidence into a failure.

Finish each response with the current stage, the next single action, and the success signal.
