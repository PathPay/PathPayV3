import app from "./app";
import { logger } from "./lib/logger";
import { ensureTablesExist } from "./lib/supabase";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, () => {
  logger.info({ port }, "Server listening");

  // Best-effort Supabase table check
  ensureTablesExist().catch((e) =>
    logger.warn({ e }, "Supabase init skipped"),
  );
});