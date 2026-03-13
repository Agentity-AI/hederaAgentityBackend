const {
  AccountId,
  Hbar,
  TransferTransaction,
} = require("@hashgraph/sdk");
const PaymentRecord = require("../../models/paymentRecord");
const AgentWallet = require("../../models/agentWallet");
const { getHederaClient } = require("./client");

function computeQuoteHbar(taskType) {
  const pricing = {
    simulation: 0.10,
    audit: 0.25,
    execution: 0.50,
    coordination: 0.15,
  };

  return pricing[taskType] || 0.10;
}

async function createPaymentQuote({
  fromUserId,
  toAgentId,
  taskExecutionId = null,
  taskType,
  metadata = null,
}) {
  const amountHbar = computeQuoteHbar(taskType);

  const payment = await PaymentRecord.create({
    from_user_id: fromUserId,
    to_agent_id: toAgentId,
    task_execution_id: taskExecutionId,
    amount_hbar: amountHbar,
    status: "quoted",
    metadata: {
      taskType,
      ...metadata,
    },
  });

  return payment;
}

async function executeHederaPayment(paymentRecord) {
  const client = getHederaClient();
  const wallet = await AgentWallet.findOne({
    where: { agent_id: paymentRecord.to_agent_id, status: "linked" },
  });

  if (!wallet) {
    throw new Error("Agent wallet not linked to Hedera");
  }

  if (!client) {
    const updated = await paymentRecord.update({
      status: "paid",
      payment_reference: "simulated-hedera-payment",
      metadata: {
        ...(paymentRecord.metadata || {}),
        simulated: true,
      },
    });

    return {
      payment: updated,
      txId: null,
      simulated: true,
    };
  }

  const tx = new TransferTransaction()
    .addHbarTransfer(
      AccountId.fromString(process.env.HEDERA_OPERATOR_ID),
      Hbar.fromTinybars(
        -Math.round(Number(paymentRecord.amount_hbar) * 100000000)
      )
    )
    .addHbarTransfer(
      AccountId.fromString(wallet.hedera_account_id),
      Hbar.fromTinybars(
        Math.round(Number(paymentRecord.amount_hbar) * 100000000)
      )
    );

  const submit = await tx.execute(client);
  const receipt = await submit.getReceipt(client);

  const updated = await paymentRecord.update({
    status: "paid",
    hedera_tx_id: submit.transactionId.toString(),
    payment_reference: receipt.status.toString(),
  });

  return {
    payment: updated,
    txId: submit.transactionId.toString(),
    simulated: false,
  };
}

async function listPaymentsForUser(userId) {
  return PaymentRecord.findAll({
    where: { from_user_id: userId },
    order: [["created_at", "DESC"]],
    limit: 100,
  });
}

module.exports = {
  computeQuoteHbar,
  createPaymentQuote,
  executeHederaPayment,
  listPaymentsForUser,
};