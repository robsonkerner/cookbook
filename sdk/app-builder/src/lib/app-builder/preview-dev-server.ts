/**
 * Keep a session's Vite preview process alive across crashes/exits.
 * Creation is deduplicated so concurrent session/chat calls do not spawn two servers.
 */

export type DevProcessLike = {
  killed: boolean
  exitCode: number | null
}

export function isDevProcessAlive(
  proc: DevProcessLike | null | undefined
): boolean {
  if (!proc) {
    return false
  }

  if (proc.killed) {
    return false
  }

  // Node sets exitCode once the child has exited; treat that as dead even if
  // a caller has not cleared its session.devProcess handle yet.
  if (proc.exitCode !== null) {
    return false
  }

  return true
}

export type EnsureDevServerState = {
  pending?: Promise<void>
}

/**
 * If the preview process is dead, start exactly one restart (shared across
 * concurrent callers). After a failed start, callers may retry on the next
 * ensure — `pending` is cleared in `finally`.
 */
export async function ensureDevServerRunning(
  state: EnsureDevServerState,
  options: {
    isAlive: () => boolean
    start: () => Promise<void>
  }
): Promise<void> {
  if (options.isAlive()) {
    return
  }

  if (!state.pending) {
    state.pending = options
      .start()
      .finally(() => {
        state.pending = undefined
      })
  }

  await state.pending

  if (!options.isAlive()) {
    throw new Error("Preview server failed to restart.")
  }
}
