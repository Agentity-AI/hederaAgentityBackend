// src/config/hederaClient.js
// Hedera SDK client singleton — shared across all services.
// Replaces the empty blockchain.js config file.
//
// Docs: https://docs.hedera.com/hedera/sdks-and-apis/sdks/client

const { Client, AccountId, PrivateKey } = require("@hashgraph/sdk");
const logger = require("./logger");

let _client = null;

/**
 * Returns a singleton Hedera client.
 * Reads HEDERA_OPERATOR_ID, HEDERA_OPERATOR_KEY, HEDERA_NETWORK from env.
 */
function getHederaClient() {
  if (_client) return _client;

  const operatorId  = process.env.HEDERA_OPERATOR_ID;
  const operatorKey = process.env.HEDERA_OPERATOR_KEY;
  const network     = process.env.HEDERA_NETWORK || "testnet";

  if (!operatorId || !operatorKey) {
    throw new Error(
      "HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY are required in .env"
    );
  }

  _client = network === "mainnet"
    ? Client.forMainnet()
    : Client.forTestnet();

  _client.setOperator(
    AccountId.fromString(operatorId),
    PrivateKey.fromString(operatorKey)
  );

  // Reasonable timeout for testnet
  _client.setRequestTimeout(30_000);

  logger.info({
    message: `[hedera] Client initialized — network: ${network}, operator: ${operatorId}`,
  });

  return _client;
}

/**
 * Returns the operator PrivateKey for signing scheduled transactions.
 */
function getOperatorKey() {
  const operatorKey = process.env.HEDERA_OPERATOR_KEY;
  if (!operatorKey) throw new Error("HEDERA_OPERATOR_KEY is required");
  return PrivateKey.fromString(operatorKey);
}

/**
 * Mirror Node base URL — used for REST queries (no SDK needed).
 * Docs: https://docs.hedera.com/hedera/sdks-and-apis/rest-api
 */
function getMirrorNodeUrl() {
  const network = process.env.HEDERA_NETWORK || "testnet";
  return network === "mainnet"
    ? "https://mainnet.mirrornode.hedera.com/api/v1"
    : "https://testnet.mirrornode.hedera.com/api/v1";
}

module.exports = { getHederaClient, getOperatorKey, getMirrorNodeUrl };
