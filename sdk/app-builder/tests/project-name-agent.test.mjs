import assert from "node:assert/strict"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, test } from "node:test"

import {
  PROJECT_NAME_WORKSPACE_PREFIX,
  buildProjectNameAgentOptions,
  createProjectNameWorkspace,
  disposeProjectNameAgent,
  isIsolatedProjectNameWorkspace,
} from "../src/lib/app-builder/project-name-agent.ts"

describe("App Builder project-name agent isolation", () => {
  test("createProjectNameWorkspace is under tmpdir with a dedicated prefix", async () => {
    const workspace = await createProjectNameWorkspace()

    try {
      assert.equal(isIsolatedProjectNameWorkspace(workspace), true)
      assert.equal(
        path.dirname(path.resolve(workspace)),
        path.resolve(os.tmpdir())
      )
      assert.ok(
        path.basename(workspace).startsWith(PROJECT_NAME_WORKSPACE_PREFIX)
      )
    } finally {
      await fs.rm(workspace, { recursive: true, force: true })
    }
  })

  test("buildProjectNameAgentOptions pins the agent to the isolated workspace", async () => {
    const workspace = await createProjectNameWorkspace()

    try {
      const options = buildProjectNameAgentOptions("crsr_test", workspace)

      assert.equal(options.local.cwd, path.resolve(workspace))
      assert.equal(options.model.id, "composer-2")
      assert.equal("cloud" in options, false)
    } finally {
      await fs.rm(workspace, { recursive: true, force: true })
    }
  })

  test("buildProjectNameAgentOptions rejects the host process cwd", () => {
    assert.throws(
      () => buildProjectNameAgentOptions("crsr_test", process.cwd()),
      /isolated directory/
    )
    assert.equal(isIsolatedProjectNameWorkspace(process.cwd()), false)
    assert.equal(isIsolatedProjectNameWorkspace(os.tmpdir()), false)
    assert.equal(
      isIsolatedProjectNameWorkspace(path.join(os.tmpdir(), "..", "etc")),
      false
    )
  })

  test("disposeProjectNameAgent cancels a running run, awaits dispose, and removes the workspace", async () => {
    const workspace = await createProjectNameWorkspace()
    const events = []
    const agent = {
      async [Symbol.asyncDispose]() {
        events.push("dispose")
      },
      close() {
        events.push("close")
      },
    }
    const run = {
      status: "running",
      async cancel() {
        events.push("cancel")
      },
    }

    await disposeProjectNameAgent(agent, run, workspace)

    assert.deepEqual(events, ["cancel", "dispose"])
    await assert.rejects(fs.stat(workspace), (error) => error.code === "ENOENT")
  })

  test("disposeProjectNameAgent does not cancel an already finished run", async () => {
    const workspace = await createProjectNameWorkspace()
    let cancelled = false

    await disposeProjectNameAgent(
      {
        close() {},
      },
      {
        status: "finished",
        async cancel() {
          cancelled = true
        },
      },
      workspace
    )

    assert.equal(cancelled, false)
    await assert.rejects(fs.stat(workspace), (error) => error.code === "ENOENT")
  })
})
