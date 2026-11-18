CREATE TABLE IF NOT EXISTS bobole_rooms (
 code text PRIMARY KEY,
 state jsonb NOT NULL,
 version integer NOT NULL DEFAULT 0,
 updated_at timestamptz NOT NULL DEFAULT now()
);
