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
