const { DataTypes, Op } = require("sequelize");
const sequelize = require("../config/database");

const Agent = sequelize.define(
  "Agent",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    creator_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    agent_name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    public_key: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: false,
    },
    fingerprint: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM("pending", "verified", "suspended"),
      defaultValue: "pending",
    },
    blockchain_agent_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "On-chain agent ID from ERC-8004 contract",
    },
    blockchain_tx_hash: {
      type: DataTypes.STRING(66),
      allowNull: true,
      comment: "Transaction hash of the registration on Avalanche",
    },
    blockchain_registered_at: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Timestamp when agent was registered on-chain",
    },
    blockchain_sync_status: {
      type: DataTypes.ENUM("pending", "synced", "failed"),
      defaultValue: "pending",
      comment: "Status of blockchain synchronization",
    },
    blockchain_sync_error: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Error message if blockchain sync failed",
    },
  },
  {
    timestamps: true,
    indexes: [
      { fields: ["creator_id"] },
      {
        fields: ["blockchain_agent_id"],
        unique: true,
        where: {
          blockchain_agent_id: { [Op.ne]: null },
        },
      },
    ],
  }
);

module.exports = Agent;