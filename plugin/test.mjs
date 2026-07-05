// Trust-layer unit tests — run: node --test plugin/test.mjs
// Uses a throwaway PA_DATA_DIR; exercises the plugin through the same api
// surface OpenClaw uses (captured hooks + tool execute functions).
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.PA_DATA_DIR = mkdtempSync(join(tmpdir(), "pa-test-"));
const { default: plugin, classify } = await import("./dist/index.js");

const hooks = {};
const tools = {};
plugin.register({
  on: (name, fn) => (hooks[name] = fn),
  registerTool: (t) => (tools[t.name] = t),
});
const exec = (name, params = {}) => tools[name].execute("t", params);
const gate = (toolName, params, sessionKey = "s1") =>
  hooks.before_tool_call({ toolName, params }, { sessionKey });
const mailbox = () => JSON.parse(readFileSync(join(process.env.PA_DATA_DIR, "mock-mailbox.json"), "utf8"));
const bodyText = (r) => r.content[0].text;

await exec("gmail_list_inbox"); // seeds the mailbox

test("classifier: deterministic rules", () => {
  assert.equal(classify("gmail_archive", { email_id: "m1" }), "archive_newsletter");
  assert.equal(classify("gmail_archive", { email_id: "m2" }), null); // unknown sender
  assert.equal(classify("gmail_archive", { email_id: "m3" }), "financial");
  assert.equal(classify("gmail_create_draft", { email_id: "m3", to: "x", body: "y" }), "financial");
  assert.equal(classify("gmail_create_draft", { to: "x", body: "y" }), "draft_reply");
  assert.equal(classify("gmail_send_draft", { draft_id: "d1" }), "send_email");
  assert.equal(classify("nonsense_tool", {}), null);
});

test("gate: auto passes, confirm requires approval, financial/unknown block", () => {
  assert.equal(gate("gmail_archive", { email_id: "m1" }), undefined); // auto
  const conf = gate("gmail_create_draft", { to: "a@b", body: "hi" });
  assert.ok(conf.requireApproval, "confirm tier must require approval");
  assert.equal(conf.requireApproval.timeoutBehavior, "deny"); // fails closed
  const fin = gate("gmail_archive", { email_id: "m3" });
  assert.equal(fin.block, true); // financial always escalates
  const unk = gate("gmail_archive", { email_id: "m2" });
  assert.equal(unk.block, true); // no rule → escalate
});

test("2A session provenance: content-bearing session downgrades auto→confirm", () => {
  gate("gmail_read_email", { email_id: "m4" }, "dirty"); // marks session
  const r = gate("gmail_archive", { email_id: "m1" }, "dirty");
  assert.ok(r?.requireApproval, "auto must downgrade to confirm after content read");
  assert.match(r.requireApproval.description, /downgraded auto→confirm/);
  assert.equal(gate("gmail_archive", { email_id: "m1" }, "clean"), undefined); // other session unaffected
});

test("ledger: executions recorded with inverse pointers; streak counts confirm-tier", async () => {
  const r = await exec("gmail_create_draft", { to: "sarah@acme.example", body: "hi" });
  assert.match(bodyText(r), /draft d\d+ created/);
  const ledger = bodyText(await exec("trust_ledger", { limit: 5 }));
  assert.match(ledger, /gmail_create_draft \[draft_reply\/confirm\] reversible/);
  const pol = bodyText(await exec("trust_policy"));
  assert.match(pol, /draft_reply: tier=confirm streak=1/);
});

test("deny resets the streak (onResolution)", async () => {
  const conf = gate("gmail_create_draft", { to: "a@b", body: "x" });
  await conf.requireApproval.onResolution("deny");
  assert.match(bodyText(await exec("trust_policy")), /draft_reply: tier=confirm streak=0/);
});

test("promotion: refused before streak, granted after, revocable", async () => {
  let r = await exec("trust_promote", { task_type: "draft_reply" });
  assert.match(bodyText(r), /not yet earned/);
  // earn the streak: 10 executed (≈approved) drafts; pitch appears at 10
  let last;
  for (let i = 0; i < 10; i++) last = await exec("gmail_create_draft", { to: "a@b", body: `n${i}` });
  assert.match(bodyText(last), /10 clean approvals in a row/);
  r = await exec("trust_promote", { task_type: "draft_reply" });
  assert.match(bodyText(r), /promoted to auto/);
  assert.equal(gate("gmail_create_draft", { to: "a@b", body: "now auto" }, "clean2"), undefined);
  r = await exec("trust_revoke", { task_type: "draft_reply" });
  assert.match(bodyText(r), /demoted to confirm; streak reset/);
  assert.ok(gate("gmail_create_draft", { to: "a@b", body: "gated again" }, "clean3").requireApproval);
});

test("trust_promote is itself approval-gated", () => {
  const r = gate("trust_promote", { task_type: "draft_reply" });
  assert.ok(r.requireApproval);
  assert.equal(r.requireApproval.severity, "critical");
});

test("undo: LIFO with preconditions, halts at irreversible, itself ledgered", async () => {
  // topmost reversible entry is the earlier trust_promote → its inverse demotes
  let r = await exec("trust_undo", {});
  assert.match(bodyText(r), /demoted draft_reply back to confirm ✓/);
  // next LIFO reversible entry is a draft → undo discards it
  const before = mailbox().drafts.filter((d) => !d.discarded).length;
  r = await exec("trust_undo", {});
  assert.match(bodyText(r), /discarded draft d\d+ ✓/);
  assert.equal(mailbox().drafts.filter((d) => !d.discarded).length, before - 1);
  assert.match(bodyText(await exec("trust_ledger", { limit: 3 })), /trust_undo/);

  // precondition: sabotage the next target (already discarded) → world-changed halt
  const mb = mailbox();
  const target = mb.drafts.filter((d) => !d.discarded).at(-1);
  target.discarded = true;
  writeFileSync(join(process.env.PA_DATA_DIR, "mock-mailbox.json"), JSON.stringify(mb));
  r = await exec("trust_undo", {});
  assert.match(bodyText(r), /world changed.*halting/s);

  // irreversible: send a draft, then undo must halt at it
  const mb2 = mailbox();
  const live = mb2.drafts.find((d) => !d.discarded && !d.sent);
  r = await exec("gmail_send_draft", { draft_id: live.id }); // send_email is confirm-tier; execute directly (tests bypass the gate by design)
  assert.match(bodyText(r), /sent draft/);
  r = await exec("trust_undo", {});
  assert.match(bodyText(r), /IRREVERSIBLE — halting/);
});
