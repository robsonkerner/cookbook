import assert from "node:assert/strict";
import test from "node:test";

import type { RawTask } from "../src/dag.ts";
import type { RunState } from "../src/canvas_writer.ts";
import {
  runTask,
  type RunnerAgent,
  type RunnerTaskRun,
} from "../src/run_dag.ts";

function makeTaskState(): {
  task: RawTask;
  state: RunState;
  stateById: Map<string, RunState["tasks"][number]>;
  writes: RunState[];
} {
  const task: RawTask = {
    id: "stalled-task",
    depends_on: [],
    complexity: "LOW",
    subtask_prompt: "do work",
  };
  const state: RunState = {
    title: "test dag",
    startedAt: Date.now(),
    tasks: [
      {
        ...task,
        status: "PENDING",
        model: "auto-low",
      },
    ],
  };
  const writes: RunState[] = [];
  return {
    task,
    state,
    stateById: new Map([[task.id, state.tasks[0]]]),
    writes,
  };
}

const testWriter = (writes: RunState[]) => ({
  schedule(state: RunState): void {
    writes.push(JSON.parse(JSON.stringify(state)) as RunState);
  },
});

test("runTask marks agent creation stalls as task errors", async () => {
  const { task, state, stateById, writes } = makeTaskState();

  await runTask(
    task,
    stateById,
    state,
    testWriter(writes),
    process.cwd(),
    {
      taskTimeoutMs: 20,
      streamPublishMs: 1,
      streamIdleTimeoutMs: 1_000,
    },
    () => new Promise<RunnerAgent>(() => {}),
  );

  assert.equal(state.tasks[0].status, "ERROR");
  assert.match(state.tasks[0].errorMessage ?? "", /did not create an agent/);
  assert.ok(writes.some((write) => write.tasks[0].status === "RUNNING"));
  assert.ok(writes.some((write) => write.tasks[0].status === "ERROR"));
});

test("runTask disposes an agent that appears after create timeout", async () => {
  const { task, state, stateById, writes } = makeTaskState();
  let resolveCreate: ((agent: RunnerAgent) => void) | undefined;
  let disposeCalls = 0;

  await runTask(
    task,
    stateById,
    state,
    testWriter(writes),
    process.cwd(),
    {
      taskTimeoutMs: 20,
      streamPublishMs: 1,
      streamIdleTimeoutMs: 1_000,
    },
    () =>
      new Promise<RunnerAgent>((resolve) => {
        resolveCreate = resolve;
      }),
  );

  assert.equal(state.tasks[0].status, "ERROR");
  assert.equal(disposeCalls, 0);

  assert.ok(resolveCreate, "agentFactory should have been called");
  resolveCreate({
    send: async () => {
      throw new Error("should not send after timeout");
    },
    [Symbol.asyncDispose]: async () => {
      disposeCalls += 1;
    },
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(disposeCalls, 1);
});

test("runTask cancels a run that starts after send timeout", async () => {
  const { task, state, stateById, writes } = makeTaskState();
  let resolveSend: ((run: RunnerTaskRun) => void) | undefined;
  let cancelCalls = 0;
  let disposeCalls = 0;

  const lateRun: RunnerTaskRun = {
    status: "running",
    stream: async function* () {},
    wait: async () => ({ status: "finished" }),
    cancel: async () => {
      cancelCalls += 1;
    },
  };
  const agent: RunnerAgent = {
    send: async () =>
      new Promise<RunnerTaskRun>((resolve) => {
        resolveSend = resolve;
      }),
    [Symbol.asyncDispose]: async () => {
      disposeCalls += 1;
    },
  };

  await runTask(
    task,
    stateById,
    state,
    testWriter(writes),
    process.cwd(),
    {
      taskTimeoutMs: 20,
      streamPublishMs: 1,
      streamIdleTimeoutMs: 1_000,
    },
    async () => agent,
  );

  assert.equal(state.tasks[0].status, "ERROR");
  assert.match(state.tasks[0].errorMessage ?? "", /did not start/);
  assert.equal(disposeCalls, 1);
  assert.equal(cancelCalls, 0);

  assert.ok(resolveSend, "agent.send should have been called");
  resolveSend(lateRun);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(cancelCalls, 1);
});
