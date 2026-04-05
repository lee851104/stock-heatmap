import os
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from flask_caching import Cache
from stock_api import get_overview, get_detail

STATIC_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")

app = Flask(__name__, static_folder=STATIC_DIR, static_url_path="")
CORS(app)

# SimpleCache = 記憶體快取，不需要 Redis，單機部署直接用
cache = Cache(app, config={
    "CACHE_TYPE": "SimpleCache",
    "CACHE_DEFAULT_TIMEOUT": 300,
})


# ── API: Tier 1 — 熱力圖概覽 ────────────────────────────────────────

@app.get("/api/stocks/overview")
def stocks_overview():
    """
    批次取得熱力圖所需資料：price, change%, mcap
    快取 5 分鐘。

    Query: ?symbols=NVDA,AMD,2330
    回傳:
    {
      "NVDA": {"price": 120.5, "change": 1.23, "mcap": "2.9T"},
      ...
    }
    """
    raw = request.args.get("symbols", "")
    symbols = [s.strip().upper() for s in raw.split(",") if s.strip()]
    if not symbols:
        return jsonify({"error": "symbols parameter required"}), 400

    cache_key = f"overview:{','.join(sorted(symbols))}"
    cached = cache.get(cache_key)
    if cached is not None:
        return jsonify(cached)

    data = get_overview(symbols)
    cache.set(cache_key, data, timeout=300)   # 5 分鐘
    return jsonify(data)


# ── API: Tier 2+3 — 股票詳情 ────────────────────────────────────────

@app.get("/api/stocks/detail/<symbol>")
def stocks_detail(symbol: str):
    """
    取得單一股票詳細資料：P/E、Revenue Growth、1 個月走勢。
    快取 12 小時（基本面不需頻繁更新）。

    回傳:
    {
      "pe": 45.2,
      "growth": 12.3,
      "mcap": "2.9T",
      "history": [{"date": "2025-03-01", "close": 118.5}, ...]
    }
    """
    sym = symbol.strip().upper()

    cache_key = f"detail:{sym}"
    cached = cache.get(cache_key)
    if cached is not None:
        return jsonify(cached)

    data = get_detail(sym)
    cache.set(cache_key, data, timeout=43200)  # 12 小時
    return jsonify(data)


# ── Serve React SPA ─────────────────────────────────────────────────

@app.get("/")
@app.get("/<path:path>")
def serve_react(path=""):
    dist = app.static_folder
    if dist and os.path.exists(dist):
        target = os.path.join(dist, path)
        if path and os.path.isfile(target):
            return send_from_directory(dist, path)
        return send_from_directory(dist, "index.html")
    return "Frontend not built. Run: cd frontend && npm run build", 404


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug_mode = os.environ.get("FLASK_ENV") == "development"
    app.run(host="0.0.0.0", port=port, debug=debug_mode)
