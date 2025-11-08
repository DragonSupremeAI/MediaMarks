#!/usr/bin/env node
/*
 * Simple Express server providing a REST API for MediaMarks bookmarks.
 *
 * The service uses a MySQL database to persist bookmarks and exposes
 * endpoints for clients to create, read, update and delete items.  It
 * also supports importing/exporting a full set of bookmarks for backup
 * and synchronisation across devices.
 *
 * Configuration:  Database connection details are read from environment
 * variables: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME.  You can create
 * these variables in a .env file during development or set them in
 * your deployment environment.
 */

const express = require('express');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

// Load environment variables from a .env file if present
dotenv.config();

const app = express();
app.use(express.json());

// Create a MySQL connection pool.  Using a pool allows the server to
// handle concurrent requests efficiently by reusing database connections.
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'vizion',
  password: process.env.DB_PASSWORD || 'firebird',
  database: process.env.DB_NAME || 'mediamarks',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Initialise database schema if necessary.  This function runs when the
// server starts and ensures the bookmarks table exists.  If the table
// already exists, the CREATE TABLE IF NOT EXISTS statement will have
// no effect.
async function initDb() {
  const createSql = `
    CREATE TABLE IF NOT EXISTS bookmarks (
      id VARCHAR(255) PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL,
      url TEXT NOT NULL,
      img TEXT NOT NULL,
      title TEXT,
      tags TEXT,
      source_page_url TEXT,
      created_at BIGINT NOT NULL,
      updated_at BIGINT
    );
  `;
  const conn = await pool.getConnection();
  try {
    await conn.query(createSql);
  } finally {
    conn.release();
  }
}

// Helper to convert comma separated tags into a canonical string
function normaliseTags(tags) {
  if (!Array.isArray(tags)) return tags ? String(tags) : '';
  return tags
    .map(t => t.trim())
    .filter(Boolean)
    .join(',');
}

// GET /bookmarks?user_id=...  – fetch all bookmarks for a given user.
app.get('/bookmarks', async (req, res) => {
  const userId = req.query.user_id;
  if (!userId) {
    return res.status(400).json({ error: 'user_id query parameter is required' });
  }
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query('SELECT * FROM bookmarks WHERE user_id = ?', [userId]);
    // Convert comma separated tag string back into arrays on the fly
    const items = rows.map(row => ({
      id: row.id,
      user_id: row.user_id,
      url: row.url,
      img: row.img,
      title: row.title,
      tags: row.tags ? row.tags.split(',').filter(Boolean) : [],
      sourcePageUrl: row.source_page_url,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
    res.json({ items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error fetching bookmarks' });
  } finally {
    conn.release();
  }
});

// POST /bookmarks  – create a new bookmark.
app.post('/bookmarks', async (req, res) => {
  const item = req.body;
  if (!item || !item.user_id || !item.id) {
    return res.status(400).json({ error: 'user_id and id are required in request body' });
  }
  const conn = await pool.getConnection();
  try {
    const tags = normaliseTags(item.tags);
    const sql = `INSERT INTO bookmarks (id, user_id, url, img, title, tags, source_page_url, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE url = VALUES(url), img = VALUES(img), title = VALUES(title), tags = VALUES(tags), source_page_url = VALUES(source_page_url), updated_at = VALUES(updated_at)`;
    await conn.execute(sql, [
      item.id,
      item.user_id,
      item.url,
      item.img,
      item.title || null,
      tags || null,
      item.sourcePageUrl || null,
      item.createdAt || Date.now(),
      Date.now()
    ]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error creating bookmark' });
  } finally {
    conn.release();
  }
});

// PUT /bookmarks/:id  – update an existing bookmark.  The request body may
// contain only the fields to be updated.  The user_id query parameter
// ensures the user owns the item.
app.put('/bookmarks/:id', async (req, res) => {
  const id = req.params.id;
  const userId = req.query.user_id;
  if (!userId) {
    return res.status(400).json({ error: 'user_id query parameter is required' });
  }
  const fields = req.body || {};
  const conn = await pool.getConnection();
  try {
    // Build dynamic SET clause
    const updates = [];
    const values = [];
    if (fields.url) {
      updates.push('url = ?');
      values.push(fields.url);
    }
    if (fields.img) {
      updates.push('img = ?');
      values.push(fields.img);
    }
    if (fields.title) {
      updates.push('title = ?');
      values.push(fields.title);
    }
    if (fields.tags) {
      updates.push('tags = ?');
      values.push(normaliseTags(fields.tags));
    }
    if (fields.sourcePageUrl) {
      updates.push('source_page_url = ?');
      values.push(fields.sourcePageUrl);
    }
    // Always update updated_at
    updates.push('updated_at = ?');
    values.push(Date.now());
    if (!updates.length) {
      return res.status(400).json({ error: 'No fields provided for update' });
    }
    values.push(id, userId);
    const sql = `UPDATE bookmarks SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`;
    const [result] = await conn.execute(sql, values);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Bookmark not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error updating bookmark' });
  } finally {
    conn.release();
  }
});

// DELETE /bookmarks/:id?user_id=...  – delete a bookmark.  The user_id ensures
// that only the owner can delete the item.
app.delete('/bookmarks/:id', async (req, res) => {
  const id = req.params.id;
  const userId = req.query.user_id;
  if (!userId) {
    return res.status(400).json({ error: 'user_id query parameter is required' });
  }
  const conn = await pool.getConnection();
  try {
    const [result] = await conn.execute('DELETE FROM bookmarks WHERE id = ? AND user_id = ?', [id, userId]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Bookmark not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error deleting bookmark' });
  } finally {
    conn.release();
  }
});

// GET /bookmarks/export?user_id=...  – export all bookmarks as JSON.  This
// endpoint simply wraps the GET /bookmarks route for convenience.
app.get('/bookmarks/export', async (req, res) => {
  const userId = req.query.user_id;
  if (!userId) {
    return res.status(400).json({ error: 'user_id query parameter is required' });
  }
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query('SELECT * FROM bookmarks WHERE user_id = ?', [userId]);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="bookmarks-${userId}.json"`);
    res.end(JSON.stringify(rows, null, 2));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error exporting bookmarks' });
  } finally {
    conn.release();
  }
});

// POST /bookmarks/import  – import bookmarks from a JSON array.  The request
// body should contain { user_id: string, items: Array }.  Each item is
// inserted or updated in the database.
app.post('/bookmarks/import', async (req, res) => {
  const { user_id: userId, items } = req.body;
  if (!userId || !Array.isArray(items)) {
    return res.status(400).json({ error: 'user_id and items array are required' });
  }
  const conn = await pool.getConnection();
  try {
    const sql = `INSERT INTO bookmarks (id, user_id, url, img, title, tags, source_page_url, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE url = VALUES(url), img = VALUES(img), title = VALUES(title), tags = VALUES(tags), source_page_url = VALUES(source_page_url), updated_at = VALUES(updated_at)`;
    const tasks = items.map(item => conn.execute(sql, [
      item.id,
      userId,
      item.url,
      item.img,
      item.title || null,
      normaliseTags(item.tags) || null,
      item.sourcePageUrl || null,
      item.createdAt || Date.now(),
      Date.now()
    ]));
    await Promise.all(tasks);
    res.json({ success: true, imported: items.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error importing bookmarks' });
  } finally {
    conn.release();
  }
});

// Start the server after ensuring the database schema exists.
const port = process.env.PORT || 3000;
initDb().then(() => {
  app.listen(port, () => {
    console.log(`MediaMarks backend listening on port ${port}`);
  });
}).catch(err => {
  console.error('Failed to initialise database:', err);
  process.exit(1);
});
