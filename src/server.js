// src/server.js
// MODIFIED: starts the HCS watcher after database sync.
// The watcher polls Hedera Mirror Node for REVERIFICATION_TRIGGERED messages
// and chains the next scheduled transaction automatically.

const app      = require("./app");
const sequelize = require("./config/database");
const logger   = require("./config/logger");

// Register model associations BEFORE syncing
require("./models");

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    await sequelize.authenticate();
    logger.info({ message: "Database connected successfully." });

    await sequelize.sync();
    logger.info({ message: "Database synced." });

    // ── Start Hedera HCS watcher (if configured) ──────────
    // Polls Mirror Node every HEDERA_WATCHER_POLL_MS (default: 60s)
    // Detects fired scheduled transactions → runs reverification → chains next schedule
    if (process.env.HEDERA_OPERATOR_ID && process.env.HEDERA_OPERATOR_KEY) {
      try {
        const { startWatcher } = require("./services/hedera/hcsWatcherService");
        await startWatcher();
        logger.info({ message: "[hedera] HCS watcher started" });
      } catch (watcherErr) {
        // Watcher failure is non-fatal — rest of server still starts
        logger.error({
          message: `[hedera] HCS watcher failed to start: ${watcherErr.message}`,
        });
      }
    } else {
      logger.info({
        message: "[hedera] HEDERA_OPERATOR_ID/KEY not set — HCS watcher disabled",
      });
    }

    app.listen(PORT, () => {
      logger.info({ message: `Server running on port ${PORT}` });
    });
  } catch (error) {
    logger.error({ message: "Failed to start server", error });
    process.exit(1);
  }
}

startServer();
