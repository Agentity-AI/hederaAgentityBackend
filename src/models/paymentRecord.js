const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const PaymentRecord = sequelize.define(
  "PaymentRecord",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    from_user_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    to_agent_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    task_execution_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    amount_hbar: {
      type: DataTypes.DECIMAL(18, 8),
      allowNull: false,
    },
    hedera_tx_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    payment_reference: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM("quoted", "pending", "paid", "failed"),
      allowNull: false,
      defaultValue: "quoted",
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
  },
  {
    tableName: "payment_records",
    timestamps: true,
    underscored: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      { fields: ["from_user_id"] },
      { fields: ["to_agent_id"] },
      { fields: ["task_execution_id"] },
      { fields: ["status"] },
      { fields: ["created_at"] },
    ],
  }
);

module.exports = PaymentRecord;