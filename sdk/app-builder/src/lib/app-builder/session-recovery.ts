import path from "node:path"

export const UNKNOWN_SESSION_CODE = "unknown_session"

export function isUnknownSessionCode(code: string | undefined): boolean {
  return code === UNKNOWN_SESSION_CODE
}

/**
 * After a Next.js process restart the in-memory session Map is empty, but the
 * browser may still hold a stale session id. When the server reports
 * `unknown_session`, callers must drop that id and create a fresh session —
 * otherwise every retry keeps posting the dead id and the Retry UI (gated on
 * `!session`) never appears.
 */
export function resolveSessionIdAfterRequestError(
  sessionId: string | undefined,
  errorCode: string | undefined
): {
  clearPersistedSession: boolean
  nextSessionId: string | undefined
} {
  if (sessionId && isUnknownSessionCode(errorCode)) {
    return {
      clearPersistedSession: true,
      nextSessionId: undefined,
    }
  }

  return {
    clearPersistedSession: false,
    nextSessionId: sessionId,
  }
}

export function getSessionProjectPath(
  workspaceRoot: string,
  sessionId: string
): string {
  return path.join(workspaceRoot, sessionId, "app")
}

export function getSessionPackageJsonPath(
  workspaceRoot: string,
  sessionId: string
): string {
  return path.join(getSessionProjectPath(workspaceRoot, sessionId), "package.json")
}
