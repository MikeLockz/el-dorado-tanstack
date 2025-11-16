# El Dorado - 16K Lines of Multiplayer Game Engine in 3 Days 🎮

🧠 **Spec-driven development** • 🤖 **AI-assisted coding** • 🔥 **TanStack everything** • 💰 **≤$5/month hosting**

Built **51 commits** and **16,529 lines** of battle-tested multiplayer card game code in **3 days** using modern tools and workflows.

## 🚀 What's This?

A production-ready multiplayer trick-taking card game built with cutting-edge tech:
- **Full-stack TanStack**: Router, Query, and Store on both frontend & backend
- **Real-time WebSockets**: Bidirectional communication for multiplayer gameplay
- **Deterministic game engine**: Event sourcing architecture with replay capability
- **PostgreSQL + Redis**: Production data persistence with complex queries
- **React 19 + TypeScript**: Modern frontend with type safety throughout

## 🏗️ Technical Architecture

### Monorepo Structure
```
el-dorado-tanstack/
├── packages/domain/     # 🎲 Pure TypeScript game engine (deterministic, replayable)
├── apps/server/        # 🔧 Node.js backend (WebSocket gateway, REST API, auth)
├── apps/web/           # ⚛️ React/TanStack frontend (Vite, hot reload, static build)
└── docs/              # 📋 Enterprise-level documentation (12+ spec documents)
```

### Key Technologies
- **Frontend**: React 19, TanStack Router, Query, Store, Tailwind CSS, Vite
- **Backend**: Node.js, WebSockets, JWT auth, Drizzle ORM, OpenTelemetry
- **Testing**: Vitest, Playwright, Storybook (20 test files, comprehensive coverage)
- **Deployment**: GitHub Pages + Fly.io hybrid (saves $2/month)
- **Database**: PostgreSQL with deterministic event replay system

## 🤖 Development Workflow

### AI-Powered Development
- **Claude Code in dangerous mode**: Maximum efficiency AI-assisted coding
- **DevContainer**: Full development environment with Chrome MCP integration
- **Spec-driven development**: 12+ comprehensive documents drive implementation
- **Model experimentation**: Testing Codex 5.1 and Kimi K2 alongside Claude

### Development Environment
```bash
# Full dev environment with PostgreSQL, Redis, Chrome MCP
devcontainer open

# Install dependencies once
pnpm install

# Run both servers concurrently with hot reload
pnpm dev
```

## 💰 Cost-Optimized Deployment

**Before**: $5/month (Fly.io hosting both frontend + backend)
**After**: $2.98/month (GitHub Pages + Fly.io backend)

- **Frontend**: GitHub Pages (free static hosting)
- **Backend**: Fly.io with PostgreSQL database
- **Total monthly cost**: Under $3 for full multiplayer game infrastructure

**Deployment pipeline**: GitHub Actions → automatic GitHub Pages deployment on push to main

## 📊 Project Metrics

| Metric | Value | Timeline |
|--------|--------|----------|
| **Commits** | 51 | 3 days (Nov 12-15, 2025) |
| **Lines of Code** | 16,529 | TypeScript across monorepo |
| **Test Files** | 20 | Unit, integration, E2E tests |
| **Documentation** | 12+ spec docs | Comprehensive system design |
| **Branches** | 1 | Stable main development |

## 🎮 Game Features

- **Multiplayer trick-taking card game**: 2-10 players, 10 rounds
- **Real-time gameplay**: WebSocket-based room management
- **Bot AI opponents**: Strategic gameplay algorithms
- **Player profiles**: Statistics, preferences, leaderboard
- **Deterministic replay**: Every game can be replayed exactly
- **Comprehensive UI**: Scorecard, bidding, game state management

## 🧪 Testing Strategy

- **Unit tests**: All packages covered with Vitest
- **Integration tests**: Server-side API testing
- **E2E tests**: Playwright browser automation
- **Component tests**: Storybook for UI components
- **Game engine tests**: Deterministic validation and replay testing

## 🚀 Quick Start

### Prerequisites
- Node 20+
- PNPM 9.1.1
- Google Chrome (for Chrome MCP/testing)

### Development
```bash
# Install dependencies first
pnpm install

# Run both dev servers concurrently
pnpm dev  # Backend: localhost:4000, Frontend: localhost:5173

# Or run individually:
pnpm --filter @game/server dev:watch
pnpm --filter @game/web dev
```

### Testing
```bash
# Run all tests
pnpm --filter @game/web test      # Frontend tests
pnpm --filter @game/server test   # Backend tests
pnpm --filter @game/domain test   # Game engine tests

# Integration & E2E tests
pnpm test:integration
pnpm test:e2e
```

### Building
```bash
pnpm build  # Build all packages
```

## 🔧 Technical Highlights

### Deterministic Game Engine
- **Event sourcing**: All game state changes are events
- **Replay capability**: Any game can be replayed exactly
- **Pure functions**: No side effects, testable game logic
- **Type safety**: Full TypeScript coverage

### Multiplayer Architecture
- **WebSocket gateway**: Bidirectional communication
- **Server-authoritative**: Game validation on backend
- **Room management**: Dynamic game room creation/joining
- **Real-time updates**: Instant game state synchronization

### Modern Frontend
- **TanStack ecoystem**: Router, Query, Store for state management
- **Component-driven**: Storybook for UI development
- **Performance optimized**: Virtualization, memoization
- **Responsive design**: Tailwind CSS utilities

## 📋 Architecture Documentation

Comprehensive specs in `/docs/`:
- [Implementation Plan](docs/00%20—%20IMPLEMENTATION_PLAN.md)
- [Game Design](docs/01%20—%20GAME_DESIGN.md)
- [System Architecture](docs/02%20—%20SYSTEM_ARCHITECTURE.md)
- [Domain Model](docs/03%20—%20DOMAIN_MODEL_AND_STATE_MACHINE.md)
- [Event & Replay Model](docs/04%20—%20EVENT_%26_REPLAY_MODEL.md)
- [Networking Protocol](docs/05%20—%20NETWORKING_%26_PROTOCOL.md)
- And more...

## 🎯 What's Next?

This project demonstrates what's possible with modern tools and AI assistance:
- **Spec-driven development** ensures requirements drive implementation
- **Comprehensive testing** guarantees production reliability
- **Cost optimization** makes hosting sustainable
- **Rapid iteration** enables quick feature development

---

*Built with ❤️ using modern web technologies, AI assistance, and enterprise-grade development practices.*

**🚀 Ready to play?** `pnpm install && pnpm dev`