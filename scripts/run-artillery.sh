#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p test-results

extra_args=()
if [[ "${ARTILLERY_RECORD_OUTPUT:-false}" == "true" ]]; then
  extra_args+=(--output ./test-results/artillery.json)
fi

pnpm exec artillery run load-testing/artillery.config.yml "${extra_args[@]}"
