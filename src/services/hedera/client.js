const {
  Client,
  PrivateKey,
  AccountId,
} = require("@hashgraph/sdk");

function getHederaClient() {
  const operatorAccountId = process.env.HEDERA_OPERATOR_ID;
  const operatorPrivateKey = process.env.HEDERA_OPERATOR_KEY;
  const network = process.env.HEDERA_NETWORK || "testnet";

  if (!operatorAccountId || !operatorPrivateKey) {
    return null;
  }

  const client =
    network === "mainnet" ? Client.forMainnet() : Client.forTestnet();

  client.setOperator(
    AccountId.fromString(operatorAccountId),
    PrivateKey.fromStringED25519(operatorPrivateKey)
  );

  return client;
}

module.exports = { getHederaClient };