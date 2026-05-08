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

  const totalAgents = await registry.getTotalAgents();

  console.log("Connected to contract:", contractAddress);
  console.log("Total agents:", totalAgents.toString());

  if (totalAgents > 0n) {
    const latestAgentId = totalAgents;

    const agent = await registry.getAgent(latestAgentId);

    console.log("\nLatest Agent Details:");
    console.log("Agent ID:", latestAgentId.toString());
    console.log("Name:", agent[0]);
    console.log("Version:", agent[1]);
    console.log("Creator:", agent[2]);
    console.log("Capabilities:", agent[3]);
    console.log("Action Count:", agent[4].toString());
    console.log("Registered At:", agent[5].toString());
    console.log("Active:", agent[6]);

    const actions = await registry.getActions(latestAgentId, 0, 10);
    console.log("\nRecent Actions:", actions.length);
  } else {
    console.log("No agents registered yet.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Read script failed:");
    console.error(error);
    process.exit(1);
  });
