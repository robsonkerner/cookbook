import assert from "node:assert/strict"
import { test } from "node:test"

import { CodingAgentSession } from "../src/agent.ts"

type FakeAgent = {
  send: (prompt: string) => Promise<FakeRun>
  [Symbol.asyncDispose]: () => Promise<void>
}

type FakeRun = {
  stream: () => AsyncGenerator<never, void>
  wait: () => Promise<{ status: string; durationMs: number }>
  supports: () => boolean
}

function createFakeRun(): FakeRun {
  return {
    async *stream() {},
    async wait() {
      return { status: "finished", durationMs: 1 }
    },
    supports() {
      return false
    },
  }
}

test("awaits async Agent.create before sending a prompt", async () => {
  const sendOn = {
    promise: undefined as FakeAgent | undefined,
    agent: undefined as FakeAgent | undefined,
  }
  let createCalls = 0

  const session = new CodingAgentSession({
    apiKey: "crsr_test",
    cwd: "/tmp",
    force: false,
    model: { id: "composer-2" },
    createSdkAgent: async () => {
      createCalls += 1
      const agent: FakeAgent = {
        async send() {
          sendOn.agent = agent
          return createFakeRun()
        },
        async [Symbol.asyncDispose]() {},
      }
      return Promise.resolve(agent).then((value) => {
        sendOn.promise = value
        return value
      })
    },
  })

  try {
    await session.sendPrompt({
      prompt: "explain this",
      onEvent: () => {},
    })
  } finally {
    await session.dispose()
  }

  assert.equal(createCalls, 1)
  assert.ok(sendOn.agent)
  assert.equal(sendOn.agent, sendOn.promise)
})

test("still works when Agent.create returns an agent synchronously", async () => {
  let sendCalled = false
  let seenCwd: unknown

  const session = new CodingAgentSession({
    apiKey: "crsr_test",
    cwd: "/tmp",
    force: false,
    model: { id: "composer-2" },
    createSdkAgent: (options) => {
      seenCwd = options.local
      return {
        async send() {
          sendCalled = true
          return createFakeRun()
        },
        async [Symbol.asyncDispose]() {},
      }
    },
  })

  try {
    await session.sendPrompt({
      prompt: "list files",
      onEvent: () => {},
    })
  } finally {
    await session.dispose()
  }

  assert.equal(sendCalled, true)
  assert.deepEqual(seenCwd, { cwd: "/tmp" })
})

test("reset disposes the previous agent after the replacement is created", async () => {
  const disposed: string[] = []
  let nextId = 0

  const session = new CodingAgentSession({
    apiKey: "crsr_test",
    cwd: "/tmp",
    force: false,
    model: { id: "composer-2" },
    createSdkAgent: async () => {
      const id = `agent-${nextId++}`
      return {
        async send() {
          return createFakeRun()
        },
        async [Symbol.asyncDispose]() {
          disposed.push(id)
        },
      }
    },
  })

  try {
    await session.sendPrompt({
      prompt: "first",
      onEvent: () => {},
    })
    await session.reset()
    await session.sendPrompt({
      prompt: "second",
      onEvent: () => {},
    })
  } finally {
    await session.dispose()
  }

  assert.deepEqual(disposed, ["agent-0", "agent-1"])
})
