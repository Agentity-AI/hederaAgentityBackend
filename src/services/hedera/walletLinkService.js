const AgentWallet = require("../../models/agentWallet");

async function linkWalletToAgent({
  agentId,
  hederaAccountId,
  hederaPublicKey,
  kmsKeyId = null,
}) {
  if (!agentId || !hederaAccountId || !hederaPublicKey) {
    return null;
  }

  await AgentWallet.upsert(
    {
      agent_id: agentId,
      hedera_account_id: hederaAccountId.trim(),
      hedera_public_key: hederaPublicKey.trim(),
      kms_key_id: kmsKeyId ? kmsKeyId.trim() : null,
      status: "linked",
    },
    { returning: true }
  );

  return AgentWallet.findOne({
    where: { agent_id: agentId },
  });
}

module.exports = { linkWalletToAgent };