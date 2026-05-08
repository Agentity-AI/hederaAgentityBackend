const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  const contractAddress = process.env.AVALANCHE_FUJI_REGISTRY_ADDRESS;

  if (!contractAddress) {
    throw new Error("Missing AVALANCHE_FUJI_REGISTRY_ADDRESS in .env");
  }

  const registry = await ethers.getContractAt(
    "ERC8004AgentRegistry",
    contractAddress
  );

  const totalAgents = await registry.getTotalAgents();
  if (totalAgents === 0n) {
    throw new Error("No agents registered. Register one first.");
  }

  const agentId = totalAgents;
  const actionType = "execute_trade";
  const actionData = ethers.toUtf8Bytes(
    JSON.stringify({
      pair: "AVAX/USDC",
      side: "buy",
      amount: "10",
    })
  );

  const resultHash = ethers.keccak256(
    ethers.toUtf8Bytes("trade successful")
  );

  const tx = await registry.logAction(
    agentId,
    actionType,
    actionData,
    resultHash
  );

  console.log("Submitting action log tx...");
  const receipt = await tx.wait();

  console.log("Transaction hash:", receipt.hash);

  const actions = await registry.getActions(agentId, 0, 10);
  console.log("Total fetched actions:", actions.length);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Log action failed:");
    console.error(error);
    process.exit(1);
  });