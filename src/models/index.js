const Agent = require("./agent");
const AgentMetadata = require("./agentMetadata");
const AgentReputation = require("./agentReputation");
const SimulationRun = require("./simulationRun");
const SmartContractAudit = require("./smartContractAudit");
const AgentWallet = require("./agentWallet");
const TaskExecution = require("./taskExecution");
const PaymentRecord = require("./paymentRecord");
const KmsAuditLog = require("./kmsAuditLog");

Agent.hasOne(AgentMetadata, { foreignKey: "agent_id", as: "metadata" });
AgentMetadata.belongsTo(Agent, { foreignKey: "agent_id" });

Agent.hasOne(AgentReputation, { foreignKey: "agent_id", as: "reputation" });
AgentReputation.belongsTo(Agent, { foreignKey: "agent_id" });

Agent.hasMany(SimulationRun, { foreignKey: "agent_id", as: "simulations" });
SimulationRun.belongsTo(Agent, { foreignKey: "agent_id", as: "agent" });

Agent.hasOne(AgentWallet, { foreignKey: "agent_id", as: "wallet" });
AgentWallet.belongsTo(Agent, { foreignKey: "agent_id", as: "agent" });

Agent.hasMany(TaskExecution, { foreignKey: "agent_id", as: "tasks" });
TaskExecution.belongsTo(Agent, { foreignKey: "agent_id", as: "agent" });

TaskExecution.belongsTo(PaymentRecord, {
  foreignKey: "payment_record_id",
  as: "payment",
});
PaymentRecord.hasOne(TaskExecution, {
  foreignKey: "payment_record_id",
  as: "task",
});

module.exports = {
  Agent,
  AgentMetadata,
  AgentReputation,
  SimulationRun,
  SmartContractAudit,
  AgentWallet,
  TaskExecution,
  PaymentRecord,
  KmsAuditLog,
};