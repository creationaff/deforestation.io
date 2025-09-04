#!/bin/bash

# deforestation.io Launch Script
echo "🌲 Starting deforestation.io - Global Deforestation Monitor"
echo "=================================================="

# Check if Python is available
if command -v python3 &> /dev/null; then
    echo "✅ Python 3 found"
    echo "🚀 Starting server on http://localhost:8000"
    echo "📱 Open your browser to view the application"
    echo ""
    python3 -m http.server 8000
elif command -v python &> /dev/null; then
    echo "✅ Python found"
    echo "🚀 Starting server on http://localhost:8000"
    echo "📱 Open your browser to view the application"
    echo ""
    python -m http.server 8000
else
    echo "❌ Python not found. Please install Python to run the server."
    echo "Alternative: Use any static file server to serve the files."
fi
