"""
stock_api.py — Three-Tier 股票資料抓取（Yahoo Finance 直接 API）

策略：
  Tier 1 (overview)  → v8 chart API  (不需 crumb，穩定)
  Tier 2 (detail)    → v7 quote + v10 quoteSummary  (需 crumb，失敗回 null)
  Tier 3 (history)   → v8 chart API  (不需 crumb，穩定)

Crumb 管理：
  - 每次 _get_crumb() 都清除舊 cookies 重取，確保 Session 乾淨
  - 若回傳值含 '{' 代表 JSON 錯誤，視為取得失敗
"""

import math
import time
import threading
import requests
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

# ── Endpoints ────────────────────────────────────────────────────────
_CHART_URL   = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
_QUOTE_URL   = "https://query1.finance.yahoo.com/v7/finance/quote"
_SUMMARY_URL = "https://query1.finance.yahoo.com/v10/finance/quoteSummary/{symbol}"
_CRUMB_URL   = "https://query2.finance.yahoo.com/v1/test/getcrumb"
_YAHOO_HOME  = "https://finance.yahoo.com/"

# ── Shared session ───────────────────────────────────────────────────
_session = requests.Session()
_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Referer": "https://finance.yahoo.com/",
}
_session.headers.update(_HEADERS)

# ── Crumb ────────────────────────────────────────────────────────────
_crumb: str | None = None
_crumb_lock = threading.Lock()


def _get_crumb(force: bool = False) -> str | None:
    """
    取得 Yahoo Finance crumb。
    每次重取都清除 session cookies（避免舊 cookie 污染）。
    若回傳值是 JSON（含 '{'）代表失敗，回傳 None。
    """
    global _crumb
    with _crumb_lock:
        if _crumb and not force:
            return _crumb
        try:
            _session.cookies.clear()  # 清除舊 cookies，重新取
            _session.get(_YAHOO_HOME, timeout=10)
            r = _session.get(_CRUMB_URL, timeout=10)
            text = r.text.strip()
            if r.status_code == 200 and "{" not in text and len(text) > 3:
                _crumb = text
            else:
                _crumb = None
        except Exception:
            _crumb = None
    return _crumb


# ── HTTP 工具 ────────────────────────────────────────────────────────

def _get_no_auth(url: str, params: dict = None, retries: int = 3) -> dict:
    """不需認證的 GET（chart API），帶 retry"""
    for attempt in range(retries):
        try:
            r = _session.get(url, params=params or {}, timeout=10)
            if r.status_code == 429:
                time.sleep(2 ** attempt)
                continue
            r.raise_for_status()
            return r.json()
        except requests.RequestException:
            if attempt < retries - 1:
                time.sleep(1)
    return {}


def _get_with_crumb(url: str, params: dict = None, retries: int = 2) -> dict:
    """需 crumb 認證的 GET，失敗回傳 {}"""
    crumb = _get_crumb()
    if not crumb:
        return {}
    p = {**(params or {}), "crumb": crumb}
    for attempt in range(retries):
        try:
            r = _session.get(url, params=p, timeout=10)
            if r.status_code == 401:
                # crumb 失效，強制重取一次
                new = _get_crumb(force=True)
                if new:
                    p["crumb"] = new
                continue
            if r.status_code == 429:
                time.sleep(2 ** attempt)
                continue
            if r.status_code != 200:
                return {}
            return r.json()
        except requests.RequestException:
            if attempt < retries - 1:
                time.sleep(1)
    return {}


# ── 工具函式 ────────────────────────────────────────────────────────

def normalize_symbol(symbol: str) -> str:
    """4 位數字 → 台股加 .TW（2330 → 2330.TW）"""
    s = symbol.strip().upper()
    return f"{s}.TW" if (s.isdigit() and len(s) == 4) else s


def _safe(val, default=None):
    if val is None:
        return default
    try:
        if math.isnan(float(val)):
            return default
    except (TypeError, ValueError):
        pass
    return val


def _fmt_mcap(val) -> str:
    v = _safe(val, 0) or 0
    if v >= 1e12: return f"{v / 1e12:.1f}T"
    if v >= 1e9:  return f"{v / 1e9:.0f}B"
    if v >= 1e6:  return f"{v / 1e6:.0f}M"
    return "N/A"


# ── Tier 1: Overview (chart API — 不需 crumb) ────────────────────────

def _fetch_overview_single(orig_sym: str) -> tuple[str, dict]:
    """
    用 v8 chart API 取 price + change%（不需 crumb，穩定）。
    改進：直接從歷史 close 數據計算前兩個交易日的漲跌幅，確保精確。
    """
    yf_sym  = normalize_symbol(orig_sym)
    default = {"price": 0, "change": 0, "mcap": "N/A"}

    data = _get_no_auth(
        _CHART_URL.format(symbol=yf_sym),
        params={"interval": "1d", "range": "5d", "includePrePost": "false"},
    )
    try:
        res = data["chart"]["result"][0]
        meta = res.get("meta", {})

        # 取最新成交價（當前或最後收盤價）
        price = _safe(meta.get("regularMarketPrice"), 0)

        # 從 close 數據倒序取最後兩個有效的收盤價
        closes = res.get("indicators", {}).get("quote", [{}])[0].get("close", [])
        closes_valid = [c for c in closes if c is not None]

        change_pct = 0
        if len(closes_valid) >= 2:
            # 最後一個 = 當天/最新收盤，倒數第二個 = 前一個交易日收盤
            current_close = closes_valid[-1]
            prev_close = closes_valid[-2]
            if prev_close:
                change_pct = ((current_close - prev_close) / prev_close) * 100
                price = current_close  # 用最後收盤價代替 regularMarketPrice
        elif closes_valid:
            # 如果只有 1 個價格點，使用 chartPreviousClose 作為備選
            prev = _safe(meta.get("chartPreviousClose"), 0)
            if prev and closes_valid:
                change_pct = ((closes_valid[0] - prev) / prev) * 100
                price = closes_valid[0]

        return orig_sym, {
            "price":  round(float(price), 2),
            "change": round(float(change_pct), 2),
            "mcap":   "N/A",  # 由 v7 quote 補充（若可用）
        }
    except (KeyError, IndexError, TypeError):
        return orig_sym, default


def get_overview(symbols: list[str]) -> dict:
    """並發取得所有股票概覽，最多 6 執行緒"""
    result: dict[str, dict] = {}

    # Tier 1a: 並發用 chart API 取 price/change
    with ThreadPoolExecutor(max_workers=6) as ex:
        futures = {ex.submit(_fetch_overview_single, s): s for s in symbols}
        for f in as_completed(futures):
            sym, data = f.result()
            result[sym] = data

    # Tier 1b: 嘗試用 v7 quote 補 mcap（批次單一呼叫，失敗不影響主流程）
    yf_symbols = [normalize_symbol(s) for s in symbols]
    sym_map    = {normalize_symbol(s): s for s in symbols}

    quote_data = _get_with_crumb(_QUOTE_URL, {"symbols": ",".join(yf_symbols)})
    try:
        for q in (quote_data.get("quoteResponse", {}).get("result") or []):
            orig = sym_map.get(q.get("symbol", ""), "")
            if orig and orig in result:
                result[orig]["mcap"] = _fmt_mcap(_safe(q.get("marketCap")))
    except (TypeError, KeyError):
        pass

    return result


# ── Tier 2 + 3: Detail ──────────────────────────────────────────────

def get_detail(symbol: str) -> dict:
    """
    取得單支股票詳細資料。

    回傳格式：
    {
        "pe":      float | null,
        "growth":  float | null,   # 百分比（12.3 = 12.3%）
        "mcap":    str,
        "history": [{"date": "YYYY-MM-DD", "close": float}, ...]
    }
    """
    yf_sym = normalize_symbol(symbol)
    detail: dict = {"pe": None, "growth": None, "mcap": "N/A", "history": []}

    # Tier 2a: v7 quote（PE + mcap），需 crumb
    quote = _get_with_crumb(_QUOTE_URL, {"symbols": yf_sym})
    try:
        q = (quote.get("quoteResponse", {}).get("result") or [{}])[0]
        pe_raw = _safe(q.get("forwardPE")) or _safe(q.get("trailingPE"))
        detail["pe"]   = round(float(pe_raw), 1) if pe_raw is not None else None
        detail["mcap"] = _fmt_mcap(_safe(q.get("marketCap")))
    except (KeyError, IndexError, TypeError):
        pass

    # Tier 2b: v10 quoteSummary（Revenue Growth），需 crumb
    summary = _get_with_crumb(
        _SUMMARY_URL.format(symbol=yf_sym),
        {"modules": "financialData"},
    )
    try:
        fin = (summary.get("quoteSummary", {}).get("result") or [{}])[0].get("financialData", {})
        g   = _safe(fin.get("revenueGrowth", {}).get("raw"))
        detail["growth"] = round(float(g) * 100, 1) if g is not None else None
        if detail["mcap"] == "N/A":
            detail["mcap"] = _fmt_mcap(_safe(fin.get("marketCap", {}).get("raw")))
    except (KeyError, IndexError, TypeError):
        pass

    # Tier 3: v8 chart（1 個月走勢），不需 crumb
    chart = _get_no_auth(
        _CHART_URL.format(symbol=yf_sym),
        {"interval": "1d", "range": "1mo", "includePrePost": "false"},
    )
    try:
        res     = chart["chart"]["result"][0]
        ts_list = res["timestamp"]
        closes  = res["indicators"]["quote"][0]["close"]
        detail["history"] = [
            {"date": datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d"),
             "close": round(float(c), 2)}
            for ts, c in zip(ts_list, closes)
            if c is not None
        ]
    except (KeyError, IndexError, TypeError):
        pass

    return detail
