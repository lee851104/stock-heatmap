#!/bin/bash
set -e

echo "🔨 Building Stock Heatmap..."

# Backend dependencies
echo "📦 Installing backend dependencies..."
cd backend
pip install -r requirements.txt
cd ..

# Frontend build
echo "🎨 Building frontend..."
cd frontend
npm install
npm run build
cd ..

echo "✅ Build complete!"
echo "🚀 To start the server, run: cd backend && python app.py"
