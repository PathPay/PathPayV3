-- PathPay Supabase Schema
-- Run this once in the Supabase SQL Editor: https://app.supabase.com/project/_/sql

CREATE TABLE IF NOT EXISTS routing_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT,
  merchant_url TEXT NOT NULL,
  amount TEXT NOT NULL,
  recommended_rail TEXT NOT NULL,
  processor TEXT NOT NULL,
  confidence NUMERIC NOT NULL,
  reason TEXT,
  billing_address JSONB,
  fallback_rails TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT NOT NULL,
  routing_id UUID REFERENCES routing_history(id) ON DELETE SET NULL,
  rail TEXT NOT NULL,
  amount TEXT NOT NULL,
  merchant_url TEXT,
  status TEXT NOT NULL,
  tx_hash TEXT,
  card_last4 TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS routing_history_user_id_idx ON routing_history(user_id);
CREATE INDEX IF NOT EXISTS routing_history_created_at_idx ON routing_history(created_at DESC);
CREATE INDEX IF NOT EXISTS payment_events_user_id_idx ON payment_events(user_id);
CREATE INDEX IF NOT EXISTS payment_events_routing_id_idx ON payment_events(routing_id);

-- RLS (service role bypasses these automatically)
ALTER TABLE routing_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;

-- Optional: helper function for auto-migration
CREATE OR REPLACE FUNCTION exec_sql(query text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  EXECUTE query;
END;
$$;
