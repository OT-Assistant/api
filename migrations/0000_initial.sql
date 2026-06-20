-- Initial MVP Schema

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  clerk_user_id TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL DEFAULT 'client', -- 'therapist', 'client', 'admin'
  name TEXT,
  email TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  therapist_user_id TEXT NOT NULL,
  client_user_id TEXT, -- Can be null initially until user signs up
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'invited', -- 'invited', 'active', 'inactive'
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS intakes (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  goals_json TEXT NOT NULL,
  daily_challenges TEXT,
  age_range TEXT,
  available_equipment TEXT,
  session_length_minutes INTEGER,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'ai', -- 'ai', 'manual'
  title TEXT NOT NULL,
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- 'draft', 'active', 'archived'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS plan_activities (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  title TEXT NOT NULL,
  instructions TEXT NOT NULL,
  frequency TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS activity_completions (
  id TEXT PRIMARY KEY,
  activity_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  effort TEXT,
  note TEXT
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  sender_user_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  read_at DATETIME
);

CREATE TABLE IF NOT EXISTS ai_generation_logs (
  id TEXT PRIMARY KEY,
  plan_id TEXT,
  client_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  request_json TEXT NOT NULL,
  response_json TEXT,
  status TEXT NOT NULL, -- 'success', 'error'
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
