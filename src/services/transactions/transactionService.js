const Agent = require("../../models/agent");
const TransactionPolicy = require("../../models/transactionPolicy");
const TransactionRecord = require("../../models/transactionRecord");

async function createTransactionRecord({
  userId,
  agentId,
  taskExecutionId = null,
  paymentRecordId = null,
  transactionType,
  contractAddress = null,
  amount = null,
  status,
  riskRating = null,
  txHash = null,
  validationSummary = null,
  executionTrace = null,
  policySnapshot = null,
  metadata = null,
}) {
  return TransactionRecord.create({
    user_id: userId,
    agent_id: agentId,
    task_execution_id: taskExecutionId,
    payment_record_id: paymentRecordId,
    transaction_type: transactionType,
    contract_address: contractAddress,
    amount,
    status,
    risk_rating: riskRating,
    tx_hash: txHash,
    validation_summary: validationSummary,
    execution_trace: executionTrace,
    policy_snapshot: policySnapshot,
    metadata,
  });
}

async function listTransactionsForUser(userId) {
  return TransactionRecord.findAll({
    where: { user_id: userId },
    include: [
      {
        model: Agent,
        as: "agent",
        attributes: ["id", "agent_name"],
        required: false,
      },
    ],
    order: [["created_at", "DESC"]],
    limit: 100,
  });
}

async function getTransactionForUser(id, userId) {
  return TransactionRecord.findOne({
    where: { id, user_id: userId },
    include: [
      {
        model: Agent,
        as: "agent",
        attributes: ["id", "agent_name"],
        required: false,
      },
    ],
  });
}

async function listPoliciesForUser(userId) {
  return TransactionPolicy.findAll({
    where: { user_id: userId },
    order: [["created_at", "DESC"]],
  });
}

async function createPolicy({
  userId,
  name,
  description = null,
  status = "active",
  rules = {},
}) {
  return TransactionPolicy.create({
    user_id: userId,
    name,
    description,
    status,
    rules,
  });
}

function formatTransaction(transaction) {
  const metadata = transaction.metadata || {};
  const amountUnit = metadata.amountUnit || metadata.currency || null;

  return {
    id: transaction.id,
    agentId: transaction.agent_id,
    agentName: transaction.agent?.agent_name || null,
    taskExecutionId: transaction.task_execution_id,
    paymentRecordId: transaction.payment_record_id,
    transactionType: transaction.transaction_type,
    displayType: metadata.displayType || transaction.transaction_type,
    contractAddress: transaction.contract_address,
    amount: transaction.amount == null ? null : Number(transaction.amount),
    amountUnit,
    status: transaction.status,
    riskRating: transaction.risk_rating,
    txHash: transaction.tx_hash,
    validationSummary: transaction.validation_summary,
    executionTrace: transaction.execution_trace,
    policySnapshot: transaction.policy_snapshot,
    metadata: transaction.metadata,
    createdAt: transaction.created_at,
    updatedAt: transaction.updated_at,
  };
}

module.exports = {
  createPolicy,
  createTransactionRecord,
  formatTransaction,
  getTransactionForUser,
  listPoliciesForUser,
  listTransactionsForUser,
};
