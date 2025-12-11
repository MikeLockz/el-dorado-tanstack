#!/bin/bash
# Script to run the MCTS benchmark in devcontainer environment
# This runs the benchmark directly using Python in the devcontainer
# Usage: ./scripts/run-benchmark-devcontainer.sh

set -e

echo "=========================================="
echo "MCTS Performance Benchmark (DevContainer)"
echo "=========================================="
echo ""

cd "$(dirname "$0")/.."

# Check if we can access the mcts-ai service
if getent hosts mcts-ai > /dev/null 2>&1; then
    echo "✓ MCTS service is accessible at http://mcts-ai:5000"
else
    echo "⚠ MCTS service not found via DNS (may not be running)"
fi

# Check if Python dependencies are available
if python3 -c "import pydantic" 2>/dev/null; then
    echo "✓ Python dependencies available"
    echo ""
    echo "Running benchmark..."
    echo ""
    python3 benchmarks/run_sims.py
else
    echo "⚠ Python dependencies not installed in devcontainer"
    echo ""
    echo "To run benchmark, you can:"
    echo "1. Install dependencies: pip3 install -r requirements.txt"
    echo "2. Or run inside mcts-ai container: docker exec mcts-ai python3 benchmarks/run_sims.py"
    echo ""
    echo "Testing MCTS endpoints via HTTP instead..."
    echo ""
    
    # Fallback: Test endpoints with timing
    if getent hosts mcts-ai > /dev/null 2>&1; then
        echo "Testing /api/v1/play endpoint performance..."
        START=$(date +%s%N)
        for i in {1..10}; do
            curl -s -X POST http://mcts-ai:5000/api/v1/play \
                -H "Content-Type: application/json" \
                -d '{"phase":"play","hand":[{"id":"H-10","rank":"10","suit":"hearts"},{"id":"D-5","rank":"5","suit":"diamonds"}],"context":{"roundIndex":1,"cardsPerPlayer":9,"trumpSuit":"spades","trumpBroken":false,"trickIndex":0,"currentTrick":null,"playedCards":[],"bids":{"p1":2,"bot_1":2},"cumulativeScores":{"p1":0,"bot_1":0},"myPlayerId":"bot_1"},"config":{"maxPlayers":4,"roundCount":10},"timeout_ms":500}' > /dev/null
        done
        END=$(date +%s%N)
        ELAPSED=$((($END - $START) / 1000000))
        AVG=$((ELAPSED / 10))
        echo "  10 requests completed in ${ELAPSED}ms"
        echo "  Average: ${AVG}ms per request"
    fi
fi

echo ""
echo "=========================================="
echo "Benchmark Complete"
echo "=========================================="
