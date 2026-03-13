// src/models/agentHcsRegistry.js
// Stores the Hedera HCS topic ID, schedule ID, and current trust state
// for each agent. One row per agent — created on first verification.
//
// Docs: https://docs.hedera.com/hedera/sdks-and-apis/sdks/consensus-service

const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const AgentHcsRegistry = sequelize.define(
  "AgentHcsRegistry",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    // FK → Agents.id
    agent_id: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      comment: "One HCS registry entry per agent",
    },

    // The per-agent HCS topic — e.g. "0.0.4821733"
    hcs_topic_id: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      comment: "Hedera Consensus Service topic ID for this agent",
    },

    // Sequence number on the GLOBAL registry topic (the agent index)
    global_registry_seq: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "Sequence number on the platform-wide registry topic",
    },

    // Trust score 0–100 (higher = more trustworthy)
    current_score: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },

    current_risk_level: {
      type: DataTypes.STRING,
      defaultValue: "unknown",
      comment: "safe | low | medium | high",
    },

    last_verified_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Timestamp of last successful verification (manual or scheduled)",
    },

    next_scheduled_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "When the next Hedera scheduled reverification fires",
    },

    // The Hedera Schedule ID currently active for this agent — e.g. "0.0.5555"
    // When this fires → watcher detects it → creates the NEXT schedule
    active_schedule_id: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Active Hedera ScheduleId for the next reverification trigger",
    },

    verification_count: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: "Total number of times this agent has been verified/reverified",
    },

    status: {
      type: DataTypes.ENUM("registered", "verified", "flagged", "suspended"),
      defaultValue: "registered",
    },
  },
  {
    tableName: "agent_hcs_registry",
    timestamps: true,
    underscored: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      { fields: ["agent_id"] },
      { fields: ["hcs_topic_id"] },
      { fields: ["status"] },
      { fields: ["active_schedule_id"] },
    ],
  }
);

module.exports = AgentHcsRegistry;
