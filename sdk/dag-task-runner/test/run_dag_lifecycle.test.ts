import assert from "node:assert/strict";
import test from "node:test";

import { initialRunState, type RunState } from "../src/canvas_writer.js";
import { runTask, type RunTaskOptions } from "../src/run_dag.js";
import type { DAG, RawTask } from "../src/dag.js";

class RecordingWriter {
  readonly snapshots: RunState[] = [];

  schedule(state: RunState): void {
    this.snapshots.push(JSON.parse(JSON.stringify(state)) as RunState);
  }
}

const task: RawTask = {
  id: "stuck-task",
  depends_on: [],
  complexity: "LOW",
  subtask_prompt: "Do work",
};

function makeState(): { state: RunState; stateById: Map<string, RunState["tasks"][number]> } {
  const dag: DAG = { title: "Lifecycle test", tasks: [task] };
  const state = initialRunState(dag, () => "test-model");
  return {
    state,
    stateById: new Map(state.tasks.map((t) => [t.id, t])),
  };
}

function baseOptions(overrides: Partial<RunTaskOptions> = {}): RunTaskOptions {
  return {
    taskTimeoutMs: 20,
    streamPublishMs: 1,
    streamIdleTimeoutMs: 1_000,
    ...overrides,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("runTask marks the task errored when Agent.create exceeds the task deadline", async () => {
  const { state, stateById } = makeState();
  const writer = new RecordingWriter();
  let disposedLateAgent = false;

  const lateAgent = {
    async send() {
      throw new Error("send should not be reached");
    },
    async [Symbol.asyncDispose]() {
      disposedLateAgent = true;
    },
  };

  await runTask(task, stateById, state, writer, "/tmp", baseOptions({
    agentFactory: {
      create: () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(lateAgent), 50);
        }),
    },
  }));

  const taskState = stateById.get(task.id);
  assert.equal(taskState?.status, "ERROR");
  assert.match(taskState?.errorMessage ?? "", /exceeded deadline .* while creating agent/);

  await sleep(70);
  assert.equal(disposedLateAgent, true);
});

test("runTask marks the task errored and cancels a late run when agent.send exceeds the task deadline", async () => {
  const { state, stateById } = makeState();
  const writer = new RecordingWriter();
  let canceledLateRun = false;
  let disposedAgent = false;

  const lateRun = {
    status: "running",
    async *stream() {
      yield { type: "assistant", message: { content: [{ type: "text", text: "late" }] } };
    },
    async wait() {
      return { status: "finished" };
    },
    async cancel() {
      canceledLateRun = true;
    },
  };

  const agent = {
    send: () =>
      new Promise<typeof lateRun>((resolve) => {
        setTimeout(() => resolve(lateRun), 50);
      }),
    async [Symbol.asyncDispose]() {
      disposedAgent = true;
    },
  };

  await runTask(task, stateById, state, writer, "/tmp", baseOptions({
    agentFactory: {
      create: async () => agent,
    },
  }));

  const taskState = stateById.get(task.id);
  assert.equal(taskState?.status, "ERROR");
  assert.match(taskState?.errorMessage ?? "", /exceeded deadline .* while sending prompt/);
  assert.equal(disposedAgent, true);

  await sleep(70);
  assert.equal(canceledLateRun, true);
});
