# Brain App

A local, working "second brain": your GBrain knowledge base plus a Claude agent that is **brain-first** and can also do tasks.
Ask anything in the box. The graph (Obsidian-style) lights up with the pages and sections the agent pulls from the brain,
tool calls appear as chips, and the cited answer streams into the side panel. Click any node to read the page.

## Run it

```bash
./scripts/setup-brain.sh        # once per machine: installs gstack + gbrain, creates the local brain
cd brain-app && bun install && bun start
# open http://127.0.0.1:3737
```

Needs: [Bun](https://bun.sh), `gbrain` on PATH, and a Claude login (Claude Code) or `ANTHROPIC_API_KEY`.

## What it can do

- **Answer from your brain.** Every question is searched against the brain first (an automatic retrieval is attached, and the
  agent must search more); answers cite page slugs.
- **Pull info on anything.** If the brain has nothing, it uses web search/fetch and says so.
- **Perform tasks.** Read/write/edit files in `brain-app/workspace/`, research, draft. Shell (`Bash`) is **off** by default.
- **Remember.** Ask it to "remember X" or "save this as a page"; new pages appear in the graph after the answer.

## Settings (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `PORT` / `BIND` | `3737` / `127.0.0.1` | Where it listens. Keep it on localhost: the agent can write files. |
| `BRAIN_ALLOW_BASH` | off | `1` lets the agent run shell commands. Only enable on a machine you trust. |
| `BRAIN_WORKSPACE` | `brain-app/workspace` | Where task files go. |
| `BRAIN_MODEL` | SDK default | Pin a Claude model. |
| `GBRAIN_HOME`, `GBRAIN_BIN` | gbrain defaults | Use a different brain or binary. |

## Things to know

- **One process owns the brain.** PGLite allows a single holder. While this app runs it holds the database, so a Claude Code
  session's own `gbrain` MCP server will report `pglite_busy`. Use the app, or stop it first.
- **Search is keyword-only** until you set an OpenAI or Voyage key and re-init with an embedding model (see `CLAUDE.md`).
- **Getting notes in:** `./scripts/import-notes.sh --stop-app <folder-of-markdown>` (stops the app, imports, restarts it). Or tell the agent to save pages.
- The brain lives in `~/.gbrain` on the machine running the app. Cloud containers are ephemeral, so run this on your own computer.
