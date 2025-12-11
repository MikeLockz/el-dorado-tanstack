#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p test-results

extra_args=()
# Check if ARTILLERY_RECORD_OUTPUT is true (from env)
if [[ "${ARTILLERY_RECORD_OUTPUT:-false}" == "true" ]]; then
  extra_args+=(--output ./test-results/artillery.json)
fi

# Default to 4 players, 1 concurrent test, and 1 repetition
PLAYERS=4
CONCURRENCY=1
REPETITIONS=1

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --players)
      if [[ -n "${2:-}" ]] && [[ "$2" =~ ^[0-9]+$ ]]; then
        PLAYERS="$2"
        shift # past argument
        shift # past value
      else
        echo "Error: --players requires a numeric argument"
        exit 1
      fi
      ;;
    --players=*)
      PLAYERS="${1#*=}"
      shift # past argument
      ;;
    --concurrency|-c)
      if [[ -n "${2:-}" ]] && [[ "$2" =~ ^[0-9]+$ ]]; then
        CONCURRENCY="$2"
        shift # past argument
        shift # past value
      else
        echo "Error: --concurrency requires a numeric argument"
        exit 1
      fi
      ;;
    --concurrency=*)
      CONCURRENCY="${1#*=}"
      shift # past argument
      ;;
    --repetitions|-r)
      if [[ -n "${2:-}" ]] && [[ "$2" =~ ^[0-9]+$ ]]; then
        REPETITIONS="$2"
        shift # past argument
        shift # past value
      else
        echo "Error: --repetitions requires a numeric argument"
        exit 1
      fi
      ;;
    --repetitions=*)
      REPETITIONS="${1#*=}"
      shift # past argument
      ;;
    --output)
       # If explicit output flag is provided, override the env-based one
       if [[ -n "${2:-}" ]]; then
         # Reset extra_args to remove the default ./test-results/artillery.json
         extra_args=()
         extra_args+=(--output "$2")
         shift
         shift
       else
         echo "Error: --output requires a file path"
         exit 1
       fi
       ;;
    --with-mcts-bots)
       export ARTILLERY_MCTS_BOTS="true"
       shift
       ;;
    *)
      if [[ "$1" =~ ^- ]]; then
        echo "Warning: Unknown argument '$1' ignored."
        shift # past unknown argument
      elif [[ "$1" =~ ^[0-9]+$ ]]; then
        # Only treat as players if we haven't explicitly set players via flag?
        # Or just allow it for backward compat.
        PLAYERS="$1"
        shift # past value
      else
        # Unknown non-numeric argument
        echo "Warning: Unknown argument '$1' ignored."
        shift
      fi
      ;;
  esac
done

# Validate range
if (( PLAYERS < 2 || PLAYERS > 10 )); then
  echo "Error: Number of players must be between 2 and 10. Got: $PLAYERS"
  exit 1
fi

if (( CONCURRENCY < 1 )); then
  echo "Error: Concurrency must be at least 1. Got: $CONCURRENCY"
  exit 1
fi

if (( REPETITIONS < 1 )); then
  echo "Error: Repetitions must be at least 1. Got: $REPETITIONS"
  exit 1
fi

echo "Running Artillery test with $PLAYERS players (Concurrency: $CONCURRENCY, Repetitions: $REPETITIONS)..."

if [[ "${ARTILLERY_MCTS_BOTS:-false}" == "true" ]]; then
  echo "MCTS Bots mode enabled. Adjusting arrival count and players."
  # In bot mode, we only need 1 VU per game (the host/waiter).
  # We still request a room of size PLAYERS, but only 1 VU will join.
  # The other slots will be filled by bots.
  ARRIVAL_COUNT=1
  export ROOM_MIN_PLAYERS="$PLAYERS"
else
  ARRIVAL_COUNT="$PLAYERS"
  export ROOM_MIN_PLAYERS="$PLAYERS"
fi
# Propagate IS_LOAD_TEST if set
export IS_LOAD_TEST="${IS_LOAD_TEST:-false}"

# Create a temporary config file with the correct arrivalCount and roomMinPlayers
# We use sed to replace the default values.
sed -e "s/arrivalCount: 4/arrivalCount: $ARRIVAL_COUNT/" \
    -e "s/roomMinPlayers: .*/roomMinPlayers: $PLAYERS/" \
    load-testing/artillery.config.yml > load-testing/artillery.config.tmp.yml

for (( r=1; r<=REPETITIONS; r++ )); do
  echo "--- Repetition $r of $REPETITIONS ---"
  
  if [ "$CONCURRENCY" -eq 1 ]; then
    # For single concurrency, we can just run it directly
    # If output recording is enabled, we need to handle filenames if repetitions > 1
    current_args=("${extra_args[@]}")
    
    # Check if we have an output argument already in current_args
    has_output=false
    for arg in "${current_args[@]}"; do
      if [[ "$arg" == "--output" ]]; then
        has_output=true
        break
      fi
    done

    if [[ "$has_output" == "true" ]] && [[ "$REPETITIONS" -gt 1 ]]; then
       # If explicit output was given, we can't easily modify it for repetitions without parsing logic.
       # For now, we warn or just append a suffix? 
       # Simpler: If using repetitions, rely on the auto-generation logic below if no explicit output passed.
       # But since the user might have passed --output via the loop above, let's just assume they know what they are doing
       # or they will overwrite the file.
       # If NO explicit output was passed but ARTILLERY_RECORD_OUTPUT=true, we handle it here:
       : # Do nothing, use provided args
    elif [[ "$has_output" == "false" ]] && [[ "${ARTILLERY_RECORD_OUTPUT:-false}" == "true" ]] && [[ "$REPETITIONS" -gt 1 ]]; then
       current_args=(--output "./test-results/artillery-r${r}.json")
    fi
    
    pnpm exec artillery run load-testing/artillery.config.tmp.yml "${current_args[@]}"
  else
    pids=()
    for i in $(seq 1 $CONCURRENCY); do
      # Handle output file uniqueness
      instance_args=()
      if [[ "${ARTILLERY_RECORD_OUTPUT:-false}" == "true" ]]; then
        instance_args+=(--output "./test-results/artillery-r${r}-c${i}.json")
      fi
      
      echo "Starting test instance $i (Repetition $r)..."
      pnpm exec artillery run load-testing/artillery.config.tmp.yml "${instance_args[@]}" &
      pids+=($!)
    done

    failed=0
    for pid in "${pids[@]}"; do
      wait "$pid" || failed=1
    done

    if [ "$failed" -ne 0 ]; then
      echo "One or more test instances failed in repetition $r."
      rm load-testing/artillery.config.tmp.yml
      exit 1
    fi
  fi
done

# Cleanup
rm load-testing/artillery.config.tmp.yml
