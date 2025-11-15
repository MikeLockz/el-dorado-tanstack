FROM mcr.microsoft.com/vscode/devcontainers/javascript-node:20

# Install pnpm
RUN npm install -g pnpm@9.1.1

# Install Chrome MCP and dependencies
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get -y install --no-install-recommends \
    wget \
    gnupg \
    ca-certificates \
    && wget -qO- https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-linux-signing-keyring.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-linux-signing-keyring.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update \
    && apt-get -y install google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

# Install Chrome MCP globally
RUN npm install -g chrome-mcp

WORKDIR /workspace

# Copy dependency manifests for faster install caching
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/domain/package.json ./packages/domain/
COPY apps/web/package.json ./apps/web/
COPY apps/server/package.json ./apps/server/

# Install workspace dependencies
RUN pnpm install --frozen-lockfile

EXPOSE 3000 3001

CMD ["sleep", "infinity"]
