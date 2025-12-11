#!/bin/bash
# Script to test MCTS AI integration with the game server
# This simulates a game scenario to verify MCTS bot is working
# Usage: ./scripts/test-integration.sh [server_url]

set -e

SERVER_URL="${1:-http://localhost:3001}"
# In devcontainer, use service name; otherwise use localhost
if getent hosts mcts-ai > /dev/null 2>&1; then
    MCTS_URL="${MCTS_ENDPOINT:-http://mcts-ai:5000}"
else
    MCTS_URL="${MCTS_ENDPOINT:-http://localhost:5000}"
fi

echo "=========================================="
echo "MCTS AI Integration Test"
echo "=========================================="
echo "Server URL: $SERVER_URL"
echo "MCTS URL: $MCTS_URL"
echo ""

# Test 1: Check MCTS health
echo "1. Testing MCTS AI service health..."
# Health endpoint is at root, not under /api/v1
HEALTH_URL="${MCTS_URL%/api/v1}/health"
if curl -s -f "${HEALTH_URL}" > /dev/null 2>&1; then
    echo "   ✓ MCTS service is healthy"
else
    echo "   ✗ MCTS service is not responding"
    echo "   Tried: ${HEALTH_URL}"
    echo "   Make sure mcts-ai container is running"
    exit 1
fi

# Test 2: Test bid endpoint
echo ""
echo "2. Testing MCTS bid endpoint..."
# Ensure we use the correct endpoint path
BID_ENDPOINT="${MCTS_URL%/api/v1}/api/v1/bid"
BID_RESPONSE=$(curl -s -X POST "${BID_ENDPOINT}" \
    -H "Content-Type: application/json" \
    -d '{
        "phase": "bid",
        "hand": [
            {"id": "H-10", "rank": "10", "suit": "hearts"},
            {"id": "D-5", "rank": "5", "suit": "diamonds"}
        ],
        "context": {
            "roundIndex": 1,
            "cardsPerPlayer": 9,
            "trumpSuit": "spades",
            "trumpBroken": false,
            "trickIndex": 0,
            "currentTrick": null,
            "playedCards": [],
            "bids": {"p1": null, "bot_1": null},
            "cumulativeScores": {"p1": 0, "bot_1": 0},
            "myPlayerId": "bot_1"
        },
        "config": {
            "maxPlayers": 4,
            "roundCount": 10
        },
        "timeout_ms": 500
    }')

if echo "$BID_RESPONSE" | grep -q '"bid"'; then
    BID=$(echo "$BID_RESPONSE" | grep -o '"bid":[0-9]*' | cut -d':' -f2)
    echo "   ✓ Bid endpoint working (returned bid: $BID)"
else
    echo "   ✗ Bid endpoint failed"
    echo "   Response: $BID_RESPONSE"
    exit 1
fi

# Test 3: Test play endpoint
echo ""
echo "3. Testing MCTS play endpoint..."
# Ensure we use the correct endpoint path
PLAY_ENDPOINT="${MCTS_URL%/api/v1}/api/v1/play"
PLAY_RESPONSE=$(curl -s -X POST "${PLAY_ENDPOINT}" \
    -H "Content-Type: application/json" \
    -d '{
        "phase": "play",
        "hand": [
            {"id": "H-10", "rank": "10", "suit": "hearts"},
            {"id": "D-5", "rank": "5", "suit": "diamonds"},
            {"id": "C-A", "rank": "A", "suit": "clubs"}
        ],
        "context": {
            "roundIndex": 1,
            "cardsPerPlayer": 9,
            "trumpSuit": "spades",
            "trumpBroken": false,
            "trickIndex": 0,
            "currentTrick": {
                "trickIndex": 0,
                "ledSuit": "hearts",
                "plays": [
                    {"playerId": "p1", "card": {"id": "H-A", "rank": "A", "suit": "hearts"}}
                ],
                "leaderPlayerId": "p1"
            },
            "playedCards": [],
            "bids": {"p1": 2, "bot_1": 2},
            "cumulativeScores": {"p1": 0, "bot_1": 0},
            "myPlayerId": "bot_1"
        },
        "config": {
            "maxPlayers": 4,
            "roundCount": 10
        },
        "timeout_ms": 500
    }')

if echo "$PLAY_RESPONSE" | grep -q '"card"'; then
    CARD=$(echo "$PLAY_RESPONSE" | grep -o '"card":"[^"]*' | cut -d'"' -f4)
    echo "   ✓ Play endpoint working (returned card: $CARD)"
else
    echo "   ✗ Play endpoint failed"
    echo "   Response: $PLAY_RESPONSE"
    exit 1
fi

# Test 4: Test server integration (if server is available)
echo ""
echo "4. Testing server integration..."
if curl -s -f "${SERVER_URL}/api/health" > /dev/null 2>&1; then
    echo "   ✓ Server is available"
    echo "   Note: To test full game flow, create a game with MCTS bots enabled"
    echo "   Set MCTS_ENABLED=true in server environment"
else
    echo "   ⚠ Server is not available (this is OK if server is not running)"
fi

echo ""
echo "=========================================="
echo "Integration Test Complete"
echo "=========================================="
