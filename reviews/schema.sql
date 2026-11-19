-- INNÉ reviews database (Cloudflare D1)
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  offer TEXT NOT NULL CHECK (offer IN ('guide','program','private')),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body TEXT NOT NULL,
  lang TEXT NOT NULL DEFAULT 'en',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','published','rejected')),
  reply TEXT,
  reply_at TEXT,
  code TEXT,
  created_at TEXT NOT NULL,
  published_at TEXT
);
CREATE INDEX IF NOT EXISTS reviews_status ON reviews(status, published_at);
CREATE TABLE IF NOT EXISTS codes (
  code TEXT PRIMARY KEY,
  label TEXT,
  created_at TEXT NOT NULL,
  used_at TEXT,
  review_id INTEGER
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS attempts (
  ip TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  first_at INTEGER NOT NULL
);
