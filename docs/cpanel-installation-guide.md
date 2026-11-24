# cShip cPanel Installation Guide

Complete step-by-step guide to deploy cShip on a cPanel account using Node.js Selector (Phusion Passenger).

## Prerequisites

### cPanel Account Requirements
- **Node.js Selector** (Application Manager) with Node.js 20+
- **Shell access** (SSH or cPanel Terminal)
- **Git** and **npm** available in shell
- **MongoDB Atlas** cluster (external - cPanel doesn't provide MongoDB)
- **Domain/subdomain** for API and Dashboard with AutoSSL

### Required Tools
```bash
# Verify these are available
node --version    # >= 20.0.0
npm --version     # >= 10.0.0
git --version
```

---

## Step 1: Prepare Repository

```bash
# SSH into cPanel account
ssh user@yourserver.com

# Clone repository outside public_html
cd ~
git clone https://github.com/your-org/cship.git
cd cship

# Or upload via cPanel File Manager / SFTP
```

**Directory Structure:**
```
/home/youruser/
├── cship/
│   ├── client/          # Next.js dashboard
│   └── server/          # Express API
├── cship-apps/          # DEPLOYMENTS_ROOT (private, not web-accessible)
└── public_html/         # Normal web roots only
```

---

## Step 2: MongoDB Atlas Setup

1. **Create Atlas Cluster** (M10+ recommended for change streams)
2. **Create Database User** with access to `cship` database only
3. **Network Access** - Add cPanel server's egress IP(s)
   - Shared hosting: may need `0.0.0.0/0` with strong password
4. **Get Connection String:**
   ```
   mongodb+srv://USER:PASS@cluster.example.net/cship?retryWrites=true&w=majority
   ```
5. **Test Connectivity:**
   ```bash
   node -e "require('mongoose').connect('YOUR_URI').then(()=>console.log('OK')).catch(console.error)"
   ```

---

## Step 3: Configure Server (API)

### 3.1 Install Dependencies
```bash
cd ~/cship/server
npm ci --omit=dev
```

### 3.2 Create Environment File
```bash
cp .env.example .env
chmod 600 .env
```

### 3.3 Required Environment Variables
Edit `.env` with your values:

```bash
# Runtime
NODE_ENV=production
PORT=4000                    # Passenger provides this automatically
LOG_LEVEL=info

# MongoDB Atlas (REQUIRED)
MONGODB_URI=mongodb+srv://USER:PASS@cluster.net/cship?retryWrites=true&w=majority

# Dashboard Origin (must match exactly)
CLIENT_ORIGIN=https://cship.yourdomain.com

# Public API URL (for GitHub webhooks)
PUBLIC_SERVER_URL=https://api.yourdomain.com

# Sessions & Encryption (REQUIRED)
SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
TOKEN_ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# GitHub OAuth
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GITHUB_CALLBACK_URL=https://api.yourdomain.com/api/auth/github/callback
ADMIN_GITHUB_LOGINS=your-github-login,other-admin-login

# cPanel UAPI
CPANEL_URL=https://yourserver.com:2083
CPANEL_USERNAME=your_cpanel_username
CPANEL_API_TOKEN=your_cpanel_api_token
DEPLOYMENTS_ROOT=/home/youruser/cship-apps

# Build Safety
BUILD_MEMORY_MB=512
MAX_CONCURRENT_BUILDS=1
BUILD_TIMEOUT_MS=900000
SSE_HEARTBEAT_MS=15000
```

**Generate Secrets:**
```bash
# Run these commands and copy output to .env
node -e "console.log('SESSION_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('TOKEN_ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'))"
```

### 3.4 Create Deployment Root
```bash
mkdir -p /home/youruser/cship-apps
chmod 755 /home/youruser/cship-apps
```

### 3.5 Setup Node.js App in cPanel
1. **cPanel → Setup Node.js App → Create Application**
2. **Configuration:**
   - Node.js version: **20** (or latest available)
   - Application mode: **Production**
   - Application root: `/home/youruser/cship/server`
   - Application URL: `api.yourdomain.com` (or subdomain)
   - Application startup file: `server.js`
   - Passenger log file: `passenger.log`

3. **Environment Variables** (copy from `.env`):
   - Click "Add Variable" for each entry in `.env`
   - **Important**: Do NOT include `PORT` - Passenger provides it

4. **Save & Restart**

### 3.6 Verify API
```bash
# Restart via touch
mkdir -p ~/cship/server/tmp
touch ~/cship/server/tmp/restart.txt

# Test health endpoint
curl -s https://api.yourdomain.com/api/health
```

**Expected Response:**
```json
{
  "status": "ok",
  "service": "cship-server",
  "database": { "configured": true, "status": "connected" },
  "queue": { "depth": 0, "processing": 0 },
  "worker": { "status": "running" }
}
```

---

## Step 4: Configure Client (Dashboard)

### 4.1 Install & Build
```bash
cd ~/cship/client
npm ci
NEXT_PUBLIC_API_URL=https://api.yourdomain.com npm run build
```

**Note**: `NEXT_PUBLIC_API_URL` is inlined at build time. Rebuild if it changes.

### 4.2 Setup Node.js App in cPanel
1. **cPanel → Setup Node.js App → Create Application**
2. **Configuration:**
   - Node.js version: **20** (or latest)
   - Application mode: **Production**
   - Application root: `/home/youruser/cship/client`
   - Application URL: `cship.yourdomain.com`
   - Application startup file: `server.js`
   - Passenger log file: `passenger.log`

3. **Environment Variables:**
   - `NODE_ENV=production`
   - `NEXT_PUBLIC_API_URL=https://api.yourdomain.com`

4. **Save & Restart**

### 4.3 Verify Dashboard
```bash
mkdir -p ~/cship/client/tmp
touch ~/cship/client/tmp/restart.txt

curl -I https://cship.yourdomain.com/
# Should return HTTP 200
```

Open `https://cship.yourdomain.com` in browser - you should see the login page.

---

## Step 5: GitHub OAuth Setup

### 5.1 Create GitHub OAuth App
1. GitHub → Settings → Developer settings → OAuth Apps → New OAuth App
2. **Settings:**
   - Application name: `cShip`
   - Homepage URL: `https://cship.yourdomain.com`
   - Authorization callback URL: `https://api.yourdomain.com/api/auth/github/callback`
3. **Copy Client ID & Client Secret** to server `.env`

### 5.2 Required Scopes
- `repo` (repository access)
- `admin:repo_hook` (webhook management)
- `read:user` (user profile)

### 5.3 Update Server `.env`
```bash
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
GITHUB_CALLBACK_URL=https://api.yourdomain.com/api/auth/github/callback
ADMIN_GITHUB_LOGINS=your-github-login,other-admin
```

### 5.4 Restart API
```bash
touch ~/cship/server/tmp/restart.txt
```

---

## Step 6: cPanel UAPI Token

### 6.1 Create API Token
1. **cPanel → Manage API Tokens → Create**
2. **Name**: `cShip`
3. **Permissions** (minimum required):
   - `SubDomain::addsubdomain`
   - `SubDomain::listsubdomains`
   - `DomainInfo::single`
   - `PassengerApps::list` (if available)
   - `PassengerApps::register` (if available)
   - `PassengerApps::edit` (if available)
   - `PassengerApps::delete` (if available)

### 6.2 Update Server `.env`
```bash
CPANEL_URL=https://yourserver.com:2083
CPANEL_USERNAME=your_cpanel_username
CPANEL_API_TOKEN=your_api_token_here
```

### 6.3 Test UAPI Connectivity
```bash
curl -H "Authorization: cpanel youruser:yourtoken" \
  https://yourserver.com:2083/execute/SubDomain/listsubdomains
```

---

## Step 7: SSL & DNS Verification

### 7.1 AutoSSL
- Ensure both domains have valid SSL via cPanel AutoSSL
- Force HTTPS redirect in cPanel if needed

### 7.2 DNS Propagation
- Create subdomain `api.yourdomain.com` → points to cPanel IP
- Create subdomain `cship.yourdomain.com` → points to cPanel IP
- Wait for DNS propagation (up to 48 hours)

### 7.3 Verify in Dashboard
After first deployment, check **Project Settings → Domain** tab for:
- DNS resolution status
- SSL certificate validity
- Document root path

---

## Step 8: First Project Deployment

### 8.1 Login to Dashboard
1. Open `https://cship.yourdomain.com`
2. Click "Sign in with GitHub"
3. Authorize the OAuth app
4. Only admins in `ADMIN_GITHUB_LOGINS` can sign in

### 8.2 Create Project
1. Click "New Project"
2. Select repository from list
3. Select branch
4. Configure:
   - Framework (Next.js/React/Express/Static)
   - Build/Install/Start commands
   - Output directory
   - Subdomain (e.g., `myapp`)
5. Click "Create Project"

### 8.3 Trigger First Deployment
1. Open project detail page
2. Click "Deploy"
3. Watch live logs in console
4. Wait for "Ready" status

### 8.4 Verify Deployment
- Visit `https://myapp.yourdomain.com`
- Check SSL certificate
- Check DNS resolution in Settings

---

## Step 9: Post-Installation Configuration

### 9.1 Rate Limiting (Optional Tuning)
```bash
# In server/.env - adjust based on traffic
RATE_LIMIT_AUTH_MAX=5
RATE_LIMIT_AUTH_WINDOW_MS=900000
RATE_LIMIT_WEBHOOK_MAX=30
RATE_LIMIT_WEBHOOK_WINDOW_MS=60000
RATE_LIMIT_API_MAX=100
RATE_LIMIT_API_WINDOW_MS=60000
```

### 9.2 Release Retention
Per-project setting in **Settings → Build & Deploy → Release retention**
- Default: 5 releases
- Range: 1-20

### 9.3 Backup Schedule
```bash
# Add to crontab (runs daily at 2 AM)
0 2 * * * /home/youruser/cship/scripts/backup.sh

# Or use Atlas native backups (recommended)
```

### 9.4 Monitoring
- **Health endpoint**: `https://api.yourdomain.com/api/health`
- **Metrics**: queue depth, worker status, disk space, memory
- **Logs**: cPanel → Node.js Selector → View Log

---

## Troubleshooting

| Issue | Check |
|-------|-------|
| Passenger 503 | `server.js` exists, Node version, `tmp/restart.txt` touched |
| API health "degraded" | `MONGODB_URI`, Atlas IP whitelist, outbound connectivity |
| Dashboard offline | CORS mismatch, rebuild client if API URL changed |
| SSE bursts | `X-Accel-Buffering: no`, `no-transform`, disable gzip for stream |
| Build OOM | Keep `MAX_CONCURRENT_BUILDS=1`, 512MB cap |
| Subdomain fails | UAPI token permissions, existing subdomain |
| Webhook 401 | Re-register webhook, verify secret |
| Git pull fails | Deploy key, `GIT_TERMINAL_PROMPT=0` |

### Restart Commands
```bash
# API
touch ~/cship/server/tmp/restart.txt
curl -s https://api.yourdomain.com/api/health

# Dashboard
touch ~/cship/client/tmp/restart.txt
curl -I https://cship.yourdomain.com/
```

---

## Security Checklist

- [ ] `.env` files at mode `0600`
- [ ] Application roots outside `public_html`
- [ ] HTTPS enabled for both apps (AutoSSL)
- [ ] Strong `SESSION_SECRET` (32+ chars)
- [ ] Unique `TOKEN_ENCRYPTION_KEY` (64 hex chars)
- [ ] `CLIENT_ORIGIN` matches dashboard exactly
- [ ] Least-privilege Atlas user
- [ ] Least-privilege cPanel API token
- [ ] `ADMIN_GITHUB_LOGINS` restricted to known admins
- [ ] Build commands validated (no shell injection)

---

## Maintenance

### Regular Tasks
```bash
# Weekly
npm --prefix ~/cship/server run lint
npm --prefix ~/cship/client run lint

# Monthly
./scripts/test-restore.sh  # Verify backup integrity

# On updates
cd ~/cship && git pull
cd ~/cship/server && npm ci --omit=dev && touch tmp/restart.txt
cd ~/cship/client && npm ci && NEXT_PUBLIC_API_URL=... npm run build && touch tmp/restart.txt
```

### Log Locations
- **API**: cPanel → Node.js Selector → server app → View Log
- **Dashboard**: cPanel → Node.js Selector → client app → View Log
- **Builds**: Dashboard → Project → Deployments → Logs
- **MongoDB**: Atlas → Monitoring → Logs