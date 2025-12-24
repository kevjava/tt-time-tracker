-- TT Time Tracker Database Schema

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  start_time DATETIME NOT NULL,
  end_time DATETIME,
  description TEXT NOT NULL,
  project TEXT,
  estimate_minutes INTEGER,
  explicit_duration_minutes INTEGER,
  remark TEXT,
  state TEXT NOT NULL DEFAULT 'working',
  parent_session_id INTEGER,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (parent_session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  CHECK (state IN ('working', 'paused', 'completed', 'abandoned')),
  CHECK (end_time IS NULL OR end_time > start_time)
);

CREATE TABLE IF NOT EXISTS session_tags (
  session_id INTEGER NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY (session_id, tag),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sessions_start_time ON sessions(start_time);
CREATE INDEX IF NOT EXISTS idx_sessions_end_time ON sessions(end_time);
CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project);
CREATE INDEX IF NOT EXISTS idx_sessions_state ON sessions(state);
CREATE INDEX IF NOT EXISTS idx_sessions_parent ON sessions(parent_session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_time_range ON sessions(start_time, end_time, project);
CREATE INDEX IF NOT EXISTS idx_session_tags_tag ON session_tags(tag);
