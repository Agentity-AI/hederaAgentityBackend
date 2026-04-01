const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const TransactionRecord = sequelize.define(
  "TransactionRecord",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    agent_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    task_execution_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    payment_record_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    transaction_type: {
      type: DataTypes.ENUM("payment", "execution"),
      allowNull: false,
    },
    contract_address: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    amount: {
      type: DataTypes.DECIMAL(18, 8),
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    risk_rating: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    tx_hash: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    validation_summary: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    execution_trace: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    policy_snapshot: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
  },
  {
    tableName: "transaction_records",
    timestamps: true,
    underscored: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      { fields: ["user_id"] },
      { fields: ["agent_id"] },
      { fields: ["task_execution_id"] },
      { fields: ["status"] },
      { fields: ["created_at"] },
    ],
  },
);

module.exports = TransactionRecord;
