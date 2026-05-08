const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const Agent = require("./agent");

const AgentBehaviorLog = sequelize.define("AgentBehaviorLog", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  event_type: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  event_payload: {
    type: DataTypes.JSONB,
    allowNull: true,
  },
  risk_score: {
    type: DataTypes.FLOAT,
    defaultValue: 0.0,
  },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // NEW: Blockchain Integration Field
  // ═══════════════════════════════════════════════════════════════════════════
  
  blockchain_tx_hash: {
    type: DataTypes.STRING(66),
    allowNull: true,
    comment: "Avalanche TX hash for this action (if logged on-chain)",
  },
  blockchain_action_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: "On-chain action ID from ERC-8004 contract",
  },
  blockchain_logged_at: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: "Timestamp when action was logged on Avalanche",
  },
}, {
  timestamps: true,
});

Agent.hasMany(AgentBehaviorLog, { foreignKey: "agent_id" });
AgentBehaviorLog.belongsTo(Agent, { foreignKey: "agent_id" });

module.exports = AgentBehaviorLog;