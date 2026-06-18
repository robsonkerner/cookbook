import assert from "node:assert/strict";
import { test } from "node:test";

import { initialRunState, type RunState } from "../src/canvas_writer.js";
import type { RawTask } from "../src/dag.js";
import {
  runTask,
  type AgentCreateConfig,
  type RunnerAgent,
  type RunnerAgentFactory,
  type RunnerTaskRun,
} from "../src/run_dag.js";

const TASK_TIMEOUT_MS = 30;

test("runTask marks task ERROR when Agent.create stalls past task timeout", async () => {
  const { task, state, stateById, writer } = createTaskHarness();
  let disposed = false;
  let resolveCreate: ((agent: RunnerAgent) => void) | undefined;
  const agent: RunnerAgent = {
    send: async () => successfulRun(),
    [Symbol.asyncDispose]: async () => {
      disposed = true;
    },
  };
  const agentFactory: RunnerAgentFactory = {
    create: () =>
      new Promise<RunnerAgent>((resolve) => {
        resolveCreate = resolve;
      }),
  };

  await runTask(task, stateById, state, writer, process.cwd(), {
    taskTimeoutMs: TASK_TIMEOUT_MS,
    streamPublishMs: 1,
    streamIdleTimeoutMs: 1000,
    agentFactory,
  });

  const taskState = stateById.get(task.id);
  assert.equal(taskState?.status, "ERROR");
  assert.match(taskState?.errorMessage ?? "", /did not initialize/);

  resolveCreate?.(agent);
  await waitFor(() => disposed);
  assert.equal(disposed, true);
});

test("runTask marks task ERROR and cancels late run when agent.send stalls", async () => {
  const { task, state, stateById, writer } = createTaskHarness();
  let cancelled = false;
  let disposed = false;
  let resolveSend: ((run: RunnerTaskRun) => void) | undefined;
  const lateRun: RunnerTaskRun = {
    status: "running",
    cancel: async () => {
      cancelled = true;
    },
    stream: async function* () {},
    wait: async () => ({ status: "finished" }),
  };
  const agent: RunnerAgent = {
    send: () =>
      new Promise<RunnerTaskRun>((resolve) => {
        resolveSend = resolve;
      }),
    [Symbol.asyncDispose]: async () => {
      disposed = true;
    },
  };
  const agentFactory: RunnerAgentFactory = {
    create: (_config: AgentCreateConfig) => agent,
  };

  await runTask(task, stateById, state, writer, process.cwd(), {
    taskTimeoutMs: TASK_TIMEOUT_MS,
    streamPublishMs: 1,
    streamIdleTimeoutMs: 1000,
    agentFactory,
  });

  const taskState = stateById.get(task.id);
  assert.equal(taskState?.status, "ERROR");
  assert.match(taskState?.errorMessage ?? "", /did not start/);
  assert.equal(disposed, true);

  resolveSend?.(lateRun);
  await waitFor(() => cancelled);
  assert.equal(cancelled, true);
});

function createTaskHarness(): {
  task: RawTask;
  state: RunState;
  stateById: Map<string, RunState["tasks"][number]>;
  writer: { states: RunState[]; schedule: (state: RunState) => void };
} {
  const task: RawTask = {
    id: "stalled",
    depends_on: [],
    complexity: "LOW",
    subtask_prompt: "Do work",
  };
  const dag = {
    title: "Lifecycle test",
    tasks: [task],
  };
  const state = initialRunState(dag, () => "test-model");
  const stateById = new Map(state.tasks.map((t) => [t.id, t]));
  const writer = {
    states: [] as RunState[],
    schedule(snapshot: RunState): void {
      this.states.push(snapshot);
    },
  };
  return { task, state, stateById, writer };
}

function successfulRun(): RunnerTaskRun {
  return {
    status: "finished",
    stream: async function* () {},
    wait: async () => ({ status: "finished" }),
  };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 1000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail("Timed out waiting for predicate");
}
