-- Migration: Track sent notifications in D1
-- The primary key makes "has this been sent?" + "mark it sent" one atomic
-- statement, which KV (check, then write) cannot offer: two overlapping cron
-- runs can no longer both decide a notification is still unsent.

CREATE TABLE IF NOT EXISTS SentNotifications (
    key TEXT PRIMARY KEY,
    value TEXT,
    expiresAt INTEGER NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);
