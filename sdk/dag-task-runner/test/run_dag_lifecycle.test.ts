import assert from "node:assert/strict";
import { test } from "node:test";

import { parseDAG, createModelResolver } from "../src/dag.js";
import { initialRunState, type RunState } from "../src/canvas_writer.js";
import { runTask } from "../src/run_dag.js";

const TASK_TIMEOUT_MS = 20;

test("runTask marks agent creation failures on the task instead of rejecting", async () => {
  const { task, state, stateById, writer } = testHarness();

  await runTask(task, stateById, state, writer, process.cwd(), {
    taskTimeoutMs: TASK_TIMEOUT_MS,
    streamPublishMs: 1,
    streamIdleTimeoutMs: TASK_TIMEOUT_MS,
    activeRuns: new Map(),
    createAgent: async () => {
      throw new Error("auth failed");
    },
  });

  const taskState = stateById.get(task.id)!;
  assert.equal(taskState.status, "ERROR");
  assert.match(taskState.errorMessage ?? "", /auth failed/);
  assert.equal(writer.snapshots.at(-1)?.tasks[0]?.status, "ERROR");
});

test("runTask applies the task timeout to stalled agent creation", async () => {
  const { task, state, stateById, writer } = testHarness();

  await runTask(task, stateById, state, writer, process.cwd(), {
    taskTimeoutMs: TASK_TIMEOUT_MS,
    streamPublishMs: 1,
    streamIdleTimeoutMs: TASK_TIMEOUT_MS,
    activeRuns: new Map(),
    createAgent: () => new Promise(() => {}),
  });

  const taskState = stateById.get(task.id)!;
  assert.equal(taskState.status, "ERROR");
  assert.match(taskState.errorMessage ?? "", /did not create an agent/);
  assert.equal(writer.snapshots.at(-1)?.tasks[0]?.status, "ERROR");
});

test("runTask cancels a run that starts after send timed out", async () => {
  const { task, state, stateById, writer } = testHarness();
  let canceled = false;
  let disposed = false;
  const lateRun = {
    status: "running",
    stream: async function* () {},
    wait: async () => ({ status: "finished" }),
    cancel: async () => {
      canceled = true;
    },
  };

  await runTask(task, stateById, state, writer, process.cwd(), {
    taskTimeoutMs: TASK_TIMEOUT_MS,
    streamPublishMs: 1,
    streamIdleTimeoutMs: TASK_TIMEOUT_MS,
    activeRuns: new Map(),
    createAgent: () => ({
      send: () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(lateRun), TASK_TIMEOUT_MS + 10);
        }),
      [Symbol.asyncDispose]: async () => {
        disposed = true;
      },
    }),
  });

  assert.equal(stateById.get(task.id)!.status, "ERROR");
  assert.match(stateById.get(task.id)!.errorMessage ?? "", /did not start a run/);

  await delay(TASK_TIMEOUT_MS + 20);
  assert.equal(canceled, true);
  assert.equal(disposed, true);
});

test("runTask records a finished run and removes it from the active registry", async () => {
  const { task, state, stateById, writer } = testHarness();
  const activeRuns = new Map();

  await runTask(task, stateById, state, writer, process.cwd(), {
    taskTimeoutMs: 200,
    streamPublishMs: 1,
    streamIdleTimeoutMs: 200,
    activeRuns,
    createAgent: () => ({
      send: () => ({
        status: "finished",
        stream: async function* () {
          yield {
            type: "assistant",
            message: { content: [{ type: "text", text: "done" }] },
          };
        },
        wait: async () => ({
          status: "finished",
          durationMs: 12,
          usage: { inputTokens: 3, outputTokens: 4 },
        }),
      }),
      [Symbol.asyncDispose]: async () => {},
    }),
  });

  const taskState = stateById.get(task.id)!;
  assert.equal(taskState.status, "FINISHED");
  assert.equal(taskState.resultText, "done");
  assert.equal(taskState.inputTokens, 3);
  assert.equal(taskState.outputTokens, 4);
  assert.equal(activeRuns.size, 0);
  assert.equal(writer.snapshots.at(-1)?.tasks[0]?.status, "FINISHED");
});

function testHarness(): {
  task: ReturnType<typeof parseDAG>["tasks"][number];
  state: RunState;
  stateById: Map<string, RunState["tasks"][number]>;
  writer: RecordingWriter;
} {
  const dag = parseDAG({
    title: "Lifecycle test",
    tasks: [
      {
        id: "task-a",
        depends_on: [],
        complexity: "LOW",
        subtask_prompt: "Do a small task.",
      },
    ],
  });
  const state = initialRunState(dag, createModelResolver());
  const stateById = new Map(state.tasks.map((taskState) => [taskState.id, taskState]));
  return { task: dag.tasks[0], state, stateById, writer: new RecordingWriter() };
}

class RecordingWriter {
  readonly snapshots: RunState[] = [];

  schedule(state: RunState): void {
    this.snapshots.push(JSON.parse(JSON.stringify(state)) as RunState);
  }
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
