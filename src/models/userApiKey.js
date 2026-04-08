const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const UserApiKey = sequelize.define(
  "UserApiKey",
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
    key_hash: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    key_prefix: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    key_preview: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM("active", "revoked"),
      allowNull: false,
      defaultValue: "active",
    },
    last_used_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    revoked_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "user_api_keys",
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ["user_id"] },
      { fields: ["status"] },
    ],
  },
);

module.exports = UserApiKey;
