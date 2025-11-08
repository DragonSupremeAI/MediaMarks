-- SQL schema for the MediaMarks backend

-- Create the bookmarks table if it does not already exist.  Use a primary key
-- on id so duplicates can be upserted via ON DUPLICATE KEY UPDATE.
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