-- Migration: Add timezone support
-- Add timezone column to Subscribers table with default UTC

ALTER TABLE Subscribers ADD COLUMN timezone TEXT DEFAULT 'UTC';

