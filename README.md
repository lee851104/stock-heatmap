# Stock Heatmap (股票熱力圖)

A real-time stock market visualization tool that displays stock performance using an interactive heatmap. Built with React + Flask + yfinance.

## Features

- 📊 **Interactive Heatmap** - Visual representation of stock price changes (green = up, red = down)
- 💰 **Real-time Data** - Powered by Yahoo Finance (no API key required)
- 📈 **Stock Details** - Click any stock to view P/E ratio, revenue growth, and price history
- ⚡ **Fast Loading** - Two-stage data loading with caching
- 🎨 **Modern UI** - Built with React, Tailwind CSS, and Lucide icons
- 🚀 **Easy Deployment** - One-click deploy to Render.com

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite + Tailwind CSS v4 + Lucide React |
| Backend | Python Flask + yfinance + Flask-CORS + Flask-Caching |
| Data | Yahoo Finance API (via yfinance) |
| Deployment | Render.com (free tier) |

## Quick Start

### Prerequisites
- Node.js 16+ and npm
- Python 3.8+
- git

### Local Development

**Terminal 1 - Backend:**
```bash
cd backend
pip install -r requirements.txt
python app.py
# → http://localhost:5000
```

**Terminal 2 - Frontend (new terminal):**
```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

The frontend automatically proxies `/api` requests to the Flask backend.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/stocks/overview?symbols=NVDA,AMD` | Quick overview: price, change%, market cap |
| GET | `/api/stocks/detail/<symbol>` | Detailed data: P/E, revenue growth, 1-month history |
| GET | `/*` | Serve React SPA |

### Example Request
```bash
curl "http://localhost:5000/api/stocks/overview?symbols=NVDA,AMD,TSLA"
```

## Deployment to Render.com

1. Push project to GitHub:
   ```bash
   git add .
   git commit -m "Initial commit"
   git push origin main
   ```

2. Go to [render.com](https://render.com) → New Web Service

3. Connect your GitHub repository

4. Configure:
   - **Build Command:** `pip install -r backend/requirements.txt && cd frontend && npm install && npm run build`
   - **Start Command:** `cd backend && python app.py`

5. Deploy! Your app will be live with a public URL.

## Data Source Notes

- **Free & No API Key Required** - Uses Yahoo Finance public data via yfinance
- **Two-Stage Loading** - `fast_info` (seconds) shows prices first, `info` (1s per stock) supplements P/E and growth in background
- **Data Latency** - Approximately 15 minutes behind real-time (Yahoo Finance standard)

## Project Structure

```
heatmap_1/
├── backend/
│   ├── app.py              # Flask API + React SPA server
│   ├── stock_api.py        # yfinance wrapper (two-stage loading)
│   └── requirements.txt     # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── App.jsx         # Main heatmap component
│   │   ├── App.css         # Styles
│   │   └── main.jsx        # React entry point
│   ├── index.html          # HTML template
│   ├── vite.config.js      # Vite config (API proxy)
│   └── package.json        # Node dependencies
├── PLAN.md                 # Detailed project plan
├── README.md               # This file
├── LICENSE                 # MIT License
└── .gitignore             # Git ignore rules
```

## Development Roadmap

- [x] Core heatmap visualization
- [x] Stock detail modal with history chart
- [x] Manual refresh button
- [x] Fallback data on API errors
- [ ] Custom stock groups (add/remove/edit)
- [ ] JSON configuration export/import
- [ ] Auto-refresh timer
- [ ] Drag-to-reorder stocks (future)
- [ ] WebSocket real-time updates (future)

## Environment Variables

No environment variables required for basic operation. Optional:

- `PORT` - Server port (default: 5000)
- `FLASK_DEBUG` - Set to `0` in production

## Troubleshooting

**"Frontend not built" error:**
```bash
cd frontend && npm run build
```

**API request fails:**
- Check backend is running on `http://localhost:5000`
- Check internet connection (yfinance needs it)
- Try with different stock symbols (some may not exist)

**Stock data not updating:**
- Restart backend to clear cache: `python app.py`
- Wait 5 minutes (default cache TTL)

## License

MIT License - see [LICENSE](LICENSE) file for details

## Contributing

Contributions welcome! Feel free to fork, open issues, or submit pull requests.

## Support

For questions or issues, please open an issue on GitHub.

---

**Built with ❤️ for stock market enthusiasts**
