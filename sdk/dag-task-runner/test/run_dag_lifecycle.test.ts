import assert from "node:assert/strict";
import test from "node:test";

import type { RawTask } from "../src/dag.js";
import { cleanupActiveTasks, runTask } from "../src/run_dag.js";
import type { CanvasWriter, RunState, TaskState } from "../src/canvas_writer.js";

process.env.CURSOR_API_KEY ??= "test-key";

test("runTask applies the task deadline to agent creation", async () => {
  const { state, stateById, task, taskState, writer } = makeTaskHarness();

  await runTask(task, stateById, state, writer, "/tmp", new Map(), {
    taskTimeoutMs: 10,
    streamPublishMs: 0,
    streamIdleTimeoutMs: 100,
    agentFactory: {
      create: () => new Promise(() => undefined),
    },
  });

  assert.equal(taskState.status, "ERROR");
  assert.match(taskState.errorMessage ?? "", /did not create an agent/);
});

test("runTask cancels late prompt dispatches after a send timeout", async () => {
  const { state, stateById, task, taskState, writer } = makeTaskHarness();
  let cancelCount = 0;
  let disposeCount = 0;
  const lateRun = {
    status: "running",
    stream: async function* () {},
    wait: async () => ({ status: "finished" }),
    cancel: async () => {
      cancelCount += 1;
    },
  };
  const agent = {
    send: () => delay(30).then(() => lateRun),
    [Symbol.asyncDispose]: async () => {
      disposeCount += 1;
    },
  };

  await runTask(task, stateById, state, writer, "/tmp", new Map(), {
    taskTimeoutMs: 10,
    streamPublishMs: 0,
    streamIdleTimeoutMs: 100,
    agentFactory: {
      create: () => agent,
    },
  });

  assert.equal(taskState.status, "ERROR");
  assert.match(taskState.errorMessage ?? "", /did not dispatch prompt/);

  await delay(50);
  assert.equal(cancelCount, 1);
  assert.equal(disposeCount, 1);
});

test("cleanupActiveTasks cancels active runs and disposes active agents", async () => {
  let cancelled = false;
  let disposed = false;
  const activeTask = {
    taskId: "task",
    cleanupRequested: false,
    run: {
      cancel: async () => {
        cancelled = true;
      },
    },
    agent: {
      send: async () => ({
        stream: async function* () {},
        wait: async () => ({ status: "finished" }),
      }),
      [Symbol.asyncDispose]: async () => {
        disposed = true;
      },
    },
  };

  await cleanupActiveTasks(new Map([["task", activeTask]]), "test shutdown");

  assert.equal(activeTask.cleanupRequested, true);
  assert.equal(cancelled, true);
  assert.equal(disposed, true);
});

function makeTaskHarness(): {
  state: RunState;
  stateById: Map<string, TaskState>;
  task: RawTask;
  taskState: TaskState;
  writer: CanvasWriter;
} {
  const task: RawTask = {
    id: "task",
    depends_on: [],
    complexity: "LOW",
    subtask_prompt: "Do the task.",
  };
  const taskState: TaskState = {
    ...task,
    status: "PENDING",
    model: "test-model",
  };
  const state: RunState = {
    title: "test",
    startedAt: Date.now(),
    tasks: [taskState],
  };
  const writer = {
    schedule: () => undefined,
  } as unknown as CanvasWriter;

  return {
    state,
    stateById: new Map([[task.id, taskState]]),
    task,
    taskState,
    writer,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
