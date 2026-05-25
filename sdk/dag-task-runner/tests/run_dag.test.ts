import assert from "node:assert/strict";
import { test } from "node:test";

import { initialRunState } from "../src/canvas_writer.js";
import type { RunState, TaskState } from "../src/canvas_writer.js";
import type { RawTask } from "../src/dag.js";
import { __test } from "../src/run_dag.js";

function makeTask(id = "task-a"): RawTask {
  return {
    id,
    depends_on: [],
    complexity: "LOW",
    subtask_prompt: "Do the task",
  };
}

function makeState(task: RawTask): {
  state: RunState;
  stateById: Map<string, TaskState>;
} {
  const state = initialRunState(
    { title: "Test DAG", tasks: [task] },
    () => "auto-low",
  );
  return {
    state,
    stateById: new Map(state.tasks.map((t) => [t.id, t])),
  };
}

function makeWriter(onSchedule: () => void): { schedule: () => void } {
  return {
    schedule: onSchedule,
  };
}

test("runTask times out stalled agent creation and marks the task failed", async () => {
  const task = makeTask();
  const { state, stateById } = makeState(task);
  let writes = 0;
  const activeSdkTasks = __test.createActiveSdkTasks();

  await __test.runTask(
    task,
    stateById,
    state,
    makeWriter(() => {
      writes++;
    }),
    process.cwd(),
    {
      taskTimeoutMs: 10,
      streamPublishMs: 1,
      streamIdleTimeoutMs: 100,
      createAgent: () => new Promise(() => undefined),
      activeSdkTasks,
    },
  );

  assert.equal(state.tasks[0].status, "ERROR");
  assert.match(state.tasks[0].errorMessage ?? "", /initializing Cursor agent/);
  assert.equal(activeSdkTasks.agents.size, 0);
  assert.equal(activeSdkTasks.runs.size, 0);
  assert.ok(writes >= 2);
});

test("runTask times out stalled send and disposes the created agent", async () => {
  const task = makeTask();
  const { state, stateById } = makeState(task);
  const activeSdkTasks = __test.createActiveSdkTasks();
  let disposed = false;

  await __test.runTask(
    task,
    stateById,
    state,
    makeWriter(() => undefined),
    process.cwd(),
    {
      taskTimeoutMs: 10,
      streamPublishMs: 1,
      streamIdleTimeoutMs: 100,
      createAgent: async () => ({
        send: () => new Promise(() => undefined),
        async [Symbol.asyncDispose]() {
          disposed = true;
        },
      }),
      activeSdkTasks,
    },
  );

  assert.equal(state.tasks[0].status, "ERROR");
  assert.match(state.tasks[0].errorMessage ?? "", /starting agent run/);
  assert.equal(disposed, true);
  assert.equal(activeSdkTasks.agents.size, 0);
  assert.equal(activeSdkTasks.runs.size, 0);
});

test("cancelActiveSdkTasks cancels active runs before disposing agents", async () => {
  const activeSdkTasks = __test.createActiveSdkTasks();
  const calls: string[] = [];

  activeSdkTasks.runs.set("task-a", {
    status: "running",
    stream: async function* () {},
    wait: async () => ({ status: "finished" }),
    cancel: async () => {
      calls.push("cancel");
    },
  });
  activeSdkTasks.agents.set("task-a", {
    async [Symbol.asyncDispose]() {
      calls.push("dispose");
    },
  });

  await __test.cancelActiveSdkTasks(activeSdkTasks);

  assert.deepEqual(calls, ["cancel", "dispose"]);
});
