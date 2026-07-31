/**
 * Helpers that keep one App Builder session from attaching multiple SDK agents
 * or running overlapping chat turns against the same on-disk workspace.
 */

export type SharedResourceState<T> = {
  current?: T
  pending?: Promise<T>
}

/**
 * Deduplicate concurrent create() calls so only one resource is constructed.
 * Failures clear `pending` so a later caller can retry.
 */
export function getOrCreateSharedResource<T>(
  state: SharedResourceState<T>,
  create: () => Promise<T>
): Promise<T> {
  if (state.current !== undefined) {
    return Promise.resolve(state.current)
  }

  if (!state.pending) {
    state.pending = create()
      .then((value) => {
        state.current = value
        return value
      })
      .catch((error) => {
        state.pending = undefined
        throw error
      })
  }

  return state.pending
}

export function clearSharedResource<T>(state: SharedResourceState<T>) {
  state.current = undefined
  state.pending = undefined
}

export type RunGateState = {
  active?: true
}

export const SESSION_BUSY_MESSAGE =
  "Cursor is still working on the previous request. Wait a moment and try again."

/** Synchronously claim the session for one chat turn, or throw if busy. */
export function acquireRunGate(state: RunGateState) {
  if (state.active) {
    throw new Error(SESSION_BUSY_MESSAGE)
  }

  state.active = true
}

export function releaseRunGate(state: RunGateState) {
  state.active = undefined
}
