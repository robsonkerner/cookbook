import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"

export const PROJECT_NAME_WORKSPACE_PREFIX = "app-builder-project-name-"

type DisposableAgent = {
  close?: () => void
  [Symbol.asyncDispose]?: () => Promise<void>
}

type CancellableRun = {
  status?: string
  cancel?: () => Promise<void> | void
}

export async function createProjectNameWorkspace(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), PROJECT_NAME_WORKSPACE_PREFIX))
}

export function isIsolatedProjectNameWorkspace(workspacePath: string): boolean {
  const resolved = path.resolve(workspacePath)
  const tmpRoot = path.resolve(os.tmpdir())
  const relative = path.relative(tmpRoot, resolved)

  return (
    relative !== "" &&
    !relative.startsWith("..") &&
    !path.isAbsolute(relative) &&
    path.basename(resolved).startsWith(PROJECT_NAME_WORKSPACE_PREFIX)
  )
}

export function buildProjectNameAgentOptions(apiKey: string, workspacePath: string) {
  if (!isIsolatedProjectNameWorkspace(workspacePath)) {
    throw new Error(
      "Project name agent workspace must be an isolated directory under the system temp folder."
    )
  }

  return {
    apiKey,
    name: "app-builder-project-name",
    model: { id: process.env.CURSOR_PROJECT_NAME_MODEL ?? "composer-2" },
    local: {
      cwd: path.resolve(workspacePath),
    },
  }
}

export async function disposeProjectNameAgent(
  agent: DisposableAgent | null | undefined,
  run: CancellableRun | null | undefined,
  workspacePath: string | undefined
) {
  if (run && run.status !== "finished" && run.status !== "error" && run.status !== "cancelled") {
    if (typeof run.cancel === "function") {
      await Promise.resolve(run.cancel()).catch(() => undefined)
    }
  }

  if (agent) {
    if (typeof agent[Symbol.asyncDispose] === "function") {
      await agent[Symbol.asyncDispose]().catch(() => undefined)
    } else {
      agent.close?.()
    }
  }

  if (workspacePath) {
    await fs.rm(workspacePath, { recursive: true, force: true }).catch(() => undefined)
  }
}
