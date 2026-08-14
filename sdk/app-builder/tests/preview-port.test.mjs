import assert from "node:assert/strict"
import net from "node:net"
import { describe, test } from "node:test"

import {
  isPreviewProcessAlive,
  reservePreviewPort,
  waitForPreviewPort,
} from "../src/lib/app-builder/preview-port.ts"

function listenOn(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once("error", reject)
    server.listen(port, "127.0.0.1", () => resolve(server))
  })
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
}

describe("App Builder preview port reservation", () => {
  test("overlapping reservations keep distinct ports bound", async () => {
    const first = await reservePreviewPort()
    const second = await reservePreviewPort()

    try {
      assert.notEqual(first.port, second.port)

      await assert.rejects(listenOn(first.port), (error) => error.code === "EADDRINUSE")
      await assert.rejects(listenOn(second.port), (error) => error.code === "EADDRINUSE")
    } finally {
      await first.release()
      await second.release()
    }

    const claimed = await listenOn(first.port)
    await closeServer(claimed)
  })

  test("release is idempotent", async () => {
    const reservation = await reservePreviewPort()
    await reservation.release()
    await reservation.release()

    const claimed = await listenOn(reservation.port)
    await closeServer(claimed)
  })

  test("isPreviewProcessAlive treats missing, killed, and exited children as dead", () => {
    assert.equal(isPreviewProcessAlive(undefined), false)
    assert.equal(isPreviewProcessAlive(null), false)
    assert.equal(isPreviewProcessAlive({ killed: true, exitCode: null }), false)
    assert.equal(isPreviewProcessAlive({ killed: false, exitCode: 1 }), false)
    assert.equal(isPreviewProcessAlive({ killed: false, exitCode: 0 }), false)
    assert.equal(isPreviewProcessAlive({ killed: false, exitCode: null }), true)
  })

  test("waitForPreviewPort succeeds when the owned process is listening", async () => {
    const reservation = await reservePreviewPort()
    const port = reservation.port
    await reservation.release()

    const server = await listenOn(port)
    try {
      await waitForPreviewPort(port, {
        timeoutMs: 1_000,
        isAlive: () => true,
      })
    } finally {
      await closeServer(server)
    }
  })

  test("waitForPreviewPort does not treat a foreign listener as ready after the child exits", async () => {
    const reservation = await reservePreviewPort()
    const port = reservation.port
    await reservation.release()

    const foreign = await listenOn(port)
    try {
      await assert.rejects(
        waitForPreviewPort(port, {
          timeoutMs: 1_000,
          isAlive: () => false,
        }),
        /exited before binding|in use by another process/
      )
    } finally {
      await closeServer(foreign)
    }
  })
})
