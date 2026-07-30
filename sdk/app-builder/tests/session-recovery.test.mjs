import assert from "node:assert/strict"
import path from "node:path"
import { describe, test } from "node:test"

import {
  getSessionPackageJsonPath,
  getSessionProjectPath,
  resolveSessionIdAfterRequestError,
  UNKNOWN_SESSION_CODE,
} from "../src/lib/app-builder/session-recovery.ts"

describe("App Builder stale session recovery", () => {
  test("unknown_session drops the stale id so a fresh session can be created", () => {
    const result = resolveSessionIdAfterRequestError(
      "dead-session-id",
      UNKNOWN_SESSION_CODE
    )

    assert.equal(result.clearPersistedSession, true)
    assert.equal(result.nextSessionId, undefined)
  })

  test("other errors keep the session id for a normal retry", () => {
    const result = resolveSessionIdAfterRequestError(
      "live-session-id",
      "invalid_api_key"
    )

    assert.equal(result.clearPersistedSession, false)
    assert.equal(result.nextSessionId, "live-session-id")
  })

  test("missing session id never requests a clear", () => {
    const result = resolveSessionIdAfterRequestError(
      undefined,
      UNKNOWN_SESSION_CODE
    )

    assert.equal(result.clearPersistedSession, false)
    assert.equal(result.nextSessionId, undefined)
  })

  test("session project paths point at the on-disk workspace layout", () => {
    const root = "/tmp/app-builder-sessions"
    const sessionId = "11111111-2222-3333-4444-555555555555"

    assert.equal(
      getSessionProjectPath(root, sessionId),
      path.join(root, sessionId, "app")
    )
    assert.equal(
      getSessionPackageJsonPath(root, sessionId),
      path.join(root, sessionId, "app", "package.json")
    )
  })
})
