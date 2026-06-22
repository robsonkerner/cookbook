import assert from "node:assert/strict";
import { test } from "node:test";

import type { RawTask } from "../src/dag.js";
import { runTask } from "../src/run_dag.js";
import type { RunState, TaskState } from "../src/canvas_writer.js";

type FakeRun = {
  stream: () => AsyncIterable<unknown>;
  wait: () => Promise<{ status: string; durationMs?: number }>;
  cancel?: () => Promise<void> | void;
  status?: string;
  durationMs?: number;
};

type FakeAgent = {
  send: (prompt: string) => Promise<FakeRun> | FakeRun;
  [Symbol.asyncDispose]?: () => Promise<void> | void;
};

function createHarness() {
  const task: RawTask = {
    id: "task-a",
    depends_on: [],
    complexity: "LOW",
    subtask_prompt: "Do the work",
  };
  const taskState: TaskState = {
    ...task,
    status: "PENDING",
    model: "auto-low",
  };
  const state: RunState = {
    title: "Lifecycle test",
    startedAt: Date.now(),
    tasks: [taskState],
  };
  const schedules: RunState[] = [];
  const writer = {
    schedule(snapshot: RunState) {
      schedules.push(snapshot);
    },
  };

  return {
    task,
    taskState,
    state,
    writer,
    schedules,
    stateById: new Map([[task.id, taskState]]),
  };
}

function baseOptions(overrides: {
  taskTimeoutMs?: number;
  streamIdleTimeoutMs?: number;
  cleanupTimeoutMs?: number;
  createAgent: () => Promise<FakeAgent>;
}) {
  return {
    taskTimeoutMs: overrides.taskTimeoutMs ?? 30,
    streamPublishMs: 0,
    streamIdleTimeoutMs: overrides.streamIdleTimeoutMs ?? 30,
    cleanupTimeoutMs: overrides.cleanupTimeoutMs ?? 10,
    createAgent: overrides.createAgent,
  };
}

test("task timeout covers Agent.create startup", async () => {
  const harness = createHarness();

  await runTask(
    harness.task,
    harness.stateById,
    harness.state,
    harness.writer as never,
    process.cwd(),
    baseOptions({
      createAgent: () => new Promise<FakeAgent>(() => undefined),
    }),
  );

  assert.equal(harness.taskState.status, "ERROR");
  assert.match(harness.taskState.errorMessage ?? "", /did not initialize/);
  assert.ok(harness.taskState.finishedAt);
});

test("task timeout covers agent.send startup and cancels a late run", async () => {
  const harness = createHarness();
  let resolveSend!: (run: FakeRun) => void;
  const sendPromise = new Promise<FakeRun>((resolve) => {
    resolveSend = resolve;
  });
  let cancelCount = 0;
  const lateRun: FakeRun = {
    status: "running",
    stream: async function* () {},
    wait: async () => ({ status: "finished" }),
    cancel: () => {
      cancelCount++;
    },
  };

  await runTask(
    harness.task,
    harness.stateById,
    harness.state,
    harness.writer as never,
    process.cwd(),
    baseOptions({
      createAgent: async () => ({
        send: () => sendPromise,
      }),
    }),
  );

  assert.equal(harness.taskState.status, "ERROR");
  assert.match(harness.taskState.errorMessage ?? "", /did not start/);

  resolveSend(lateRun);
  await Promise.resolve();

  assert.equal(cancelCount, 1);
});

test("hung run cleanup is bounded after a stream timeout", async () => {
  const harness = createHarness();
  let cancelCount = 0;
  const hangingRun: FakeRun = {
    status: "running",
    stream: () => ({
      [Symbol.asyncIterator]() {
        return {
          next: () => new Promise<IteratorResult<unknown>>(() => undefined),
        };
      },
    }),
    wait: async () => ({ status: "finished" }),
    cancel: async () => {
      cancelCount++;
      await new Promise<void>(() => undefined);
    },
  };
  const startedAt = Date.now();

  await runTask(
    harness.task,
    harness.stateById,
    harness.state,
    harness.writer as never,
    process.cwd(),
    baseOptions({
      taskTimeoutMs: 30,
      streamIdleTimeoutMs: 30,
      cleanupTimeoutMs: 10,
      createAgent: async () => ({
        send: () => hangingRun,
      }),
    }),
  );

  assert.equal(harness.taskState.status, "ERROR");
  assert.match(harness.taskState.errorMessage ?? "", /no stream events|exceeded deadline/);
  assert.ok(Date.now() - startedAt < 250);
  assert.ok(cancelCount >= 1);
});
