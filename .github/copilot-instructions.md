---
name: session-recall
applyTo: ["**/*"]
description: "Inject recent session context via the session-recall CLI (auto-memory)."
---

# Session recall — auto-memory

Before responding to coding prompts in this repository, run the `session-recall` CLI to inject recent files and session summaries into the agent's context.

Try one of these (preferred order):

```powershell
# If `session-recall` is on PATH
session-recall files --json --limit 10

# If `session-recall` is NOT on PATH, use the Python module invocation
python -m session_recall files --json --limit 10
```

If the Copilot session DB is not present (`%USERPROFILE%\\.copilot\\session-store.db`), `session-recall` will print an error and nothing will be injected — continue without it.
