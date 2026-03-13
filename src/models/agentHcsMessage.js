// src/models/agentHcsMessage.js
// Local DB mirror of HCS messages for each agent.
// The authoritative source is always the Hedera Mirror Node, but
// keeping a local copy allows fast dashboard queries without hitting
// the Mirror Node API on every request.
//
// Message types:
//   AGENT_REGISTERED          — first message, created on registration
//   VERIFIED                  — first manual verification (user clicked Verify)
//   REVERIFICATION_TRIGGERED  — fired by Hedera scheduled transaction
//   REVERIFIED                — result of scheduled reverification check
//   AGENT_FLAGGED             — score dropped below threshold
//   SCORE_UPDATED             — manual score override by admin

const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const AgentHcsMessage = sequelize.define(
  "AgentHcsMessage",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    agent_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },

    hcs_topic_id: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    // Sequence number on the HCS topic (from Hedera receipt)
    sequence_number: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    // AGENT_REGISTERED | VERIFIED | REVERIFICATION_TRIGGERED |
    // REVERIFIED | AGENT_FLAGGED | SCORE_UPDATED
    message_type: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    // Full message JSON as submitted to HCS
    message_payload: {
      type: DataTypes.JSONB,
      allowNull: true,
    },

    // Hedera consensus timestamp — e.g. "1714300000.000000000"
    consensus_timestamp: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    // Trust score at time of this message (for VERIFIED / REVERIFIED)
    score: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },

    // Whether score was >= threshold at time of message
    is_healthy: {
      type: DataTypes.BOOLEAN,
      allowNull: true,
    },

    // Score delta vs previous check (+ or -)
    score_delta: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
  },
  {
    tableName: "agent_hcs_messages",
    timestamps: true,
    underscored: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      { fields: ["agent_id"] },
      { fields: ["hcs_topic_id"] },
      { fields: ["message_type"] },
      { fields: ["created_at"] },
    ],
  }
);

module.exports = AgentHcsMessage;
