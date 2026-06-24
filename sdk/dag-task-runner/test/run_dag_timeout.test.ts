import assert from "node:assert/strict";
import test from "node:test";

import type { RawTask } from "../src/dag.ts";
import type { CanvasWriter, RunState, TaskState } from "../src/canvas_writer.ts";
import {
  runTask,
  type RunnerAgent,
  type RunnerAgentFactory,
} from "../src/run_dag.ts";

const TASK_TIMEOUT_MS = 20;

test("runTask times out stalled SDK agent creation", async () => {
  const { task, state, stateById, writer } = makeTaskState();
  const neverCreates: RunnerAgentFactory = () => new Promise<RunnerAgent>(() => {});

  await runTask(task, stateById, state, writer, process.cwd(), testOptions(), neverCreates);

  const taskState = state.tasks[0];
  assert.equal(taskState.status, "ERROR");
  assert.match(taskState.errorMessage ?? "", /exceeded deadline .*SDK agent creation/);
});

test("runTask times out stalled SDK send and disposes the agent", async () => {
  const { task, state, stateById, writer } = makeTaskState();
  let disposed = false;
  const agent: RunnerAgent = {
    send: () => new Promise(() => {}),
    [Symbol.asyncDispose]: async () => {
      disposed = true;
    },
  };

  await runTask(
    task,
    stateById,
    state,
    writer,
    process.cwd(),
    testOptions(),
    () => agent,
  );

  const taskState = state.tasks[0];
  assert.equal(taskState.status, "ERROR");
  assert.match(taskState.errorMessage ?? "", /exceeded deadline .*SDK send/);
  assert.equal(disposed, true);
});

function makeTaskState(): {
  task: RawTask;
  state: RunState;
  stateById: Map<string, TaskState>;
  writer: CanvasWriter;
} {
  const task: RawTask = {
    id: "stalled",
    depends_on: [],
    complexity: "LOW",
    subtask_prompt: "Do work",
  };
  const state: RunState = {
    title: "timeout test",
    startedAt: Date.now(),
    tasks: [
      {
        ...task,
        status: "PENDING",
        model: "test-model",
      },
    ],
  };
  return {
    task,
    state,
    stateById: new Map(state.tasks.map((t) => [t.id, t])),
    writer: { schedule: () => {} } as unknown as CanvasWriter,
  };
}

function testOptions(): {
  taskTimeoutMs: number;
  streamPublishMs: number;
  streamIdleTimeoutMs: number;
} {
  return {
    taskTimeoutMs: TASK_TIMEOUT_MS,
    streamPublishMs: 1,
    streamIdleTimeoutMs: TASK_TIMEOUT_MS,
  };
}
