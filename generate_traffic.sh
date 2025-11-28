#!/bin/bash
BASE_URL="${1:-http://192.168.1.44:3001}"
echo "Targeting: $BASE_URL"

# 1. Health Check
echo "--- Health Check (5 hits) ---"
for i in {1..5}; do
  curl -s "$BASE_URL/api/health" > /dev/null
done

# 2. Create Room
echo "--- Create Room ---"
RESPONSE=$(curl -s -X POST "$BASE_URL/api/create-room" \
  -H "Content-Type: application/json" \
  -d '{"displayName":"HostUser","avatarSeed":"seed1","color":"red","userId":"user_123"}')

# Simple JSON parsing with grep/cut to avoid jq dependency if missing
GAME_ID=$(echo $RESPONSE | grep -o '"gameId":"[^"" ]*' | cut -d'"' -f4)
JOIN_CODE=$(echo $RESPONSE | grep -o '"joinCode":"[^"" ]*' | cut -d'"' -f4)
HOST_TOKEN=$(echo $RESPONSE | grep -o '"playerToken":"[^"" ]*' | cut -d'"' -f4)

if [ -z "$GAME_ID" ]; then
  echo "Failed to create room. Response: $RESPONSE"
else
  echo "Created Game: $GAME_ID, Code: $JOIN_CODE"

  # 3. Join By Code (3 hits)
  echo "--- Join By Code (3 hits) ---"
  for i in {1..3}; do
    curl -s -X POST "$BASE_URL/api/join-by-code" \
      -H "Content-Type: application/json" \
      -d "{\"joinCode\":\"$JOIN_CODE\",\"displayName\":\"Player$i\",\"avatarSeed\":\"seed$i\",\"color\":\"blue\",\"userId\":\"user_join_$i\"}" > /dev/null
  done

  # 5. Add Bots
  echo "--- Add Bots ---"
  curl -s -X POST "$BASE_URL/api/games/$GAME_ID/bots" \
    -H "Content-Type: application/json" \
    -d '{"count": 1}' > /dev/null

  # 6. Game Join Info
  echo "--- Game Join Info ---"
  curl -s "$BASE_URL/api/games/$GAME_ID/join-info" > /dev/null

  # 9. Game Summary (endpoints exist, might 404 if not finished, but records metric)
  echo "--- Game Summary ---"
  curl -s "$BASE_URL/api/game-summary?gameId=$GAME_ID" > /dev/null
  curl -s "$BASE_URL/api/game-summary/$GAME_ID" > /dev/null

  # 10. Kick Player (Intentional 404/400)
  echo "--- Kick Player ---"
  curl -s -X DELETE "$BASE_URL/api/games/$GAME_ID/players/fake-id" \
    -H "Authorization: Bearer $HOST_TOKEN" > /dev/null
fi

# 4. Matchmake (3 hits)
echo "--- Matchmake (3 hits) ---"
for i in {1..3}; do
  curl -s -X POST "$BASE_URL/api/matchmake" \
    -H "Content-Type: application/json" \
    -d "{\"displayName\":\"MatchPlayer$i\",\"avatarSeed\":\"seedM$i\",\"color\":\"green\",\"userId\":\"user_match_$i\"}" > /dev/null
done

# 7. Player Stats
echo "--- Player Stats ---"
curl -s "$BASE_URL/api/player-stats?userId=user_123" > /dev/null

# 8. Player Games
echo "--- Player Games ---"
curl -s "$BASE_URL/api/player-games?userId=user_123" > /dev/null

echo "Done."
