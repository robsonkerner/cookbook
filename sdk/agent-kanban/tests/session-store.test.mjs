import assert from "node:assert/strict"
import { describe, test } from "node:test"

import {
  getLiveSession,
  getRepositoryCache,
  putLiveSession,
  revokeAllLiveSessions,
  setRepositoryCache,
} from "../src/lib/agents/session-store.ts"

describe("session revocation on Forget API key", () => {
  test("revokeAllLiveSessions drops sessions and API-key-keyed cache", () => {
    const sessionId = "session-forget-test"
    const apiKey = "crsr_test_key_should_not_linger"

    putLiveSession({
      id: sessionId,
      apiKey,
      user: { name: "Test user", email: "test@example.com" },
    })
    setRepositoryCache(apiKey, {
      loadedAt: Date.now(),
      repositories: [
        {
          id: "repo-1",
          label: "owner/repo",
          url: "https://github.com/owner/repo",
        },
      ],
      rawById: new Map(),
    })

    assert.ok(getLiveSession(sessionId))
    assert.ok(getRepositoryCache(apiKey))

    revokeAllLiveSessions()

    assert.equal(getLiveSession(sessionId), undefined)
    assert.equal(getRepositoryCache(apiKey), undefined)
  })
})
