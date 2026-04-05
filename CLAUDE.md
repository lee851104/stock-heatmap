# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Stock Heatmap** is a full-stack web application that visualizes stock market performance using an interactive heatmap. The frontend shows stocks organized by sector with visual indicators (green = up, red = down), and clicking any stock opens a detail modal with P/E ratio, revenue growth, and 1-month price history.

**Tech Stack:**
- Frontend: React 19 + Vite + Tailwind CSS v4 + Lucide React icons
- Backend: Python Flask + yfinance API
- Data Source: Yahoo Finance (via HTTP API calls, no SDK)
- Deployment: Render.com with Gunicorn + render.yaml

---

## Architecture

### Backend (Flask + stock_api.py)

The backend uses a **three-tier data fetching strategy** to balance speed and completeness:

#### Tier 1: Overview (Fast)
- Uses Yahoo Finance **v8 chart API** (no authentication needed, stable)
- Returns: current price, daily % change, market cap
- Called immediately on page load via `/api/stocks/overview?symbols=NVDA,AMD,...`
- Cached for 5 minutes

#### Tier 2 + 3: Detail (Deferred)
- **Tier 2**: v7 quote API (requires crumb auth) → P/E ratio
- **Tier 2b**: v10 quoteSummary API (requires crumb auth) → Revenue Growth
- **Tier 3**: v8 chart API → 1-month price history
- Called on demand when user clicks a stock via `/api/stocks/detail/<symbol>`
- Cached for 12 hours
- Failures gracefully degrade to null values (modal shows "N/A" or fallback values)

#### Key Implementation Details

**Crumb Management** (`stock_api.py`, lines 44-69):
- Yahoo Finance v10 API requires a "crumb" token from a CSRF endpoint
- Each `_get_crumb()` call clears session cookies and re-fetches to ensure clean state
- If crumb fetch returns JSON (detectable by `{` in response), it failed
- Crumb is cached but force-refreshed on 401 errors

**Concurrency**:
- Overview fetches use `ThreadPoolExecutor(max_workers=6)` to parallelize symbol requests
- Detail fetches are serial per-symbol (called on demand)
- Retry logic: 3 attempts for no-auth calls (chart), 2 for auth calls (quote)
- Rate-limit backoff: exponential delay (2^attempt seconds) on 429 errors

**Symbol Normalization** (`stock_api.py`, line 119-122):
- 4-digit numbers (e.g., "2330") are automatically converted to Taiwan stock format (e.g., "2330.TW")
- All symbols normalized to uppercase

### Frontend (React + Vite)

**App.jsx** is a single-file component with two main sections:

1. **Stock Cards Heatmap** (Lines 85-120):
   - Dynamically sized boxes: `flex: weight 1 0%` where weight is based on |change|^1.1
   - Colors: green (#00FF8C) for gains, red (#FF2850) for losses
   - Icon size scales with absolute change (min 16px, max 64px)
   - Click opens detail modal

2. **Detail Modal** (Lines 120+):
   - Shows: current price, % change, P/E, Revenue Growth, Market Cap
   - Renders a 30-day price history chart (via Canvas/SVG, TODO: confirm)
   - Calls `/api/stocks/detail/<symbol>` independently to fetch modal-specific data

**Stock Categories** (Lines 4-25):
- Hard-coded in CATEGORIES object: Semiconductors, Cloud Services, Fiber Optics, Healthcare
- Each category has a Lucide icon and symbol list
- ALL_SYMBOLS is flattened from all categories

**Fallback Data** (Lines 27-39):
- Pre-defined values for all ~12 stocks in CATEGORIES
- Used if API calls fail or during initial load
- Generated history for modal fallback via `generateFallbackHistory()` (Lines 74-83)

---

## Development

### Prerequisites
- Node.js 16+ (frontend build)
- Python 3.8+ (backend)
- pip (Python package manager)

### Backend Setup

```bash
cd backend
pip install -r requirements.txt
python app.py
# → Runs on http://localhost:5000 with Flask development server (debug=True locally)
```

**Environment Variables** (optional):
- `FLASK_ENV`: Set to `"development"` to enable Flask debug mode. In production (Render), leave unset.
- `PORT`: Server port (default: 5000)

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
# → Runs on http://localhost:5173 with Vite dev server
```

Vite is configured to proxy `/api/*` requests to `http://localhost:5000` (see vite.config.js).

### Build & Deploy

**Local Build** (simulate production):
```bash
# Backend (already installed)
cd backend && python app.py

# Frontend (build static files)
cd frontend && npm run build
# → Outputs to frontend/dist/
```

**To Render.com**:
- Push to GitHub: `git push origin main`
- Render automatically reads `render.yaml` and:
  - Installs Python deps from `backend/requirements.txt`
  - Builds frontend via `cd frontend && npm install && npm run build`
  - Starts backend via `gunicorn --workers 2 --bind 0.0.0.0:$PORT app:app` (from backend/)
  - Serves built React files via Flask static handler

---

## Common Tasks

### Add a New Stock Category

1. Add to `CATEGORIES` in `frontend/src/App.jsx`:
   ```javascript
   "NEW_SECTOR": {
     label: "Display Name",
     symbols: ["TICK1", "TICK2"],
     icon: <SomeIcon size={14} />
   }
   ```
2. Add fallback data for each new symbol to `FALLBACK_DATA` in same file
3. Redeploy frontend

### Add Non-US Stock Symbol

For 4-digit Taiwan stock codes:
- Frontend: Just use the 4-digit code (e.g., "2330")
- Backend: `normalize_symbol()` auto-converts to "2330.TW" before calling Yahoo Finance
- Fallback: Manually add data for the 4-digit code in `FALLBACK_DATA`

### Test API Endpoints Locally

```bash
# Overview (fast, no detail)
curl "http://localhost:5000/api/stocks/overview?symbols=NVDA,AMD"

# Detail (slow, includes P/E and history)
curl "http://localhost:5000/api/stocks/detail/NVDA"
```

### Clear Cache

Flask-Caching uses in-memory SimpleCache. To reset:
1. Restart the backend: `python app.py`
2. Cache expires automatically: 5 min for overview, 12 hours for detail

### Troubleshoot API Failures

**Common issues:**
- **"Could not open requirements file"**: Render couldn't read `backend/requirements.txt`. Check file path in render.yaml build command.
- **"gunicorn: command not found"**: `gunicorn==23.0.0` not installed. Rebuild will fix on next deploy.
- **"No such file or directory: 'requirements.txt'"**: render.yaml startCommand or buildCommand has wrong path. Use `backend/requirements.txt`, not just `requirements.txt`.
- **Crumb auth fails**: Yahoo Finance session rotated. `stock_api.py` auto-retries with force-refresh. If persistent, may need to check User-Agent in `_HEADERS`.

---

## Important Notes

- **Data Latency**: Yahoo Finance has ~15 minute delay. Not real-time.
- **Free Tier**: Render spins down after 15 min inactivity. First request takes ~50s (cold start). Upgrade to Starter ($7/mo) for 24/7 uptime.
- **yfinance vs SDK**: Using raw HTTP API calls (not the yfinance Python package) for more control over retry logic and crumb handling.
- **Production Mode**: Flask debug is disabled in production (checked via `FLASK_ENV` env var). Gunicorn handles multi-worker requests.

