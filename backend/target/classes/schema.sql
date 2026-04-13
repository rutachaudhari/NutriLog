CREATE TABLE IF NOT EXISTS profiles (
    id                          INTEGER PRIMARY KEY AUTOINCREMENT,
    name                        TEXT NOT NULL,
    created_at                  DATETIME DEFAULT CURRENT_TIMESTAMP,
    age                         INTEGER,
    gender                      TEXT,
    height_cm                   REAL,
    current_weight_kg           REAL,
    target_weight_kg            REAL,
    activity_level              TEXT,
    weekly_rate_kg              REAL,
    recommended_daily_calories  REAL
);

CREATE TABLE IF NOT EXISTS meals (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id   INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    logged_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    description  TEXT NOT NULL,
    calories     REAL DEFAULT 0,
    protein_g    REAL DEFAULT 0,
    fat_g        REAL DEFAULT 0,
    fiber_g      REAL DEFAULT 0,
    items_json   TEXT
);

CREATE INDEX IF NOT EXISTS idx_meals_profile_id ON meals(profile_id);
CREATE INDEX IF NOT EXISTS idx_meals_logged_at ON meals(logged_at);
