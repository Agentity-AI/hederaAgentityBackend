const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const TransactionPolicy = sequelize.define(
  "TransactionPolicy",
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
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM("active", "disabled"),
      allowNull: false,
      defaultValue: "active",
    },
    rules: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
  },
  {
    tableName: "transaction_policies",
    timestamps: true,
    underscored: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [{ fields: ["user_id"] }, { fields: ["status"] }],
  },
);

module.exports = TransactionPolicy;
