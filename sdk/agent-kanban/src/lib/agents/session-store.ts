import type { PublicUser, RepositoryOption } from "./types"

export type LiveSession = {
  id: string
  apiKey: string
  user: PublicUser | null
}

export type RepositoryCacheEntry = {
  loadedAt: number
  repositories: RepositoryOption[]
  rawById: Map<string, unknown>
}

const globalForAgentKanban = globalThis as typeof globalThis & {
  __agentKanbanSessions?: Map<string, LiveSession>
  __agentKanbanRepositoryCache?: Map<string, RepositoryCacheEntry>
}

const sessions =
  globalForAgentKanban.__agentKanbanSessions ?? new Map<string, LiveSession>()
globalForAgentKanban.__agentKanbanSessions = sessions

const repositoryCache =
  globalForAgentKanban.__agentKanbanRepositoryCache ??
  new Map<string, RepositoryCacheEntry>()
globalForAgentKanban.__agentKanbanRepositoryCache = repositoryCache

export function getLiveSession(sessionId: string): LiveSession | undefined {
  return sessions.get(sessionId)
}

export function putLiveSession(session: LiveSession): void {
  sessions.set(session.id, session)
}

export function getRepositoryCache(
  apiKey: string
): RepositoryCacheEntry | undefined {
  return repositoryCache.get(apiKey)
}

export function setRepositoryCache(
  apiKey: string,
  entry: RepositoryCacheEntry
): void {
  repositoryCache.set(apiKey, entry)
}

/**
 * Drop every in-memory session and API-key-keyed cache entry.
 * Called when the user forgets their API key so revocation is real, not just
 * clearing the persisted settings file / browser cookie.
 */
export function revokeAllLiveSessions(): void {
  sessions.clear()
  repositoryCache.clear()
}
