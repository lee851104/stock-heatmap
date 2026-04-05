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

    Crumb 是 CSRF 防護 token，部分 Yahoo Finance API 需要它。
    若無法取得，後續 crumb 認證的 API 會失敗，但其他 API 仍可用。
    """
    global _crumb
    with _crumb_lock:
        if _crumb and not force:
            return _crumb
        try:
            # 清除舊 session，確保乾淨狀態
            _session.cookies.clear()
            # 先訪問首頁，建立新 session
            _session.get(_YAHOO_HOME, timeout=10)
            # 再請求 crumb（會自動附加 cookie）
            r = _session.get(_CRUMB_URL, timeout=10)
            text = r.text.strip()
            # 判斷成功：status 200 + 非 JSON 格式 + 長度足夠
            if r.status_code == 200 and "{" not in text and len(text) > 3:
                _crumb = text
                return _crumb
            else:
                _crumb = None
                return None
        except Exception as e:
            _crumb = None
            return None


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
    優先使用 meta.regularMarketChangePercent（Yahoo Finance 官方今日漲跌幅）。
    備選：用 regularMarketPrice vs chartPreviousClose 計算。
    range 用 "1d" 確保 chartPreviousClose = 前一個交易日收盤（正確的前收盤）。
    range="2d" 時 chartPreviousClose 是兩天範圍前的收盤（即前兩天），會導致漲跌幅偏大。
    """
    yf_sym  = normalize_symbol(orig_sym)
    default = {"price": 0, "change": 0, "mcap": "N/A"}

    data = _get_no_auth(
        _CHART_URL.format(symbol=yf_sym),
        params={"interval": "1d", "range": "1d", "includePrePost": "false"},
    )
    try:
        meta  = data["chart"]["result"][0]["meta"]
        price = _safe(meta.get("regularMarketPrice"), 0)

        # 優先：直接取 Yahoo Finance 計算好的今日漲跌幅（最準確）
        change_pct = _safe(meta.get("regularMarketChangePercent"), None)

        if change_pct is None:
            # 備選：用前收盤手動計算（range="2d" 時 chartPreviousClose = 昨天收盤）
            prev = _safe(meta.get("chartPreviousClose"), 0)
            change_pct = ((price - prev) / prev * 100) if prev else 0

        return orig_sym, {
            "price":  round(float(price), 2),
            "change": round(float(change_pct), 2),
            "mcap":   "N/A",  # 由 Tier 1b v7 quote 補充
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

    # Tier 1b: 嘗試用 v7 quote 補 mcap + 精確 price/change（批次單一呼叫）
    # crumb 若失敗，Tier 1a 的 chart API 數據仍會保留作為備選
    yf_symbols = [normalize_symbol(s) for s in symbols]
    sym_map    = {normalize_symbol(s): s for s in symbols}

    quote_data = _get_with_crumb(_QUOTE_URL, {"symbols": ",".join(yf_symbols)})
    try:
        for q in (quote_data.get("quoteResponse", {}).get("result") or []):
            orig = sym_map.get(q.get("symbol", ""), "")
            if orig and orig in result:
                # mcap
                result[orig]["mcap"] = _fmt_mcap(_safe(q.get("marketCap")))
                # 若 crumb 成功，用 v7 quote 的精確數值覆蓋 chart API 的數值
                q_price  = _safe(q.get("regularMarketPrice"))
                q_change = _safe(q.get("regularMarketChangePercent"))
                if q_price  is not None:
                    result[orig]["price"]  = round(float(q_price), 2)
                if q_change is not None:
                    result[orig]["change"] = round(float(q_change), 2)
                # PE: v7 quote 的 forwardPE（不在 overview 返回，但用於 detail 備選）
                # 這裡不補充，因為 overview 不應返回 PE（過重），detail 會單獨拉
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

    # Tier 2a: v7 quote（mcap + Forward P/E），需 crumb
    quote = _get_with_crumb(_QUOTE_URL, {"symbols": yf_sym})
    try:
        q = (quote.get("quoteResponse", {}).get("result") or [{}])[0]
        detail["mcap"] = _fmt_mcap(_safe(q.get("marketCap")))
        # Forward P/E：v7 quote 通常包含 forwardPE（較穩定）
        pe_raw = _safe(q.get("forwardPE")) or _safe(q.get("trailingPE"))
        if pe_raw is not None:
            detail["pe"] = round(float(pe_raw), 2)
    except (KeyError, IndexError, TypeError):
        pass

    # Tier 2b: v10 quoteSummary（Revenue Growth），需 crumb
    summary = _get_with_crumb(
        _SUMMARY_URL.format(symbol=yf_sym),
        {"modules": "financialData"},
    )
    try:
        res_list = (summary.get("quoteSummary", {}).get("result") or [{}])
        res0 = res_list[0] if res_list else {}
        fin = res0.get("financialData", {})

        # Revenue Growth
        g = _safe(fin.get("revenueGrowth", {}).get("raw"))
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
