# Changelog

## v0.1.0.0 — 2026-07-05

First shipped version of the Personal Assistant: a chat-first automation agent
that earns your trust, built on OpenClaw with a custom trust-layer plugin.

- Trust layer: deterministic task-type classifier (tool + args, never
  LLM-declared; unknown → escalate), tiered gate (auto / confirm / escalate)
  on OpenClaw's before_tool_call requireApproval, fail-closed on timeout
- Append-only SQLite action ledger with inverse pointers; undo is LIFO,
  precondition-checked ("world changed" reporting), halts at irreversible
  entries, and is itself ledgered
- Injection defense: reading an email body marks the session content-bearing;
  auto-tier is disabled for the rest of that session (verified live against a
  hostile email)
- Promotion with receipts: executed approvals build per-task streaks, deny
  resets, pitch at 10; trust_promote is approval-gated (critical) and
  undoable; trust_revoke never needs approval
- Budget metering per day (calls/tokens/USD) with $2 warn / $5 throttle
- Mock Gmail/Calendar tools (JSON mailbox) so the loop runs pre-OAuth;
  07:00 morning-briefing cron doubles as heartbeat
- Tests: 8 suites via node --test (classifier, gate tiers, provenance,
  ledger/streaks, deny-reset, promotion lifecycle, undo edge cases)
