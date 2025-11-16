# GitHub Pages Setup Guide 🚀

This guide will help you move your frontend from Fly.io to GitHub Pages for free hosting.

## 📊 Cost Savings

| Service | Before | After | Savings |
|---------|--------|-------|---------|
| Frontend (el-dorado-tanstack) | $2.02/month | $0/month | $2.02/month |
| **Total Monthly Savings** | | | **$2.02/month** |

## 🛠️ Setup Process

### Step 1: Configure GitHub Repository

1. **Ensure you have GitHub CLI installed:**
   ```bash
   gh --version || brew install gh  # macOS
   # or visit https://cli.github.com/
   ```

2. **Authenticate with GitHub:**
   ```bash
   gh auth login
   ```

3. **Push your code to GitHub (if not already):**
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
   git push -u origin main
   ```

4. **Run the setup script:**
   ```bash
   ./scripts/setup-github-pages.sh
   ```

   This script will:
   - Set environment variables for your backend URLs
   - Enable GitHub Pages on your repository
   - Configure the necessary secrets

### Step 2: Update Backend CORS Settings

After setting up GitHub Pages, update your backend to allow requests from GitHub Pages:

```bash
./scripts/update-backend-cors.sh YOUR_USERNAME/YOUR_REPO_NAME
```

**Example:**
```bash
./scripts/update-backend-cors.sh johndoe/el-dorado-tanstack
```

### Step 3: Deploy

The GitHub Action will automatically run:
- On every push to `main` or `master` branch
- When manually triggered via GitHub Actions tab

**Deployment Status:**
- Check progress at: `https://github.com/YOUR_USERNAME/YOUR_REPO_NAME/actions`
- Your site will be at: `https://YOUR_USERNAME.github.io/YOUR_REPO_NAME`

## 🔧 Environment Variables

The setup script automatically configures these environment variables:

- `VITE_API_URL`: Your Fly.io backend URL
- `VITE_WS_URL`: Your Fly.io WebSocket URL

**Backend URLs (used by setup script):**
- API: `https://el-dorado-tanstack-server.fly.dev`
- WebSocket: `wss://el-dorado-tanstack-server.fly.dev/ws`

## 🚨 Important Notes

1. **Backend stays on Fly.io** - Only the frontend moves to GitHub Pages
2. **Database stays on Fly.io** - No changes needed there
3. **CORS must be updated** - Backend needs to accept requests from GitHub Pages
4. **WebSocket connections** - Will still work from GitHub Pages to Fly.io backend
5. **SSL/HTTPS** - GitHub Pages provides free SSL automatically

## 🔒 Troubleshooting

### If deployment fails:
1. Check GitHub Actions logs for build errors
2. Verify environment variables are set in GitHub secrets
3. Ensure your backend CORS allows the GitHub Pages domain

### If API calls fail:
1. Check browser console for CORS errors
2. Verify backend is running: `fly status -a el-dorado-tanstack-server`
3. Check environment variables in GitHub repository settings

### If you need to update URLs:
```bash
gh secret set VITE_API_URL --repo YOUR_USERNAME/YOUR_REPO_NAME --body "NEW_URL"
gh secret set VITE_WS_URL --repo YOUR_USERNAME/YOUR_REPO_NAME --body "NEW_WS_URL"
```

## 🔄 Rollback (if needed)

To move back to Fly.io:
1. Stop GitHub Pages in repository settings
2. Redeploy frontend to Fly.io: `fly deploy -a el-dorado-tanstack`
3. Scale up if needed: `fly scale count 1 -a el-dorado-tanstack`

## 📋 Final Checklist

- [ ] Frontend repository pushed to GitHub
- [ ] GitHub CLI authenticated
- [ ] Setup script executed successfully
- [ ] Backend CORS updated
- [ ] GitHub Actions workflow created
- [ ] First deployment successful
- [ ] Site accessible at GitHub Pages URL
- [ ] API calls working from GitHub Pages to Fly.io backend

**Congratulations on your cost savings! 🎉**