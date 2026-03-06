const { ethers } = require("ethers");
const logger = require("../../config/logger");

const REGISTRY_ABI = [
  "function logAction(uint256 agentId, string actionType, bytes actionData, bytes32 resultHash) external returns (uint256)",
];

function getRegistryContract() {
  const rpcUrl = process.env.AVALANCHE_RPC_URL;
  const privateKey = process.env.OPERATOR_PRIVATE_KEY;
  const contractAddress = process.env.AVALANCHE_FUJI_REGISTRY_ADDRESS;

  if (!rpcUrl || !privateKey || !contractAddress) {
    throw new Error(
      "Missing blockchain env vars: AVALANCHE_RPC_URL, OPERATOR_PRIVATE_KEY, or AVALANCHE_FUJI_REGISTRY_ADDRESS",
    );
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);

  return new ethers.Contract(contractAddress, REGISTRY_ABI, wallet);
}

async function logActionOnChain({
  blockchainAgentId,
  actionType,
  actionPayload,
}) {
  try {
    const registry = getRegistryContract();

    const actionData = ethers.toUtf8Bytes(JSON.stringify(actionPayload));
    const resultHash = ethers.keccak256(
      ethers.toUtf8Bytes(JSON.stringify(actionPayload)),
    );

    const tx = await registry.logAction(
      blockchainAgentId,
      actionType,
      actionData,
      resultHash,
    );

    const receipt = await tx.wait();

    return {
      success: true,
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
    };
  } catch (error) {
    logger.error({
      message: "Failed to log action on-chain",
      error: error.message,
    });
    throw error;
  }
}

module.exports = { logActionOnChain };
