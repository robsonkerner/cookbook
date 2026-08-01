import assert from "node:assert/strict"
import { describe, test } from "node:test"

import {
  ensureDevServerRunning,
  isDevProcessAlive,
} from "../src/lib/app-builder/preview-dev-server.ts"

describe("App Builder preview dev server ensure", () => {
  test("isDevProcessAlive is false for missing, killed, or exited children", () => {
    assert.equal(isDevProcessAlive(undefined), false)
    assert.equal(isDevProcessAlive(null), false)
    assert.equal(
      isDevProcessAlive({ killed: true, exitCode: null }),
      false
    )
    assert.equal(
      isDevProcessAlive({ killed: false, exitCode: 1 }),
      false
    )
    assert.equal(
      isDevProcessAlive({ killed: false, exitCode: 0 }),
      false
    )
    assert.equal(
      isDevProcessAlive({ killed: false, exitCode: null }),
      true
    )
  })

  test("ensure skips start when the process is already alive", async () => {
    const state = {}
    let starts = 0

    await ensureDevServerRunning(state, {
      isAlive: () => true,
      start: async () => {
        starts += 1
      },
    })

    assert.equal(starts, 0)
    assert.equal(state.pending, undefined)
  })

  test("concurrent ensure calls share one in-flight restart", async () => {
    const state = {}
    let starts = 0
    let alive = false

    const start = () =>
      new Promise((resolve) => {
        starts += 1
        setTimeout(() => {
          alive = true
          resolve()
        }, 20)
      })

    await Promise.all([
      ensureDevServerRunning(state, { isAlive: () => alive, start }),
      ensureDevServerRunning(state, { isAlive: () => alive, start }),
    ])

    assert.equal(starts, 1)
    assert.equal(alive, true)
    assert.equal(state.pending, undefined)
  })

  test("failed restart clears pending so a later ensure can retry", async () => {
    const state = {}
    let attempts = 0
    let alive = false

    await assert.rejects(
      () =>
        ensureDevServerRunning(state, {
          isAlive: () => alive,
          start: async () => {
            attempts += 1
            throw new Error("vite down")
          },
        }),
      /vite down/
    )

    assert.equal(state.pending, undefined)

    await ensureDevServerRunning(state, {
      isAlive: () => alive,
      start: async () => {
        attempts += 1
        alive = true
      },
    })

    assert.equal(attempts, 2)
    assert.equal(alive, true)
  })

  test("ensure rejects when start resolves but process is still dead", async () => {
    const state = {}

    await assert.rejects(
      () =>
        ensureDevServerRunning(state, {
          isAlive: () => false,
          start: async () => {},
        }),
      /failed to restart/
    )
  })
})
