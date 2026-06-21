import assert from "node:assert/strict";
import test from "node:test";

import { initialRunState, type RunState } from "../src/canvas_writer.js";
import { createModelResolver, parseDAG } from "../src/dag.js";
import {
  cancelActiveExecutions,
  runTask,
  type ActiveExecution,
} from "../src/run_dag.js";

class TestWriter {
  readonly snapshots: RunState[] = [];

  schedule(state: RunState): void {
    this.snapshots.push(state);
  }
}

function oneTaskState() {
  const dag = parseDAG({
    title: "Lifecycle test",
    tasks: [
      {
        id: "setup",
        depends_on: [],
        complexity: "LOW",
        subtask_prompt: "Do setup work",
      },
    ],
  });
  const state = initialRunState(dag, createModelResolver());
  const stateById = new Map(state.tasks.map((task) => [task.id, task]));
  return { task: dag.tasks[0], state, stateById };
}

test("runTask records Agent.create failures as task-local errors", async () => {
  const { task, state, stateById } = oneTaskState();
  const writer = new TestWriter();
  const activeExecutions = new Set<ActiveExecution>();

  await runTask(
    task,
    stateById,
    state,
    writer as never,
    process.cwd(),
    {
      taskTimeoutMs: 1_000,
      streamPublishMs: 1,
      streamIdleTimeoutMs: 50,
      activeExecutions,
      createAgent: async () => {
        throw new Error("model unavailable");
      },
    },
  );

  assert.equal(state.tasks[0].status, "ERROR");
  assert.match(state.tasks[0].errorMessage ?? "", /model unavailable/);
  assert.equal(activeExecutions.size, 0);
  assert.ok(writer.snapshots.some((snapshot) => snapshot.tasks[0].status === "ERROR"));
});

test("cancelActiveExecutions cancels active runs and disposes agents", async () => {
  let cancelCount = 0;
  let disposeCount = 0;
  const activeExecutions = new Set<ActiveExecution>([
    {
      taskId: "write-files",
      run: {
        status: "running",
        stream: async function* () {},
        wait: async () => ({ status: "finished" }),
        cancel: async () => {
          cancelCount += 1;
        },
      },
      agent: {
        send: async () => {
          throw new Error("unused");
        },
        [Symbol.asyncDispose]: async () => {
          disposeCount += 1;
        },
      },
    },
  ]);

  await cancelActiveExecutions(activeExecutions, "interrupted");

  assert.equal(cancelCount, 1);
  assert.equal(disposeCount, 1);
});
