import app from "./app";
import { logger } from "./lib/logger";
import { ensureTablesExist } from "./lib/supabase";

const port = Number(
  process.env.API_PORT ??
  process.env.PORT ??
  3000,
);

if (
  !Number.isFinite(port) ||
  port <= 0 ||
  port > 65535
) {
  throw new Error(
    `Invalid API_PORT: "${process.env.API_PORT}"`,
  );
}

const server = app.listen(
  port,
  "0.0.0.0",
  async () => {
    logger.info(
      {
        port,
        env:
          process.env.NODE_ENV ??
          "development",
      },
      "API server listening",
    );

    try {
      await ensureTablesExist();

      logger.info(
        "Supabase initialization completed",
      );
    } catch (error) {
      logger.warn(
        { error },
        "Supabase initialization skipped",
      );
    }
  },
);

server.on("error", (error) => {
  logger.error(
    { error, port },
    "Failed to start API server",
  );

  process.exit(1);
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM received");

  server.close(() => {
    logger.info("Server stopped");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  logger.info("SIGINT received");

  server.close(() => {
    logger.info("Server stopped");
    process.exit(0);
  });
});