## gstack (REQUIRED — global install)

**Before doing ANY work, verify gstack is installed:**

```bash
test -d ~/.claude/skills/gstack/bin && echo "GSTACK_OK" || echo "GSTACK_MISSING"
```

If GSTACK_MISSING: STOP. Do not proceed. Tell the user:

> gstack is required for all AI-assisted work in this repo.
> Install it:
> ```bash
> git clone --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack
> cd ~/.claude/skills/gstack && ./setup --team
> ```
> Then restart your AI coding tool.

Do not skip skills, ignore gstack errors, or work around missing gstack.

Using gstack skills: After install, skills like /qa, /ship, /review, /investigate,
and /browse are available. Use /browse for all web browsing.
Use ~/.claude/skills/gstack/... for gstack file paths (the global path).

## GBrain Configuration (configured by /setup-gbrain)
- Mode: local-stdio
- Engine: pglite (keyword search; add OPENAI_API_KEY or VOYAGE_API_KEY and re-run `gbrain init --force --pglite --embedding-model <id>` for semantic search)
- Config file: ~/.gbrain/config.json (mode 0600)
- Setup date: 2026-11-09
- MCP registered: yes (user scope)
- Artifacts sync: off
- Transcript ingest: off (needs explicit consent)
- Current repo policy: read-write
- Fresh machine or new cloud session: run `./scripts/setup-brain.sh` (the brain lives in ~/.gbrain and does not persist across ephemeral containers)

## GBrain Visual Answers
Whenever you answer a question using the gbrain MCP tools (`search`, `query`, `recall`, `entity`, `traverse_graph`, `get_backlinks`), also show it as an Obsidian-style graph:
1. Take `brain-graph/index.html` as the template. Replace only the JSON inside `<script id="data">`: `question`, `nodes` (every page from `list_pages`; `hit: true` for pages used in the answer, with a short `snippet`), and `edges` (`{"s":"__q","t":<slug>,"kind":"hit"}` per used page, plus `{"kind":"link"}` page-to-page edges from `get_links`/`get_backlinks`).
2. Publish it with the Artifact tool, keeping the same URL: https://claude.ai/artifact/RmEaAVjQgxpdRenNG3iZYq (send the data change as `edits` on `brain-graph/index.html`).
3. Give the link in the answer, plus a one-line Mermaid fallback for terminal-only clients.
Draw only what the brain returned. Never invent pages or links. Skip the graph if the brain returned nothing.
