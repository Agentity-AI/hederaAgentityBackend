// scripts/migrate-add-blockchain-fields.js
// Add blockchain integration fields to existing database

require("dotenv").config();
const sequelize = require("../config/database");
const logger = require("../config/logger");

async function migrate() {
  try {
    logger.info("Starting database migration...");
    
    // Add columns to Agents table
    await sequelize.query(`
      ALTER TABLE "Agents" 
      ADD COLUMN IF NOT EXISTS "blockchain_agent_id" INTEGER,
      ADD COLUMN IF NOT EXISTS "blockchain_tx_hash" VARCHAR(66),
      ADD COLUMN IF NOT EXISTS "blockchain_registered_at" TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "blockchain_sync_status" VARCHAR(20) DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS "blockchain_sync_error" TEXT;
    `);
    
    logger.info("✅ Added blockchain fields to Agents table");
    
    // Add columns to AgentBehaviorLogs table
    await sequelize.query(`
      ALTER TABLE "AgentBehaviorLogs" 
      ADD COLUMN IF NOT EXISTS "blockchain_tx_hash" VARCHAR(66),
      ADD COLUMN IF NOT EXISTS "blockchain_action_id" INTEGER,
      ADD COLUMN IF NOT EXISTS "blockchain_logged_at" TIMESTAMP;
    `);
    
    logger.info("✅ Added blockchain fields to AgentBehaviorLogs table");
    
    // Create unique index on blockchain_agent_id
    await sequelize.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "agents_blockchain_agent_id_unique" 
      ON "Agents" ("blockchain_agent_id") 
      WHERE "blockchain_agent_id" IS NOT NULL;
    `);
    
    logger.info("✅ Created unique index on blockchain_agent_id");
    
    logger.info("🎉 Migration completed successfully!");
    process.exit(0);
    
  } catch (error) {
    logger.error({
      message: "Migration failed",
      error: error.message,
      stack: error.stack,
    });
    
    process.exit(1);
  }
}

migrate();