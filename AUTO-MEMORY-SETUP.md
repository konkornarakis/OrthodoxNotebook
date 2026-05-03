# auto-memory — project setup

- Installed Python: "C:/Program Files/Python313/python.exe"
- Install (if needed):

```powershell
& "C:/Program Files/Python313/python.exe" -m pip install --user auto-memory
```

- Verify:

```powershell
& "C:/Program Files/Python313/python.exe" -m session_recall health
```

- Note: The CLI requires an existing Copilot session DB at `%USERPROFILE%\\.copilot\\session-store.db`. If you use GitHub Copilot CLI, ensure it's installed and has created this DB. On Windows the session DB path is:

`C:\\Users\\<you>\\.copilot\\session-store.db`

- Where we added the instruction file: `.github/copilot-instructions.md`
