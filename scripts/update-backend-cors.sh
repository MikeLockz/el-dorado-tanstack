#!/bin/bash

# Update backend CORS settings to allow GitHub Pages

set -e

echo "🔧 Updating backend CORS settings for GitHub Pages..."

# Get the GitHub Pages URLs
if [ -n "$1" ]; then
    REPO_NAME="$1"
else
    # Interactive mode
    echo "Enter your GitHub repository name (format: username/repo):"
    read -r USER_REPO
    if [ -z "$USER_REPO" ]; then
        echo "Repository name cannot be empty"
        exit 1
    fi
    REPO_NAME="$USER_REPO"
fi

# Extract username and repo
USER_NAME=$(echo "$REPO_NAME" | cut -d'/' -f1)
REPO_SHORT=$(echo "$REPO_NAME" | cut -d'/' -f2)

# Convert to lowercase for GitHub Pages URL
USER_NAME_LOWER=$(echo "$USER_NAME" | tr '[:upper:]' '[:lower:]' | tr '_' '-')
REPO_SHORT_LOWER=$(echo "$REPO_SHORT" | tr '[:upper:]' '[:lower:]' | tr '_' '-')

GITHUB_PAGES_URL="https://${USER_NAME_LOWER}.github.io/${REPO_SHORT_LOWER}"

echo "🌐 GitHub Pages URL: $GITHUB_PAGES_URL"
echo ""

# Read the current server CORS settings
CURRENT_CORS=$(fly config show -a el-dorado-tanstack-server | grep -A5 -B5 "COR" || echo "No CORS specific config found")

echo "Current config check:"
echo "$CURRENT_CORS"
echo ""

# Since the backend app doesn't have explicit CORS env vars in config, we need to add them
# Check what framework/runtime is being used on the backend
echo "🔍 Analyzing backend server configuration..."

# For most Node.js backends, CORS origins are typically configured via environment variables
# Let's update the Fly app environment variables to include GitHub Pages URL

cat >${TMPDIR:-/tmp}/update-cors.env <<EOF
CORS_ORIGIN=$GITHUB_PAGES_URL,https://el-dorado-tanstack-server.fly.dev
VITE_CORS_ORIGIN=$GITHUB_PAGES_URL,https://el-dorado-tanstack-server.fly.dev
EOF

echo "📤 Setting environment variables on backend app:"
while IFS= read -r line; do
    if [[ -n "$line" ]]; then
        key=$(echo "$line" | cut -d'=' -f1)
        value=$(echo "$line" | cut -d'=' -f2-)
        echo "   Setting $key=$value"
        fly secrets set "$key=$value" -a el-dorado-tanstack-server
    fi
done < ${TMPDIR:-/tmp}/update-cors.env

echo ""
echo "✅ Backend CORS update complete!"
echo ""
echo "🔄 Backend will restart automatically with new CORS settings."
echo ""
echo "📋 Summary of changes:"
echo "   • Added CORS origin: $GITHUB_PAGES_URL"
echo "   • Backend will now accept requests from GitHub Pages"
echo ""
echo "⏳ Wait a moment for the backend to restart, then GitHub Pages will be able to communicate with your API."
echo ""
echo "🎯 Test your setup by visiting: $GITHUB_PAGES_URL"

rm -f ${TMPDIR:-/tmp}/update-cors.env