import assert from "node:assert/strict";
import { test } from "node:test";

import {
  UPSTREAM_SNIPPET_CAP,
  truncateUpstreamSnippet,
} from "../src/upstream_context.js";

test("truncateUpstreamSnippet leaves short text unchanged", () => {
  assert.equal(truncateUpstreamSnippet("hello", 10), "hello");
});

test("truncateUpstreamSnippet keeps the tail of long parent outputs", () => {
  const preface = "A".repeat(1800);
  const contracts = [
    "",
    "## Final contracts",
    "- MUST write src/auth.ts with signIn(email, password)",
    "- MUST reject empty passwords",
    "- Schema: users(id uuid, email text unique)",
  ].join("\n");
  const full = `${preface}${contracts}`;
  assert.ok(full.length > UPSTREAM_SNIPPET_CAP);

  const snippet = truncateUpstreamSnippet(full, UPSTREAM_SNIPPET_CAP);

  assert.equal(snippet.length, UPSTREAM_SNIPPET_CAP);
  assert.ok(snippet.startsWith("…"), "truncated marker should lead the kept tail");
  assert.ok(
    snippet.includes("MUST write src/auth.ts"),
    "actionable ending contracts must survive truncation",
  );
  assert.ok(
    snippet.includes("Schema: users(id uuid, email text unique)"),
    "final schema lines must survive truncation",
  );
  assert.ok(
    !snippet.includes("A".repeat(100)),
    "long head preface should be dropped, not the conclusion",
  );
});

test("truncateUpstreamSnippet never keeps a head-only window", () => {
  const head = "HEAD_ONLY_MARKER_" + "h".repeat(100);
  const tail = "TAIL_ONLY_MARKER_" + "t".repeat(100);
  const full = `${head}${".".repeat(2500)}${tail}`;
  const snippet = truncateUpstreamSnippet(full, 200);

  assert.ok(snippet.includes("TAIL_ONLY_MARKER_"));
  assert.ok(!snippet.includes("HEAD_ONLY_MARKER_"));
});
