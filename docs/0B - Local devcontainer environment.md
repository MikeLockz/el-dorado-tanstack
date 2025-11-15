# 0B - Local DevContainer Environment Specification

## Overview

This document specifies the complete VS Code DevContainer and Docker setup for the el-dorado-tanstack monorepo, designed as the primary development environment with full-stack services optimized for both local development and Fly.io deployment.

## Current Project Analysis

### Monorepo Structure
- **Package Manager**: pnpm 9.1.1 with workspace configuration
- **Apps**: `@game/web` (React), `@game/server` (Node.js/TanStack Start)
- **Packages**: `@game/domain` (shared game logic)
- **Dependencies**: TypeScript 5.4.5, Vitest 1.6.0, minimal existing setup

### Technology Stack (Planned)
- **Frontend**: React + TanStack Router + TanStack Query + TanStack Store
- **Backend**: TanStack Start (Node.js/TypeScript)
- **Real-time**: WebSocket Gateway
- **Database**: PostgreSQL
- **Cache**: Redis
- **Deployment**: Fly.io

## DevContainer Architecture

### Primary Development Environment
The DevContainer will serve as the main development environment for the team, providing:
- Consistent Node.js 20+ runtime with pnpm support
- Pre-installed VS Code extensions for optimal development experience
- Multi-service orchestration (web, server, database, cache)
- Hot reload and live development capabilities
- Integrated Chrome MCP for browser automation/testing

### Service Composition
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Web Client    │    │   Server API    │    │   PostgreSQL    │
│   (React)       │◄──►│   (TanStack)    │◄──►│   Database      │
│   Port: 3000    │    │   Port: 3001    │    │   Port: 5432    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │      Redis      │
                       │    Cache/Store  │
                       │    Port: 6379   │
                       └─────────────────┘
```

## Phase 1: DevContainer Configuration

### .devcontainer/devcontainer.json
```json
{
  "name": "El Dorado TanStack Development",
  "dockerComposeFile": "../docker-compose.dev.yml",
  "service": "app",
  "workspaceFolder": "/workspace",
  "shutdownAction": "stopCompose",

  "features": {
    "ghcr.io/devcontainers/features/node:1": {
      "version": "20",
      "pnpm": "9.1.1"
    },
    "ghcr.io/devcontainers/features/git:1": {},
    "ghcr.io/devcontainers/features/github-cli:1": {}
  },

  "customizations": {
    "vscode": {
      "extensions": [
        "bradlc.vscode-tailwindcss",
        "esbenp.prettier-vscode",
        "dbaeumer.vscode-eslint",
        "ms-vscode.vscode-typescript-next",
        "tanstack.query-vscode",
        "formulahendry.auto-rename-tag",
        "christian-kohler.path-intellisense",
        "ms-vscode.vscode-json",
        "redhat.vscode-yaml",
        "ms-vscode-remote.remote-containers",
        "ms-vscode-remote.remote-ssh",
        "ms-vscode-remote.remote-wsl",
        "ms-vscode.remote-explorer"
      ],
      "settings": {
        "typescript.preferences.importModuleSpecifier": "relative",
        "editor.formatOnSave": true,
        "editor.defaultFormatter": "esbenp.prettier-vscode",
        "terminal.integrated.shell.linux": "/bin/bash"
      }
    }
  },

  "forwardPorts": [3000, 3001, 5432, 6379],
  "portsAttributes": {
    "3000": {
      "label": "Web Client",
      "onAutoForward": "notify"
    },
    "3001": {
      "label": "Server API",
      "onAutoForward": "notify"
    },
    "5432": {
      "label": "PostgreSQL",
      "onAutoForward": "silent"
    },
    "6379": {
      "label": "Redis",
      "onAutoForward": "silent"
    }
  },

  "postCreateCommand": "/bin/bash .devcontainer/post-create.sh",
  "postStartCommand": "pnpm dev",

  "remoteUser": "node"
}
```

### .devcontainer/Dockerfile
```dockerfile
FROM mcr.microsoft.com/vscode/devcontainers/javascript-node:20

# Install pnpm
RUN npm install -g pnpm@9.1.1

# Install Chrome MCP and dependencies
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get -y install --no-install-recommends \
    wget \
    gnupg \
    && wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update \
    && apt-get -y install google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

# Install Chrome MCP globally
RUN npm install -g chrome-mcp

# Set working directory
WORKDIR /workspace

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/domain/package.json ./packages/domain/
COPY apps/web/package.json ./apps/web/
COPY apps/server/package.json ./apps/server/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Expose development ports
EXPOSE 3000 3001

# Set default command
CMD ["sleep", "infinity"]
```

### .devcontainer/post-create.sh
```bash
#!/bin/bash
set -euo pipefail

echo "🚀 Setting up El Dorado TanStack development environment..."

echo "🔧 Ensuring workspace permissions..."
TARGET_USER="${DEVCONTAINER_USER:-node}"
if id "$TARGET_USER" >/dev/null 2>&1; then
  TARGET_UID="$(id -u "$TARGET_USER")"
  TARGET_GID="$(id -g "$TARGET_USER")"
else
  TARGET_UID="$(id -u)"
  TARGET_GID="$(id -g)"
fi

run_privileged() {
  if command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    "$@"
  fi
}

ensure_dir_owner() {
  local target="$1"
  if [ ! -d "$target" ]; then
    run_privileged mkdir -p "$target"
  fi
  run_privileged chown -R "$TARGET_UID":"$TARGET_GID" "$target"
}

ensure_dir_owner /workspace/node_modules
ensure_dir_owner /workspace/apps/web/node_modules
ensure_dir_owner /workspace/apps/server/node_modules
ensure_dir_owner /workspace/packages/domain/node_modules
ensure_dir_owner /workspace/.pnpm-store

echo "📦 Installing dependencies..."
export PNPM_YES=true
pnpm install --force

echo "🤖 Ensuring Codex CLI is installed..."
if ! command -v codex >/dev/null 2>&1; then
  run_privileged npm install -g @openai/codex
else
  echo "🤖 Codex CLI already present."
fi

echo "🔨 Building shared packages..."
pnpm --filter @game/domain build || true

# TODO: add database initialization scripts as needed

echo "✅ Development environment ready!"
echo "🌐 Web client: http://localhost:3000"
echo "🔧 Server API: http://localhost:3001"
echo "🗄️ PostgreSQL: localhost:5432"
echo "⚡ Redis: localhost:6379"
```

#### Automated Installation via `postCreateCommand`

When the DevContainer is created, VS Code executes `/bin/bash .devcontainer/post-create.sh`. The script now performs four automated tasks:
- Normalizes permissions on every `node_modules` mount so the `node` user can delete and recreate dependencies.
- Runs `pnpm install` for the entire workspace.
- Installs (or reuses) the Codex CLI via `npm install -g @openai/codex`, ensuring AI tooling is available from inside the container.
- Rebuilds the shared `@game/domain` package so downstream apps can import compiled outputs immediately.

This makes the Codex CLI available both for local command invocations (`codex --version`) and for any automation scripts that run inside the devcontainer.

## Phase 2: Docker Development Orchestration

### docker-compose.dev.yml
```yaml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: .devcontainer/Dockerfile
    volumes:
      - ..:/workspace:cached
      - node_modules_workspace:/workspace/node_modules
      - web_node_modules:/workspace/apps/web/node_modules
      - server_node_modules:/workspace/apps/server/node_modules
      - domain_node_modules:/workspace/packages/domain/node_modules
    command: sleep infinity
    environment:
      - NODE_ENV=development
      - CHROME_BIN=/usr/bin/google-chrome
    network_mode: service:db-network
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:18-alpine
    container_name: el-dorado-postgres
    environment:
      POSTGRES_DB: el_dorado
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./scripts/init-db.sql:/docker-entrypoint-initdb.d/init-db.sql
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: el-dorado-redis
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  db-network:
    image: busybox
    command: ["true"]

volumes:
  node_modules_workspace:
  web_node_modules:
  server_node_modules:
  domain_node_modules:
  postgres_data:
  redis_data:
```

## Phase 3: Production Docker Configuration

### Dockerfile.web (Production)
```dockerfile
# Multi-stage build for React web app
FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/domain/package.json ./packages/domain/
COPY apps/web/package.json ./apps/web/

RUN npm install -g pnpm@9.1.1
RUN pnpm install --frozen-lockfile

COPY packages/domain ./packages/domain/
COPY apps/web ./apps/web/

RUN pnpm --filter @game/domain build
RUN pnpm --filter @game/web build

# Production stage
FROM nginx:alpine

# Copy built app
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
```

### Dockerfile.server (Production)
```dockerfile
# Multi-stage build for TanStack Start server
FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/domain/package.json ./packages/domain/
COPY apps/server/package.json ./apps/server/

RUN npm install -g pnpm@9.1.1
RUN pnpm install --frozen-lockfile

COPY packages/domain ./packages/domain/
COPY apps/server ./apps/server/

RUN pnpm --filter @game/domain build
RUN pnpm --filter @game/server build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy built application and dependencies
COPY --from=builder /app/apps/server/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/domain/dist ./node_modules/@game/domain

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

USER nodejs

EXPOSE 3001

ENV NODE_ENV=production
ENV HOST=0.0.0.0

CMD ["node", "dist/index.js"]
```

### docker-compose.prod.yml
```yaml
version: '3.8'

services:
  web:
    build:
      context: .
      dockerfile: Dockerfile.web
    ports:
      - "8080:8080"
    environment:
      - NODE_ENV=production
    depends_on:
      - server
    restart: unless-stopped

  server:
    build:
      context: .
      dockerfile: Dockerfile.server
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://postgres:postgres@postgres:5432/el_dorado
      - REDIS_URL=redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

  postgres:
    image: postgres:18-alpine
    environment:
      POSTGRES_DB: el_dorado
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
```

## Phase 4: Environment Configuration

### .env.example
```env
# Database Configuration
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/el_dorado
POSTGRES_PASSWORD=postgres

# Redis Configuration
REDIS_URL=redis://localhost:6379

# Application Configuration
NODE_ENV=development
PORT=3001
HOST=localhost

# Web Client Configuration
VITE_API_URL=http://localhost:3001
VITE_WS_URL=ws://localhost:3001

# Chrome MCP Configuration
CHROME_BIN=/usr/bin/google-chrome

# Fly.io Configuration (for production)
FLY_API_TOKEN=
FLY_APP_NAME=
```

### scripts/init-db.sql
```sql
-- Initialize El Dorado database schema
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Add initial game tables
CREATE TABLE IF NOT EXISTS games (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add more tables as needed for the game implementation
```

## Development Workflow

### Getting Started
1. **Open in DevContainer**: Open the project folder in VS Code and select "Reopen in Container"
2. **Automatic Setup**: The DevContainer will automatically install dependencies and build packages
3. **Start Development**: Run `pnpm dev` to start all services
4. **Access Services**:
   - Web Client: http://localhost:3000
   - Server API: http://localhost:3001
   - PostgreSQL: localhost:5432
   - Redis: localhost:6379

### Development Commands
```bash
# Install dependencies
pnpm install

# Start all development services
pnpm dev

# Run tests
pnpm test

# Build all packages
pnpm build

# Lint code
pnpm lint

# Database operations
pnpm db:migrate
pnpm db:seed
```

### VS Code Integration
- **Multi-terminal setup**: Pre-configured terminals for web, server, and database
- **Debug configuration**: Integrated debugging for React and Node.js
- **Code formatting**: Prettier and ESLint configuration
- **IntelliSense**: Full TypeScript and React support

### Hot Reload Configuration
- **Web client**: Vite dev server with hot module replacement
- **Server**: Nodemon for automatic server restarts
- **Database**: Persistent volumes for data persistence
- **Cache**: Redis with automatic reconnection

## Fly.io Deployment Configuration

### fly.toml
```toml
app = "el-dorado-tanstack"

[build]
  dockerfile = "Dockerfile.server"

[env]
  NODE_ENV = "production"
  PORT = "8080"

[[services]]
  protocol = "tcp"
  internal_port = 8080

  [[services.ports]]
    port = 80
    handlers = ["http"]

  [[services.ports]]
    port = 443
    handlers = ["tls", "http"]

[deploy]
  strategy = "rolling"
```

## Monitoring and Observability

### Health Checks
- **Server**: `/api/health` endpoint
- **Database**: PostgreSQL health check
- **Redis**: Redis ping command
- **Web client**: Nginx health check

### Logging
- **Structured logging**: JSON format for all services
- **Centralized logs**: Docker compose logs aggregation
- **Development logs**: Real-time log streaming in DevContainer

## Security Considerations

### Development Environment
- **Non-root user**: All containers run as non-root user
- **Minimal base images**: Alpine Linux for smaller attack surface
- **Dependency scanning**: Automated vulnerability scanning
- **Environment variables**: Secure handling of secrets

### Production Environment
- **Multi-stage builds**: Minimal production images
- **Security headers**: Proper CORS and security headers
- **Database security**: Encrypted connections and proper authentication
- **Container security**: Regular base image updates

## Troubleshooting

### Common Issues
1. **Port conflicts**: Ensure ports 3000, 3001, 5432, 6379 are available
2. **Dependency issues**: Clear node_modules and reinstall
3. **Database connection**: Check PostgreSQL health and credentials
4. **Redis connection**: Verify Redis service is running
5. **Hot reload not working**: Check volume mounts and file permissions

### Recovery Commands
```bash
# Reset development environment
docker-compose -f docker-compose.dev.yml down -v
docker-compose -f docker-compose.dev.yml up --build

# Clear dependencies
rm -rf node_modules packages/*/node_modules apps/*/node_modules
pnpm install

# Reset database
docker-compose -f docker-compose.dev.yml exec postgres psql -U postgres -c "DROP DATABASE IF EXISTS el_dorado; CREATE DATABASE el_dorado;"
```

This comprehensive DevContainer setup provides a complete, production-ready development environment optimized for the el-dorado-tanstack monorepo with TanStack technologies.
