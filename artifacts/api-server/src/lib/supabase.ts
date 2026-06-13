import { createClient } from "@supabase/supabase-js";
import { logger } from "./logger";

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL ?? "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY ?? "";

if (!supabaseUrl || !supabaseServiceKey) {
  logger.warn("Supabase credentials not configured — persistence disabled");
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const MIGRATION_SQL = `
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
`.trim();

export async function ensureTablesExist(): Promise<void> {
  if (!supabaseUrl || !supabaseServiceKey) return;

  const { error } = await supabaseAdmin
    .from("routing_history")
    .select("id")
    .limit(0);

  if (!error) {
    logger.info("Supabase tables verified");
    return;
  }

  if (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.message?.includes("does not exist") ||
    error.message?.includes("schema cache")
  ) {
    logger.warn("Supabase tables missing — attempting auto-migration…");

    // Best-effort: try calling exec_sql rpc (works if user pre-created the function)
    const { error: rpcErr } = await supabaseAdmin.rpc("exec_sql", {
      query: MIGRATION_SQL,
    });

    if (rpcErr) {
      logger.warn(
        { sql: MIGRATION_SQL },
        "Auto-migration failed. Run the following SQL in your Supabase SQL Editor to enable persistence:",
      );
    } else {
      logger.info("Supabase auto-migration succeeded");
    }
  } else {
    logger.error({ error }, "Supabase connection error");
  }
}
