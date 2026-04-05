#!/bin/bash
# 整合建置腳本：先 build React，再啟動 Flask

set -e

echo "=== [1/2] Building React frontend ==="
cd frontend
npm install
npm run build
cd ..

echo "=== [2/2] Starting Flask server ==="
cd backend
pip install -r requirements.txt
python app.py
