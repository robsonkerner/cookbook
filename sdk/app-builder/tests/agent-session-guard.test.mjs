import assert from "node:assert/strict"
import { describe, test } from "node:test"

import {
  SESSION_BUSY_MESSAGE,
  acquireRunGate,
  clearSharedResource,
  getOrCreateSharedResource,
  releaseRunGate,
} from "../src/lib/app-builder/agent-session-guard.ts"

describe("App Builder agent session guard", () => {
  test("concurrent create calls share one in-flight promise", async () => {
    const state = {}
    let createCount = 0

    const create = () =>
      new Promise((resolve) => {
        createCount += 1
        setTimeout(() => resolve({ id: createCount }), 20)
      })

    const [first, second] = await Promise.all([
      getOrCreateSharedResource(state, create),
      getOrCreateSharedResource(state, create),
    ])

    assert.equal(createCount, 1)
    assert.equal(first, second)
    assert.equal(state.current, first)
  })

  test("failed create clears pending so a later caller can retry", async () => {
    const state = {}
    let attempts = 0

    await assert.rejects(
      () =>
        getOrCreateSharedResource(state, async () => {
          attempts += 1
          throw new Error("boom")
        }),
      /boom/
    )

    const value = await getOrCreateSharedResource(state, async () => {
      attempts += 1
      return "ok"
    })

    assert.equal(attempts, 2)
    assert.equal(value, "ok")
    assert.equal(state.current, "ok")
  })

  test("clearSharedResource drops current and pending handles", async () => {
    const state = {}
    await getOrCreateSharedResource(state, async () => "agent")
    clearSharedResource(state)
    assert.equal(state.current, undefined)
    assert.equal(state.pending, undefined)
  })

  test("run gate rejects overlapping chat turns", () => {
    const gate = {}
    acquireRunGate(gate)
    assert.throws(() => acquireRunGate(gate), (error) => {
      assert.equal(error instanceof Error, true)
      assert.equal(error.message, SESSION_BUSY_MESSAGE)
      return true
    })
    releaseRunGate(gate)
    acquireRunGate(gate)
    releaseRunGate(gate)
  })
})
