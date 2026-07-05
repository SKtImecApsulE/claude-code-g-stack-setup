# Personal Assistant

A chat-first automation agent that earns your trust. Built on [OpenClaw](https://openclaw.ai) with a custom **trust-layer plugin**: every action is classified deterministically, gated by tier (`auto` / `confirm` / `escalate`), written to an append-only ledger, and undoable.

Design doc + eng review: `~/.gstack/projects/.../root-claude-gstack-setup-14m35k-design-*.md` (approved, eng-cleared).

## What works today (v0, verified end-to-end)

- OpenClaw gateway + Claude (via local `claude` CLI) as the brain, local TUI chat
- Mock Gmail/Calendar tools (JSON mailbox) so the loop runs without Google credentials
- **Tier gate** (`before_tool_call` → `requireApproval`): newsletter archive runs at `auto`; drafts/sends/holds require your ✅; financial email always escalates (verified: invoice archive blocked)
- **Approval loop**: pending approval cites the motivating email; `allow-once` executes the tool (verified: draft created after approval; denied on timeout otherwise — fails closed)
- **Ledger + policy + undo**: `trust_ledger`, `trust_policy`, `trust_undo` tools (SQLite at `~/.personal-assistant/trust-layer.db`); undo re-validates preconditions ("world changed" reporting), halts at irreversible entries, and is itself ledgered
- **Injection defense (2A)**: reading any email body marks the session content-bearing — auto-tier is disabled for the rest of that session. Verified live: hostile email read, its injected instructions ignored, and a follow-up auto-tier action was forced to confirm and failed closed
- **Promotion with receipts**: executed confirm-tier actions build streaks; a deny resets the streak; at 10 the agent pitches for promotion; `trust_promote` is itself approval-gated (severity: critical) and undoable; `trust_revoke` never needs approval
- **Budget metering**: per-day model calls/tokens/USD tracked via `model_call_ended` into the same DB; $2/day warn and $5/day throttle notes; visible in `trust_policy`
- **Morning briefing cron** at 07:00 (`openclaw cron list`) — doubles as the daily heartbeat
- **Tests**: `node --test plugin/test.mjs` — classifier, gate tiers, session provenance, ledger+streaks, deny-reset, promotion lifecycle, undo preconditions. 8/8 passing

## Run it

```bash
npm install -g openclaw
cd plugin && bun build index.ts --outdir dist --target node --format esm && cd ..
openclaw plugins install ./plugin
openclaw config set gateway.mode local
openclaw config set gateway.auth.mode token
openclaw config set gateway.auth.token <pick-a-token>
openclaw config set agents.defaults.model "claude-cli/claude-opus-4-8"
openclaw config set approvals.plugin '{"enabled":true,"mode":"session"}' --json
openclaw gateway &            # IS_SANDBOX=1 prefix if running as root in a container
openclaw chat                 # talk to it
```

Approvals surface in the Control UI at `http://127.0.0.1:18789/?token=<token>`, or via:
`openclaw gateway call plugin.approval.list` / `plugin.approval.resolve --params '{"id":"...","decision":"allow-once"}'`

## To go live (needs your accounts)

1. **Telegram** (run on your own machine/VPS — Telegram's API is blocked from sandboxed CI/cloud containers):
   ```bash
   # In Telegram: message @BotFather → /newbot → copy the token
   openclaw channels add --channel telegram --bot-token "<YOUR_BOT_TOKEN>"
   openclaw gateway restart   # or stop + start
   # DM your bot once; it replies with a pairing code (owner-only by default):
   openclaw pairing approve telegram <CODE>
   ```
   Approvals (the ✅/❌ on drafts, sends, holds) then arrive as Telegram prompts. Keep `dmPolicy: "pairing"` — it's the owner-only access guardrail from the design.
2. **Google**: swap the mock tools for Gmail/Calendar MCP (`gws mcp -s gmail,calendar` or gogcli). Flip the OAuth app to "In production" first (see design doc, tension 3).
3. Host on any always-on box via Docker; put `~/.personal-assistant/` on a volume.

## Roadmap (from the eng-reviewed design)

Promotion-with-receipts (streaks → agent pitches for autonomy), session-provenance injection defense, undo preconditions, 27-path test matrix + E2E harness, briefing/digest crons, budget throttle. Task list: `Implementation Tasks` section of the design doc.
