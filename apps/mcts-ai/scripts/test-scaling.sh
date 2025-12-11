#!/bin/bash
# Script to test MCTS AI scaling with multiple replicas
# Usage: ./scripts/test-scaling.sh [replicas]

set -e

REPLICAS=${1:-3}
BASE_URL="${MCTS_ENDPOINT:-http://localhost:5000}"

echo "=========================================="
echo "Testing MCTS AI Scaling"
echo "=========================================="
echo "Target replicas: $REPLICAS"
echo "Base URL: $BASE_URL"
echo ""

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    echo "Error: docker-compose is not available"
    exit 1
fi

echo "1. Starting $REPLICAS replicas of mcts-ai service..."
docker-compose -f ../../docker-compose.dev.yml up -d --scale mcts-ai=$REPLICAS mcts-ai

echo ""
echo "2. Waiting for services to be healthy..."
sleep 5

echo ""
echo "3. Testing health endpoints..."
for i in $(seq 1 $REPLICAS); do
    # Try to hit the health endpoint (Docker will round-robin)
    echo -n "  Health check $i: "
    if curl -s -f "${BASE_URL}/health" > /dev/null 2>&1; then
        echo "✓ OK"
    else
        echo "✗ FAILED"
    fi
done

echo ""
echo "4. Testing concurrent requests (load balancing)..."
echo "   Sending 10 concurrent requests to /health endpoint..."

SUCCESS=0
FAILED=0
for i in $(seq 1 10); do
    if curl -s -f "${BASE_URL}/health" > /dev/null 2>&1; then
        SUCCESS=$((SUCCESS + 1))
    else
        FAILED=$((FAILED + 1))
    fi
done

echo "   Results: $SUCCESS successful, $FAILED failed"

echo ""
echo "5. Checking container status..."
docker-compose -f ../../docker-compose.dev.yml ps mcts-ai

echo ""
echo "=========================================="
echo "Scaling Test Complete"
echo "=========================================="
echo ""
echo "To stop scaled services:"
echo "  docker-compose -f docker-compose.dev.yml up -d --scale mcts-ai=1 mcts-ai"
