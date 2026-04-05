# 股票熱力圖專案規劃

## 技術棧

| 層級 | 技術 |
|------|------|
| 後端 | Python Flask + yfinance |
| 前端 | React + Tailwind CSS v4 + Lucide React |
| 建置 | Vite |
| 資料來源 | Yahoo Finance（via yfinance，免費、無需 API key） |
| 部署 | Render.com（免費方案） |

---

## 專案結構

```
heatmap_1/
├── backend/
│   ├── app.py              # Flask API + serve React 靜態建置
│   ├── stock_api.py        # yfinance 封裝（兩階段載入）
│   └── requirements.txt    # flask, yfinance, flask-cors
├── frontend/
│   ├── src/
│   │   ├── App.jsx         # 主元件（熱力圖 UI）
│   │   └── index.css       # Tailwind v4 入口
│   ├── vite.config.js      # dev proxy /api → localhost:5000
│   └── package.json
├── build.sh                # 一鍵建置 + 啟動腳本
└── render.yaml             # Render.com 部署設定
```

---

## 後端 API 端點

| 方法 | 端點 | 說明 |
|------|------|------|
| GET | `/api/stocks?symbols=NVDA,AMD` | 快速行情：price, change%, mcap |
| GET | `/api/stocks/detail?symbols=NVDA,AMD` | 詳細資料：pe, growth（較慢） |
| GET | `/<any>` | Serve React SPA 靜態頁面 |

### yfinance 說明
- **免費，無需 API key**，抓取 Yahoo Finance 公開資料
- **兩階段載入**：`fast_info`（秒級）先顯示價格，`info`（約 1 秒/支）背景補充 P/E 和 Revenue Growth
- **延遲**：非即時，約 15 分鐘延遲（Yahoo Finance 標準）

---

## 本機開發

**終端 1（後端）：**
```bash
cd backend
pip install -r requirements.txt
python app.py
# → http://localhost:5000
```

**終端 2（前端）：**
```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173（自動 proxy /api 到 Flask）
```

---

## 雲端部署（Render.com）

1. 將整個專案 push 到 GitHub
2. [render.com](https://render.com) → New Web Service → 選 repo
3. 自動讀取 `render.yaml`，建置指令：
   - Build: `pip install -r backend/requirements.txt && cd frontend && npm install && npm run build`
   - Start: `cd backend && python app.py`
4. 部署後取得公開 URL

---

## 核心功能

- [x] 熱力圖：方塊大小/顏色反映漲跌幅（綠漲紅跌）
- [x] 點擊股票卡片 → 詳情 Modal（價格、漲跌、P/E、Revenue Growth、走勢圖）
- [x] 手動刷新按鈕
- [x] Fallback 資料（API 失敗時顯示預設值）
- [ ] 自定義群組（新增/刪除股票、編輯群組名稱）
- [ ] 導出/匯入 JSON 配置
- [ ] 自動定時刷新

---

## 可選功能（Phase 5）

- 支援拖曳排序股票
- WebSocket 即時更新
- 多視圖配置切換
