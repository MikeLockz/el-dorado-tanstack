from fastapi.testclient import TestClient
from src.main import app

client = TestClient(app)

def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

def test_bid_endpoint():
    payload = {
        "phase": "bid",
        "hand": [{"id": "H-10", "rank": "10", "suit": "hearts"}],
        "context": {
            "roundIndex": 0,
            "cardsPerPlayer": 10,
            "trumpSuit": "spades",
            "trumpBroken": False,
            "trickIndex": 0,
            "currentTrick": None,
            "playedCards": [],
            "bids": {},
            "cumulativeScores": {"p1": 0},
            "myPlayerId": "p1"
        },
        "config": {
            "maxPlayers": 4,
            "roundCount": 1
        }
    }
    response = client.post("/api/v1/bid", json=payload)
    assert response.status_code == 200
    assert "bid" in response.json()

def test_play_endpoint_simple():
    payload = {
        "phase": "play",
        "hand": [
            {"id": "S-A", "rank": "A", "suit": "spades"}, 
            {"id": "H-2", "rank": "2", "suit": "hearts"}
        ],
        "context": {
            "roundIndex": 0,
            "cardsPerPlayer": 10,
            "trumpSuit": "spades",
            "trumpBroken": True,
            "trickIndex": 0,
            "currentTrick": {
                "trickIndex": 0,
                "ledSuit": None,
                "plays": [],
                "leaderPlayerId": "p1"
            },
            "playedCards": [],
            "bids": {"p1": 1, "p2": 1},
            "cumulativeScores": {"p1": 0, "p2": 0},
            "myPlayerId": "p1"
        },
        "config": {
            "maxPlayers": 2,
            "roundCount": 1
        },
        "timeout_ms": 500
    }
    response = client.post("/api/v1/play", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "card" in data
    # S-A is winning move in this simple scenario (same as mcts test)
    assert data["card"] == "S-A"
