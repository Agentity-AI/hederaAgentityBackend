const { ethers } = require("hardhat");
require("dotenv").config();

async function main() {
  const contractAddress = process.env.AVALANCHE_FUJI_REGISTRY_ADDRESS;

  if (!contractAddress) {
    throw new Error("Missing AVALANCHE_FUJI_REGISTRY_ADDRESS in .env");
  }

  const registry = await ethers.getContractAt(
    "ERC8004AgentRegistry",
    contractAddress,
  );

  const tx = await registry.registerAgent("Agentity-Test-Agent", "1.0.0", [
    "trade",
    "query_price",
    "monitor_risk",
  ]);

  console.log("Submitting registration tx...");
  const receipt = await tx.wait();

  console.log("Transaction hash:", receipt.hash);

  const totalAgents = await registry.getTotalAgents();
  console.log("New total agents:", totalAgents.toString());

  const agent = await registry.getAgent(totalAgents);
  console.log("Registered agent:", {
    id: totalAgents.toString(),
    name: agent[0],
    version: agent[1],
    creator: agent[2],
    capabilities: agent[3],
    actionCount: agent[4].toString(),
    active: agent[6],
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Register test agent failed:");
    console.error(error);
    process.exit(1);
  });
