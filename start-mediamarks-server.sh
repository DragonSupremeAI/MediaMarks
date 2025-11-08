#!/bin/bash

set -e

echo "🚀 Starting MediaMarks backend..."

# Check if MySQL is running; start it if not
if ! systemctl is-active --quiet mysql; then
  echo "🔧 MySQL service is not running. Starting it now..."
  sudo systemctl start mysql
fi

# Install Node dependencies only if node_modules is missing
if [ ! -d node_modules ]; then
  echo "📦 Installing server dependencies..."
  npm install
fi

# Export variables from .env if it exists
if [ -f .env ]; then
  echo "📂 Loading environment variables from .env"
  export $(grep -v '^#' .env | xargs)
fi

# Fallback defaults if variables aren’t set
: "${DB_HOST:=localhost}"
: "${DB_USER:=vizion}"
: "${DB_PASSWORD:=firebird}"
: "${DB_NAME:=mediamarks}"
: "${PORT:=3000}"

echo "🌐 Connecting to MySQL at ${DB_HOST} and launching server on port ${PORT}..."
node server.js
