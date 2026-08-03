#!/usr/bin/env bash
# Regression: personal skill install must win over a workspace-shadowing copy.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RESOLVER="$ROOT/scripts/resolve_runner_dir.sh"
SKILL_MD="$ROOT/skill/SKILL.md"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

# Keep the embedded skill snippet aligned with the canonical helper.
skill_order="$(
  awk '
    /for dir in \\/ { in_loop=1; next }
    in_loop && /do/ { exit }
    in_loop {
      gsub(/^[[:space:]]*/, "")
      gsub(/[[:space:]]*\\$/, "")
      if ($0 != "") print
    }
  ' "$SKILL_MD"
)"
# Compare as literal skill source lines (unexpanded).
skill_order_normalized="$(printf '%s\n' "$skill_order" | sed 's/"//g')"
expected_normalized="$(cat <<'EOF'
$HOME/.cursor/skills/dag-task-runner/scripts
$PWD/.cursor/skills/dag-task-runner/scripts
${git_root:+$git_root/.cursor/skills/dag-task-runner/scripts}
EOF
)"
[[ "$skill_order_normalized" == "$expected_normalized" ]] ||
  fail "skill/SKILL.md resolve_runner_dir order drift:
expected:
$expected_normalized
got:
$skill_order_normalized"

fake_home="$TMP/home"
fake_workspace="$TMP/workspace"
mkdir -p \
  "$fake_home/.cursor/skills/dag-task-runner/scripts" \
  "$fake_workspace/.cursor/skills/dag-task-runner/scripts"
printf '// personal\n' >"$fake_home/.cursor/skills/dag-task-runner/scripts/run_dag.ts"
printf '// workspace-shadow\n' >"$fake_workspace/.cursor/skills/dag-task-runner/scripts/run_dag.ts"

# Simulate lookup from an untrusted workspace that also plants a skill copy.
resolved="$(
  cd "$fake_workspace"
  HOME="$fake_home" DAG_RUNNER_DIR= bash "$RESOLVER"
)"
expected="$fake_home/.cursor/skills/dag-task-runner/scripts"
[[ "$resolved" == "$expected" ]] ||
  fail "expected personal runner ($expected), got: $resolved"

# Explicit override still wins.
override="$TMP/override/scripts"
mkdir -p "$override"
printf '// override\n' >"$override/run_dag.ts"
resolved_override="$(
  cd "$fake_workspace"
  HOME="$fake_home" DAG_RUNNER_DIR="$override" bash "$RESOLVER"
)"
[[ "$resolved_override" == "$override" ]] ||
  fail "expected DAG_RUNNER_DIR override ($override), got: $resolved_override"

# Without a personal install, workspace fallback still works.
rm -rf "$fake_home/.cursor"
resolved_workspace="$(
  cd "$fake_workspace"
  HOME="$fake_home" DAG_RUNNER_DIR= bash "$RESOLVER"
)"
expected_workspace="$fake_workspace/.cursor/skills/dag-task-runner/scripts"
[[ "$resolved_workspace" == "$expected_workspace" ]] ||
  fail "expected workspace fallback ($expected_workspace), got: $resolved_workspace"

echo "PASS: resolve_runner_dir prefers personal install over workspace shadow"
