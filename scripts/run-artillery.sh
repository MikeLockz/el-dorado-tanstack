#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p test-results

extra_args=()
if [[ "${ARTILLERY_RECORD_OUTPUT:-false}" == "true" ]]; then
  extra_args+=(--output ./test-results/artillery.json)
fi

# Default to 4 players
PLAYERS=4

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --players)
      PLAYERS="$2"
      shift # past argument
      shift # past value
      ;;
    --players=*)
      PLAYERS="${1#*=}"
      shift # past argument
      ;;
    *)
      # Check if it's a number
      if [[ "$1" =~ ^[0-9]+$ ]]; then
        PLAYERS="$1"
      fi
      shift # past argument
      ;;
  esac
done

# Validate range
if (( PLAYERS < 2 || PLAYERS > 10 )); then
  echo "Error: Number of players must be between 2 and 10. Got: $PLAYERS"
  exit 1
fi

echo "Running Artillery test with $PLAYERS players..."

export ARTILLERY_ARRIVAL_COUNT="$PLAYERS"
export ROOM_MIN_PLAYERS="$PLAYERS"

# Create a temporary config file with the correct arrivalCount and roomMinPlayers
# We use sed to replace the default values.
sed -e "s/arrivalCount: 4/arrivalCount: $PLAYERS/" \
    -e "s/roomMinPlayers: .*/roomMinPlayers: $PLAYERS/" \
    load-testing/artillery.config.yml > load-testing/artillery.config.tmp.yml

pnpm exec artillery run load-testing/artillery.config.tmp.yml "${extra_args[@]}"

# Cleanup
rm load-testing/artillery.config.tmp.yml
