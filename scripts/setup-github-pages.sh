#!/bin/bash

# Set up GitHub Pages deployment configuration

set -e

echo "🚀 Setting up GitHub Pages deployment for El Dorado frontend..."

# Configuration values
FRONTEND_REPO=""
BACKEND_API_URL="https://el-dorado-tanstack-server.fly.dev"
WEBSOCKET_URL="wss://el-dorado-tanstack-server.fly.dev/ws"

echo "📋 Backend Configuration:"
echo "   API URL: $BACKEND_API_URL"
echo "   WebSocket URL: $WEBSOCKET_URL"
echo ""

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo "❌ GitHub CLI (gh) is not installed. Please install it first:"
    echo "   https://cli.github.com/"
    exit 1
fi

# Get repository info
if [ -n "$FRONTEND_REPO" ]; then
    REPO="$FRONTEND_REPO"
else
    if gh auth status &> /dev/null; then
        # Create a text prompt for the user to input the repository name
        echo "Please provide your GitHub repository in the format 'username/repo' for the frontend:"
        read -r USER_REPO
        if [ -z "$USER_REPO" ]; then
            echo "Repository name cannot be empty"
            exit 1
        fi
        REPO="$USER_REPO"
    else
        echo "❌ GitHub CLI not authenticated. Please run: gh auth login"
        exit 1
    fi
fi

echo "🔧 Configuring GitHub repository: $REPO"

# Set environment variables
echo "Setting GitHub Actions secrets..."
gh secret set VITE_API_URL --repo "$REPO" --body "$BACKEND_API_URL"
gh secret set VITE_WS_URL --repo "$REPO" --body "$WEBSOCKET_URL"

echo "📊 GitHub Pages settings..."
# Enable GitHub Pages with GitHub Actions
echo "🏼 Enabling GitHub Pages..."
gh api \
  --method POST \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "/repos/$REPO/pages" \
  -f source='{"from": "branch", "branch": "main", "path": "/"}' 2>/dev/null || echo "GitHub Pages may already be enabled"

# Wait a moment for settings to apply
sleep 2

echo ""
echo "✅ GitHub Repository Configuration Complete!"
echo ""
echo "📝 Environment Variables Set:"
echo "   • VITE_API_URL=$BACKEND_API_URL"
echo "   • VITE_WS_URL=$WEBSOCKET_URL"
echo ""
echo "🌐 Next Steps:"
echo "   1. Run: ./scripts/setup-github-pages.sh"
echo "   2. Once this script completes, the GitHub Action will run automatically on your next push"
echo "   3. Monitor deployment at: https://github.com/$REPO/actions"
echo "   4. Your site will be available at: https://$(echo $REPO | cut -d'/' -f1).github.io/$(echo $REPO | cut -d'/' -f2)"
echo ""
echo "🔄 To connect your backend to GitHub Pages:"
echo "   You will need to update your backend's CORS settings in fly.toml to allow requests from GitHub Pages."
echo "   I've created scripts/update-backend-cors.sh for this purpose - run it after this setup."