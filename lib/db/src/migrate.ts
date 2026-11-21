import type { Pool } from "pg";

/**
 * Idempotent schema setup, run by the API server on every start. Mirrors ./schema so a brand-new
 * database (local or hosted) works without a separate drizzle-kit step.
 */
const SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'user',
  banned boolean NOT NULL DEFAULT false,
  meta jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz
);
CREATE INDEX IF NOT EXISTS users_full_name ON users (lower(first_name || ' ' || last_name));
CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);
CREATE TABLE IF NOT EXISTS chat_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS chat_request_pair ON chat_requests (from_id, to_id);
CREATE TABLE IF NOT EXISTS chat_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_b uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  a_read_at timestamptz NOT NULL DEFAULT now(),
  b_read_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS chat_pair_unique ON chat_conversations (user_a, user_b);
CREATE TABLE IF NOT EXISTS chat_audio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data bytea NOT NULL,
  mime text NOT NULL
);
CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'text',
  text text NOT NULL DEFAULT '',
  audio_id uuid REFERENCES chat_audio(id) ON DELETE SET NULL,
  duration_ms integer,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS chat_message_idempotency ON chat_messages (sender_id, client_id);
CREATE INDEX IF NOT EXISTS chat_message_history ON chat_messages (conversation_id, at);

-- Images: listing photos (public) and identity / registration documents (owner + admins only).
CREATE TABLE IF NOT EXISTS media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mime text NOT NULL,
  data bytea NOT NULL,
  private boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Machines with VIN / plate and their registration documents, verified by an admin.
CREATE TABLE IF NOT EXISTS vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type_id text NOT NULL,
  brand text NOT NULL,
  model text NOT NULL,
  year integer,
  power_hp integer,
  vin text NOT NULL,
  plate text,
  photo_id uuid REFERENCES media(id) ON DELETE SET NULL,
  doc_ids uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending',
  review_note text,
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  checks jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vehicles_owner ON vehicles (owner_id);
-- One approved machine per VIN and per plate across all users.
CREATE UNIQUE INDEX IF NOT EXISTS vehicles_vin_approved ON vehicles (vin) WHERE status <> 'rejected';
CREATE UNIQUE INDEX IF NOT EXISTS vehicles_plate_approved ON vehicles (plate) WHERE status <> 'rejected' AND plate IS NOT NULL;
CREATE TABLE IF NOT EXISTS licenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  number text NOT NULL,
  categories text[] NOT NULL,
  expires_on date NOT NULL,
  front_id uuid NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  back_id uuid REFERENCES media(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  review_note text,
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  checks jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS licenses_user ON licenses (user_id, created_at DESC);
-- Rental listings. Others see them only once an admin approved them.
CREATE TABLE IF NOT EXISTS listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES vehicles(id) ON DELETE SET NULL,
  title text NOT NULL,
  category text NOT NULL,
  type_id text,
  price_per_day numeric(12,2) NOT NULL,
  village text NOT NULL,
  lat double precision,
  lng double precision,
  description text NOT NULL DEFAULT '',
  photo_id uuid REFERENCES media(id) ON DELETE SET NULL,
  terms jsonb,
  year integer,
  power_hp integer,
  available_from date,
  available_to date,
  status text NOT NULL DEFAULT 'pending',
  review_note text,
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  checks jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS listings_status ON listings (status, created_at DESC);
-- Admin additions to the built-in reference data (kinds of work, materials, machines, brands, models, places).
CREATE TABLE IF NOT EXISTS catalog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  name_az text NOT NULL,
  name_ru text NOT NULL DEFAULT '',
  name_en text NOT NULL DEFAULT '',
  brand text,
  lat double precision,
  lng double precision,
  verdict text NOT NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS catalog_unique ON catalog_items (kind, lower(name_az), COALESCE(lower(brand), ''));
`;

export async function migrate(pool: Pool): Promise<void> {
  await pool.query(SQL);
}
