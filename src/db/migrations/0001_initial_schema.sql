-- Migration: Initial schema
-- Create Subscribers and TeamSubscriptions tables

CREATE TABLE IF NOT EXISTS Subscribers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegramId INTEGER UNIQUE NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS TeamSubscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    subscriberId INTEGER NOT NULL,
    teamId INTEGER NOT NULL,
    teamName TEXT NOT NULL,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (subscriberId) REFERENCES Subscribers(id) ON DELETE CASCADE,
    UNIQUE (subscriberId, teamId)
);

