import net from "node:net"

export type PortReservation = {
  port: number
  release: () => Promise<void>
}

export type PreviewProcessLike = {
  killed: boolean
  exitCode: number | null
}

/**
 * Bind an ephemeral 127.0.0.1 port and keep the listener open until
 * `release()` so a later `vite --strictPort` is not racing other sessions
 * (or other local processes) for the same number during `pnpm install`.
 */
export function reservePreviewPort(): Promise<PortReservation> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.once("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      if (!address || typeof address === "string") {
        server.close()
        reject(new Error("Could not allocate a preview port."))
        return
      }

      let released = false
      const release = () =>
        new Promise<void>((releaseResolve, releaseReject) => {
          if (released) {
            releaseResolve()
            return
          }

          released = true
          server.close((error) => {
            if (error) {
              releaseReject(error)
              return
            }

            releaseResolve()
          })
        })

      resolve({ port: address.port, release })
    })
  })
}

export function isPreviewProcessAlive(
  proc: PreviewProcessLike | null | undefined
): boolean {
  if (!proc || proc.killed || proc.exitCode !== null) {
    return false
  }

  return true
}

/**
 * Wait until `127.0.0.1:port` accepts a TCP connection.
 *
 * If `isAlive` is provided, a dead preview child fails the wait even when
 * something else is already listening — otherwise `createSession` would mark
 * the preview ready against a foreign process.
 */
export function waitForPreviewPort(
  port: number,
  options: {
    timeoutMs?: number
    isAlive?: () => boolean
  } = {}
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 30_000
  const startedAt = Date.now()

  return new Promise((resolve, reject) => {
    let settled = false

    const finish = (error?: Error) => {
      if (settled) {
        return
      }

      settled = true
      if (error) {
        reject(error)
        return
      }

      resolve()
    }

    const attempt = () => {
      if (settled) {
        return
      }

      if (options.isAlive && !options.isAlive()) {
        finish(
          new Error(`Preview server exited before binding port ${port}.`)
        )
        return
      }

      const socket = net.connect(port, "127.0.0.1")
      socket.once("connect", () => {
        socket.end()
        if (options.isAlive && !options.isAlive()) {
          finish(
            new Error(`Preview port ${port} is in use by another process.`)
          )
          return
        }

        finish()
      })
      socket.once("error", () => {
        socket.destroy()
        if (settled) {
          return
        }

        if (options.isAlive && !options.isAlive()) {
          finish(
            new Error(`Preview server exited before binding port ${port}.`)
          )
          return
        }

        if (Date.now() - startedAt > timeoutMs) {
          finish(
            new Error(`Timed out waiting for preview server on ${port}.`)
          )
          return
        }

        setTimeout(attempt, 250)
      })
    }

    attempt()
  })
}
