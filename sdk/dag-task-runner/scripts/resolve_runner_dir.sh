#!/usr/bin/env bash
# Canonical DAG runner locator used by tests and kept in sync with skill/SKILL.md.
# Prefer personal installs over workspace copies to avoid path-shadowing RCE.

set -euo pipefail

resolve_runner_dir() {
  if [ -n "${DAG_RUNNER_DIR:-}" ] && [ -f "$DAG_RUNNER_DIR/run_dag.ts" ]; then
    printf '%s\n' "$DAG_RUNNER_DIR"
    return 0
  fi

  # Prefer $HOME over workspace/git-root paths. A workspace copy is untrusted
  # relative to a personal skill install and must not win via path shadowing.
  git_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
  for dir in \
    "$HOME/.cursor/skills/dag-task-runner/scripts" \
    "$PWD/.cursor/skills/dag-task-runner/scripts" \
    "${git_root:+$git_root/.cursor/skills/dag-task-runner/scripts}"
  do
    if [ -n "$dir" ] && [ -f "$dir/run_dag.ts" ]; then
      printf '%s\n' "$dir"
      return 0
    fi
  done

  echo "Could not find dag-task-runner/scripts. Copy .cursor/skills/dag-task-runner into this project, install it under ~/.cursor/skills, or set DAG_RUNNER_DIR." >&2
  return 1
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  resolve_runner_dir
fi
