#!/bin/bash

# This script installs Node.js and MySQL on Ubuntu-based systems, creates
# a MySQL database and user for MediaMarks, installs the backend
# dependencies, initialises the schema and starts the server.  Run this
# script from the root of the repository (the directory containing the
# `server` folder).  Adjust credentials or port as needed.

set -e

echo "🔧 Installing Node.js, npm and MySQL server..."
sudo apt update && sudo apt install -y mysql-server #nodejs npm mysql-server

echo "🚀 Starting MySQL service..."
sudo service mysql start

DB_NAME="mediamarks"
DB_USER="vizion"
DB_PASS="firebird"

echo "🔧 Creating MySQL database and user (if they don't already exist)..."
sudo mysql -e "CREATE DATABASE IF NOT EXISTS $DB_NAME; \n\
CREATE USER IF NOT EXISTS '$DB_USER'@'localhost' IDENTIFIED BY '$DB_PASS'; \n\
GRANT ALL PRIVILEGES ON $DB_NAME.* TO '$DB_USER'@'localhost'; \n\
FLUSH PRIVILEGES;"

echo "🔧 Installing backend dependencies in ./server..."
pushd server >/dev/null
npm install

echo "🔧 Importing database schema..."
mysql -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" < db.sql

echo "🚀 Starting MediaMarks backend server on port 3000..."
npm start &
popd >/dev/null

echo "✅ Backend setup complete.  The server is running in the background."
