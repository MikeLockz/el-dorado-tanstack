#!/bin/bash
# Script to run the MCTS benchmark inside the Docker container
# Usage: ./scripts/run-benchmark.sh

set -e

echo "=========================================="
echo "MCTS Performance Benchmark"
echo "=========================================="
echo ""

# Check if container is running
CONTAINER_NAME="mcts-ai"
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "Error: mcts-ai container is not running."
    echo "Please start it with: docker-compose -f docker-compose.dev.yml up -d mcts-ai"
    exit 1
fi

echo "Running benchmark inside mcts-ai container..."
echo ""

# Run the benchmark script
docker exec mcts-ai python3 benchmarks/run_sims.py

echo ""
echo "=========================================="
echo "Benchmark Complete"
echo "=========================================="
