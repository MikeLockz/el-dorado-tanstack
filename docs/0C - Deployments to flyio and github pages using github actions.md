# Comprehensive Deployment Guide: Fly.io & GitHub Pages with GitHub Actions

This document provides detailed technical information about deploying the El Dorado application to both Fly.io and GitHub Pages, explaining how static files are served, requests are routed, and responses are handled across different pipeline and platform configurations.

## 🔧 Architecture Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌──────────────────┐
│   GitHub Pages  │     │   Fly.io Apps   │     │   Local Dev      │
│   (Frontend)    │────▶│   (Backend)     │     │   Environment    │
│   Static Assets │ HTTP│   API Server    │     │                  │
│   CDN Distro    │     │   WebSocket     │     │   Vite Dev       │
└─────────────────┘     │   Postgres DB   │     │   Server         │
                        └─────────────────┘     └──────────────────┘
```

## 📁 File Serving Architecture

### GitHub Pages Deployment

**Build Process:**
1. **Source Files** → `apps/web/src/`
2. **Vite Build** → Compiles to `apps/web/dist/`
3. **Asset Processing** → Bundles JS/CSS with hash-based filenames
4. **GitHub Pages Upload** → Static files to GH Pages CDN
5. **Global Distribution** → Edge delivery from GitHub's CDN

**Request Flow:**
```
User Request → GitHub Pages CDN → Static Files CDN Edge → Browser Cache
```

**Key Components:**
- **Pre-built static assets**: `index.html`, hashed CSS/JS files
- **404.html configuration**: Enables client-side routing for SPA
- **Asset path updates**: Replaces absolute paths with repo-relative paths
- **CDN Cache headers**: Automatic caching by GitHub Pages infrastructure

### Fly.io Deployment

**Build Process:**
1. **Multi-stage Docker Build** →
   - Stage 1: Node.js builds React app
   - Stage 2: Nginx serves built files
2. **Static Asset Embedding** → Files compiled into Docker image
3. **Nginx Configuration** → Static file serving with SPA routing support
4. **Fleet Deployment** → Multiple machine replicas (configured by `count`)

**Request Flow:**
```
User Request → Fly.io Anycast IP → Nearest Region → Machine Instance → Nginx → Static Files
```

**Key Components:**
- **Anycast routing**: Global IP routes to nearest region
- **Docker Multi-stage**: Separation of build and runtime environments
- **Nginx reverse proxy**: Handles static files, SPA routing, and compression
- **Machine management**: Auto-scaling with health checks

## 🚀 Pipeline Configuration

### Fly.io Pipeline (`/.github/workflows/deploy.yml`)

#### Build Steps:
```yaml
# 1. Docker Image Build
- Repository context sent to Fly.io build service
- Dockerfile.web executes: Node.js → Build Assets → Nginx Stage
- Dependencies cached: pnpm-lock.yaml, node_modules

# 2. Deployment Strategy
- Rolling deployment strategy
- Machines updated sequentially
- Zero-downtime deployments

# 3. Health Checks
- TCP health checks on configured ports
- HTTP health checks on `/api/health` for backend
- Automatic rollback on failure
```

#### Environment Variables Processing:
```bash
# Build-time environment variables (Dockerfile)
ARG VITE_API_URL=${VITE_API_URL:-https://default-api.fly.dev}
ENV VITE_API_URL=${VITE_API_URL}

# Runtime environment variables (Fly.io secrets)
fly secrets set DATABASE_URL="your-db-url"
fly secrets set JWT_SECRET="your-secret"
```

### GitHub Pages Pipeline (`/.github/workflows/deploy-gh-pages.yml`)

#### Build Steps:
```yaml
# 1. Dependencies Installation
- pnpm lockfile validation
- Node.js 20 environment
- Cached dependencies for performance

# 2. Build Process
- Domain package compilation
- Web application build with environment variables
- Asset bundling with Vite

# 3. Path Normalization
# Example: /assets/file.js → /repo-name/assets/file.js
- Repository name detection from GitHub context
- Asset path modifications for proper hosting
- 404.html generation for SPA routing

# 4. Deployment
- Pages artifact creation
- Atomic deployment to GitHub Pages infrastructure
- CDN invalidation and cache warming
```

#### Environment Variables Processing:
```bash
# Build-time environment variables (GitHub Secrets)
VITE_API_URL: ${{ secrets.VITE_API_URL }}
VITE_WS_URL: ${{ secrets.VITE_WS_URL }}

# Dynamic repository detection
REPO_NAME=$(echo "${{ github.event.repository.name }}" | tr '[:upper:]' '[:lower:]')
```

## 🌐 Request Handling & Response Patterns

### Static Asset Requests

**Standard Asset Request:**
```http
GET /assets/index-ABC123.js
Host: your-domain.fly.dev
Accept-Encoding: gzip, deflate, br

# Response
HTTP/1.1 200 OK
Content-Type: text/javascript
Content-Encoding: gzip
Cache-Control: public, max-age=31536000
ETag: "ABC123"
Last-Modified: Thu, 01 Jan 2024 12:00:00 GMT
[Compressed JavaScript content]
```

**Cache Headers:**
- `Cache-Control: max-age=31536000` (1 year cache for hashed assets)
- `ETag` support for conditional requests
- `Last-Modified` timestamp verification

### SPA Routing Requests

**Client-side Route (404 fallback):**
```http
GET /games/123/round/5
Host: your-site.pages.dev
Accept: text/html

# Response - 404.html with 200 OK
HTTP/1.1 200 OK
Content-Type: text/html
Content-Length: 1234
[index.html content with JavaScript for client-side routing]
```

**Route Handling Logic:**
1. Nginx tries: `games/123/round/5` → Falls back to `/index.html`
2. React Router reads URL and renders appropriate component
3. API calls made to backend via configured endpoints

### API Requests (Backend)

**HTTP Request:**
```http
POST /api/games/123/bids
Host: your-api.fly.dev
Content-Type: application/json
Authorization: Bearer <token>

{"playerId": "123", "bid": 3, "round": 5}

# Response
HTTP/1.1 200 OK
Content-Type: application/json
X-Response-Time: 45ms

{"success": true, "data": {"id": "bid_456", ...}}
```

**WebSocket Connection:**
```http
GET /ws?gameId=123&playerId=456
Host: your-api.fly.dev
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: <base64-key>
Sec-WebSocket-Version: 13
```

## 🔧 Detailed Setup Instructions

### Fly.io Initial Setup

#### 1. Install Required Tools

```bash
# Install Fly.io CLI (macOS)
brew install flyctl

# Install Fly.io CLI (Linux)
curl -L https://fly.io/install.sh | sh

# Install Fly.io CLI (Windows)
powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
```

#### 2. Authentication & Project Setup

```bash
# Authenticate with Fly.io
fly auth login

# Check current organizations/workspaces
fly orgs list

# Switch to personal organization (if needed)
fly orgs personal select
```

#### 3. Application Initialization

```bash
# Navigate to project root
cd /path/to/el-dorado-tanstack

# Initialize apps (if not already done)
fly apps create el-dorado-tanstack
fly apps create el-dorado-tanstack-server
fly apps create el-dorado-tanstack-db

# Check current application status
fly status -a el-dorado-tanstack
fly status -a el-dorado-tanstack-server
fly status -a el-dorado-tanstack-db
```

#### 4. Environment Configuration

```bash
# Check existing configuration
fly config show -a el-dorado-tanstack
fly config show -a el-dorado-tanstack-server

# Set environment variables for frontend (build-time)
fly secrets set VITE_API_URL="https://your-api.fly.dev" VITE_WS_URL="wss://your-api.fly.dev/ws" -a el-dorado-tanstack

# Set environment variables for backend (runtime)
fly secrets set DATABASE_URL="postgres://..." JWT_SECRET="your-secret-key" -a el-dorado-tanstack-server
```

#### 5. Scaling Configuration

```bash
# View current scaling
fly scale show -a el-dorado-tanstack
fly scale show -a el-dorado-tanstack-server

# Scale applications
# Frontend: Single machine for cost savings
fly scale count 1 -a el-dorado-tanstack --yes

# Backend: Single machine for backend operations
fly scale count 1 -a el-dorado-tanstack-server --yes

# Database: Typically single primary instance
# (Managed database scaling handled differently)
```

#### 6. Deployment Process

```bash
# Deploy frontend application
fly deploy -a el-dorado-tanstack

# Deploy backend application
fly deploy -a el-dorado-tanstack-server

# Monitor deployment process
fly status -a el-dorado-tanstack -w
fly status -a el-dorado-tanstack-server -w
```

#### 7. Volume Management (for database)

```bash
# List existing volumes
fly volumes list -a el-dorado-tanstack-db

# Create volume if needed
fly volumes create pg_data --size 10GB -a el-dorado-tanstack-db

# Check volume status
fly volumes show vol_volume_id -a el-dorado-tanstack-db
```

#### 8. Networking & DNS

```bash
# Check assigned hostnames
fly apps list

# View application logs
fly logs -a el-dorado-tanstack
fly logs -a el-dorado-tanstack-server
```

### GitHub Pages Migration Setup

#### 1. Prerequisites Installation

```bash
# Install GitHub CLI
brew install gh  # macOS
# Linux: curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
# Windows: winget install GitHub.cli

# Verify installation
gh --version
```

#### 2. GitHub Authentication and Repository Setup

```bash
# Authenticate with GitHubgh auth login

# Check authentication status
gh auth status

# Create new repository for frontend (if needed)
gh repo create YOUR_USERNAME/el-dorado-tanstack --public --clone=false

# Add remote if not already set
git remote add origin https://github.com/YOUR_USERNAME/el-dorado-tanstack.git
git push -u origin main
```

#### 3. Configure GitHub Pages Environment

```bash
# Run the automated setup script
./scripts/setup-github-pages.sh

# Manual verification of setup (if script fails)
gh repo view YOUR_USERNAME/el-dorado-tanstack
```

#### 4. Environment Variables Configuration

The setup script automatically configures these variables. For manual setup:

```bash
# Set API endpoint secrets
gh secret set VITE_API_URL  \
  --repo YOUR_USERNAME/el-dorado-tanstack \
  --body "https://el-dorado-tanstack-server.fly.dev"

gh secret set VITE_WS_URL \
  --repo YOUR_USERNAME/el-dorado-tanstack \
  --body "wss://el-dorado-tanstack-server.fly.dev/ws"

# Verify secrets were set
g secret list --repo YOUR_USERNAME/el-dorado-tanstack
```

#### 5. GitHub Pages Enablement

```bash
# Enable GitHub Pages (automated via setup script)
gh api \
  --method POST \
  -H "Accept: application/vnd.github+json" \
  -H "X-GitHub-Api-Version: 2022-11-28" \
  "/repos/YOUR_USERNAME/el-dorado-tanstack/pages" \
  -f source='{"from": "branch", "branch": "main", "path": "/"}'
```

#### 6. Enable GitHub Actions

```bash
# Enable GitHub Actions and Pages
gh repo edit YOUR_USERNAME/el-dorado-tanstack --enable-discussions --enable-issues
```

### Backend CORS Configuration for GitHub Pages

#### 1. Identify GitHub Pages URL

```bash
# Your GitHub Pages URL will be:
https://YOUR_USERNAME.github.io/YOUR_REPO_NAME

# Update backend CORS settings
./scripts/update-backend-cors.sh YOUR_USERNAME/YOUR_REPO_NAME
```

#### 2. Manual Backend CORS Update

If the script doesn't work for your backend technology:

```bash
# Set CORS environment variable
fly secrets set CORS_ORIGIN="https://YOUR_USERNAME.github.io/YOUR_REPO_NAME,https://el-dorado-tanstack-server.fly.dev" -a el-dorado-tanstack-server

# Restart backend for changes to take effect
fly restart -a el-dorado-tanstack-server
```

### Verification and Testing

#### 1. Initial Deployment Check

```bash
# Trigger deployment
git push origin main  # Or manually trigger via GitHub Actions

# Check deployment status
gh run list --repo YOUR_USERNAME/el-dorado-tanstack

# Monitor deployment progress
gh run view --repo YOUR_USERNAME/el-dorado-tanstack --web
```

#### 2. Final Testing

```bash
# Check all services are running
fly status -a el-dorado-tanstack-server
curl -I https://YOUR_USERNAME.github.io/YOUR_REPO_NAME

# Test API connectivity from GitHub Pages
# Visit in browser and check console for CORS errors

# Check backend logs
fly logs -a el-dorado-tanstack-server
```

## 🌍 Network Flow & Performance

### DNS Resolution Flow

```
GitHub Pages URL Resolution:
User Browser → DNS Query → GitHub DNS → Fastly CDN → Origin Host (GitHub)

Fly.io URL Resolution:
User Browser → DNS Query → Fly.io DNS → Anycast IP → Nearest Region → Machine Instance
```

### CDN Performance Comparison

| Feature | GitHub Pages | Fly.io |
|---------|-------------|--------|
| **CDN Provider** | Fastly | Via Fly.io regions |
| **Global Edge Locations** | 100+ | 25+ regions |
| **Cache Invalidation** | Automatic on deploy | Manual via config |
| **SSL/TLS** | Automatic | Automatic |
| **Request Limit** | 100GB free, then rates apply | Per-machine limits |

### Performance Metrics

**GitHub Pages Response Times (typical):**
- First Byte: 50-200ms globally
- Cache Hits: 10-50ms
- Static Assets: Gzipped, Brotli compressed

**Fly.io Response Times (typical):**
- Launch: 50-100ms from nearest region
- Static Files: 20-100ms machine-local cache
- API/Database: 20-200ms depending on complexity

## 🔒 Security Considerations

### Pipeline Security

**GitHub Actions Secrets:**
- Environment variables never logged or printed
- Masked in build output
- Repository-level granular permissions
- Audit logging via GitHub security logs

**Fly.io Secrets Management:**
- Encrypted at rest and in transit
- Build-time vs runtime secret injection
- Secret rotation capabilities
- Access via IAM-style permissions

**Build Security:**
```bash
# Dependency scanning
checks for vulnerable packages
- SCA (Software Component Analysis) via GitHub
curl -sSL https://get.pnpm.io/install.sh | sh -
- Build artifact verification
contcryptographic signatures verification
```

### Runtime Security

**Web Application Firewall:**
- Nginx security headers in Docker configuration
- Cross-site scripting protections
- Content Security Policy headers
```nginx
add_header X-Frame-Options DENY;
add_header X-Content-Type-Options nosniff;
add_header X-XSS-Protection "1; mode=block";
```

**CORS Configuration:**
```bash
# Strict origin validation
fly secrets set CORS_ORIGIN="https://yourname.github.io/yourrepo" -a yourapp

# Wildcard restrictions for development
fly secrets set CORS_ORIGIN="http://localhost:3000,http://localhost:5173" -a development-app
```

## 📈 Monitoring & Observability

### Application Metrics

**Fly.io Application Monitoring:**
```bash
# View application metrics
fly metrics -a el-dorado-tanstack

# Machine statistics
fly machines list -a el-dorado-tanstack

# Custom metrics via StatsD/Logging
fly logs -a el-dorado-tanstack -f
```

**GitHub Actions Monitoring:**
```bash
# Workflow runs history
gh run list --repo username/repo --limit 10

# Detailed logs
gh run view --repo username/repo --job 12345 --logs

# Deployment success rate
gh api repos/username/repo/actions/runs --jq '.workflow_runs[] | {conclusion, status}'
```

### Performance Monitoring

**Custom Monitoring Setup:**
```bash
# Vercel Speed Insights-alternative for static sites
# Google Analytics + Core Web Vitals
# Or custom RUM (Real User Monitoring) via Segment/Mixpanel
```

### Error Tracking

**GitHub Issues Integration:**
```bash
# Create issues from failed deployments
gh issue create --title "Deployment Failed" --body "Workflow failed: $(date)"
```

## 🔍 Debugging & Troubleshooting

### Common Deployment Issues

#### Build Failures in GitHub Actions

**Issue:** Pnpm lockfile mismatch
```bash
# Solution: Update lockfile locally
pnpm install --fix-lockfile
git commit -m "Fix lockfile" -a
git push
```

**Issue:** Node.js version mismatch
```yaml
# Solution: Specify exact version in workflow
- uses: actions/setup-node@v4
  with:
    node-version: '20'  # Specify major version
```

#### Fly.io Deployment Issues

**Issue:** Machine capacity exceeded
```bash
# Check machine usage
fly machine status machine-id

# Temporarily scale up
fly scale count 2 --app el-dorado-tanstack --yes

# Check region capacity
fly regions list
```

**Issue:** Docker build timeout
```bash
# Increase build timeout in fly.toml
[build]
  dockerfile = "Dockerfile.web"
  args = ["BUILDKIT_INLINE_CACHE=1"]
```

### Performance Optimization

#### Frontend Optimization

**Bundle Analysis:**
```bash
# Analyze bundle size
pnpm run build --stats
cat apps/web/dist/stats.html  # View in browser

# Check duplicate dependencies
pnpm show --json | jq '.dependencies | keys'
```

**Compression Configuration:**
```nginx
# In nginx.conf for Fly.io deployment
gzip on;
gzip_vary on;
gzip_comp_level 6;
gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
```

#### Backend Optimization

**Database Connection Pooling:**
```bash
# Check connection limits
fly logs -a el-dorado-tanstack-db | grep "connection"

# Optimize connection pool settings related env vars
fly secrets set DATABASE_POOL_SIZE=20 -a el-dorado-tanstack-server
```

## 📋 Deployment Checklist

### Pre-deployment Checklist
- [ ] All environment variables configured in secrets
- [ ] Backend CORS correctly configured for frontend origin
- [ ] Database migrations applied successfully
- [ ] Test suite passing locally
- [ ] No hardcoded API URLs in frontend code
- [ ] Build process working locally

### Post-deployment Verification
- [ ] Frontend loads without errors
- [ ] API endpoints responding correctly
- [ ] WebSocket connections established
- [ ] CORS no errors in browser console
- [ ] Database queries executing successfully
- [ ] Performance metrics acceptable
- [ ] Monitoring/alerts configured

### Monitoring Setup
- [ ] Application logs readable via console/logs
- [ ] Error tracking service configured
- [ ] Performance monitoring active
- [ ] Backup strategy implemented
- [ ] Security headers verified
- [ ] Vulnerability scanning scheduled

This comprehensive guide covers all technical aspects of the deployment pipeline. For specific implementation issues, refer to the troubleshooting sections or check the individual script files for detailed error handling.

---

**Next Steps:**
1. Set up repositories if not already done
2. Configure environment variables
3. Run deployment setup scripts
4. Monitor deployments via GitHub Actions and Fly.io dashboards
5. Set up monitoring and alerting for ongoing operations