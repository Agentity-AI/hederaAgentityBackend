const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const TaskExecution = sequelize.define(
  "TaskExecution",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    requester_user_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    agent_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    task_type: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    input_payload: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    simulation_run_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    payment_record_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM(
        "requested",
        "simulated",
        "quoted",
        "paid",
        "executing",
        "completed",
        "failed",
      ),
      allowNull: false,
      defaultValue: "requested",
    },
    result_payload: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
  },
  {
    tableName: "task_executions",
    timestamps: true,
    underscored: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      { fields: ["requester_user_id"] },
      { fields: ["agent_id"] },
      { fields: ["status"] },
      { fields: ["created_at"] },
    ],
  },
);

module.exports = TaskExecution;
