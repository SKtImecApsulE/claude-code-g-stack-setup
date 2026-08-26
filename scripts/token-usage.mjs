#!/usr/bin/env node
/**
 * Total tokens used across all local Claude Code sessions.
 *
 * Reads the session transcripts under ~/.claude/projects/<project>/<session>.jsonl
 * and sums message.usage across every assistant message.
 *
 * One assistant message is written to the transcript once per content block, so
 * the same usage record repeats on several lines — dedupe on message.id or the
 * totals come out several times too high.
 *
 * Usage: node scripts/token-usage.mjs [transcript-dir]
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const ROOT = process.argv[2] || join(homedir(), ".claude", "projects");

function* jsonlFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* jsonlFiles(path);
    else if (entry.name.endsWith(".jsonl")) yield path;
  }
}

const totals = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
const seen = new Set();
let files = 0;
let messages = 0;

for (const file of jsonlFiles(ROOT)) {
  files++;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue; // a partially-flushed final line
    }
    const usage = entry.message?.usage;
    if (!usage) continue;
    const key = `${entry.message.id ?? entry.uuid}:${entry.requestId ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    messages++;
    totals.input += usage.input_tokens ?? 0;
    totals.output += usage.output_tokens ?? 0;
    totals.cacheWrite += usage.cache_creation_input_tokens ?? 0;
    totals.cacheRead += usage.cache_read_input_tokens ?? 0;
  }
}

const sum = totals.input + totals.output + totals.cacheWrite + totals.cacheRead;
const n = (v) => v.toLocaleString("en-US").padStart(15);

console.log(`transcripts   ${String(files).padStart(15)}`);
console.log(`messages      ${String(messages).padStart(15)}`);
console.log("");
console.log(`input         ${n(totals.input)}`);
console.log(`output        ${n(totals.output)}`);
console.log(`cache write   ${n(totals.cacheWrite)}`);
console.log(`cache read    ${n(totals.cacheRead)}`);
console.log(`${"-".repeat(29)}`);
console.log(`total         ${n(sum)}`);
