const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Alert = sequelize.define(
  "Alert",
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
      allowNull: true,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    severity: {
      type: DataTypes.ENUM("low", "medium", "high", "critical"),
      allowNull: false,
      defaultValue: "medium",
    },
    type: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM("active", "resolved", "dismissed"),
      allowNull: false,
      defaultValue: "active",
    },
    source_id: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    source_type: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
  },
  {
    tableName: "alerts",
    timestamps: true,
    underscored: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      { fields: ["user_id"] },
      { fields: ["agent_id"] },
      { fields: ["status"] },
      { fields: ["severity"] },
      { fields: ["created_at"] },
    ],
  },
);

module.exports = Alert;
