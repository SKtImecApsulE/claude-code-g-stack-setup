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

## Advisor rule

Consult the `opus-advisor` subagent (Opus 5.5) before locking a plan, after the same error twice, and before calling a task done.

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

## Brain App (visual brain)
The visual, interactive brain is the local app in `brain-app/` (see `brain-app/README.md`): `cd brain-app && bun install && bun start`.
It shows an Obsidian-style graph, answers brain-first, and can perform tasks. When answering in a Claude Code session with the gbrain MCP tools,
cite page slugs; do not publish an Artifact per question. Note: the app and a session's gbrain MCP server cannot hold the PGLite brain at the same time.

## Show the brain in chat (every brain-backed answer)
Whenever you answer a question using the gbrain MCP tools, after the text answer show the graph inline as an image. Do nothing else (no Artifact, no extra prose about it):
1. Write a JSON file in the scratchpad: `{question, nodes, edges}`. `nodes`: every page from `list_pages` (`id`=slug, `label`=short title, `type`), plus a `type:"section"` node per chunk you used (`id`="slug#chunk", short `label`, `snippet`); set `hit:true` on pages/sections used in the answer. `edges`: `{"s":"__q","t":<slug>,"kind":"hit"}` per used page, `{"s":<page>,"t":<section>,"kind":"link"}` per section, and real page-to-page links from `get_links`.
2. `node scripts/brain-snapshot.cjs <data.json> <out.png>` (needs Playwright; template is `brain-graph/index.html`).
3. Send the PNG with SendUserFile (`display: "render"`).
Draw only what the brain returned; never invent pages or links. Skip the image if the brain returned nothing.
