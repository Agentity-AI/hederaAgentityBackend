const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const KmsAuditLog = sequelize.define(
  "KmsAuditLog",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    agent_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    kms_key_id: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    operation: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    request_payload: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    response_payload: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM("success", "failed", "simulated"),
      allowNull: false,
      defaultValue: "simulated",
    },
  },
  {
    tableName: "kms_audit_logs",
    timestamps: true,
    underscored: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      { fields: ["user_id"] },
      { fields: ["agent_id"] },
      { fields: ["status"] },
      { fields: ["created_at"] },
    ],
  }
);

module.exports = KmsAuditLog;