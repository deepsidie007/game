CREATE TABLE IF NOT EXISTS bobole_guests (
 token text PRIMARY KEY,
 guest_id text UNIQUE NOT NULL,
 name text NOT NULL,
 room_code text,
 created_at timestamptz NOT NULL DEFAULT now()
);
