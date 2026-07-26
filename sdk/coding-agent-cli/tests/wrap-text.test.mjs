import assert from "node:assert/strict"
import { test } from "node:test"

import { wrapText } from "../src/tui/wrap-text.ts"

test("wraps normal text on word boundaries", () => {
  assert.deepEqual(wrapText("hello world", 5), ["hello", "world"])
})

test("does not hang when width is zero or negative", () => {
  const started = Date.now()
  assert.deepEqual(wrapText("x", 0), ["x"])
  assert.deepEqual(wrapText("abcdef", -5), ["a", "b", "c", "d", "e", "f"])
  assert.ok(Date.now() - started < 100)
})

test("does not hang for ordered-list content widths below one", () => {
  const marker = `${"1".repeat(80)}. `
  const contentWidth = 20 - marker.length
  const started = Date.now()
  const lines = wrapText("item text", contentWidth)
  assert.ok(lines.length > 0)
  assert.match(lines.join(""), /item/)
  assert.ok(Date.now() - started < 100)
})
