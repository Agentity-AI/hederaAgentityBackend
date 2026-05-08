// scripts/deploy-avalanche.js
// Deploy ERC-8004 Agent Registry to Avalanche C-Chain

const hre = require("hardhat");

async function main() {
  console.log("🏔️  Deploying ERC8004AgentRegistry to Avalanche...\n");

  // Get deployer account
  const [deployer] = await hre.ethers.getSigners();
  
  console.log("Deploying with account:", deployer.address);
  
  // Fix: Use provider.getBalance() instead of deployer.getBalance()
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "AVAX\n");
  
  if (balance === 0n) {
    console.error("❌ Account has no AVAX! Get testnet AVAX from:");
    console.error("   https://faucet.avax.network/");
    console.error("   Your address:", deployer.address);
    console.error("");
    process.exit(1);
  }

  // Deploy contract
  console.log("📝 Deploying contract...");
  
  const ERC8004 = await hre.ethers.getContractFactory("ERC8004AgentRegistry");
  const registry = await ERC8004.deploy();
  
  // Wait for deployment
  await registry.waitForDeployment();
  
  // Get deployed address
  const address = await registry.getAddress();

  console.log("✅ Contract deployed to:", address);
  console.log("\n📋 SAVE THESE VALUES TO YOUR BACKEND .ENV:");
  console.log("─".repeat(60));
  console.log(`REGISTRY_CONTRACT_ADDRESS=${address}`);
  console.log(`OPERATOR_ADDRESS=${deployer.address}`);
  console.log(`OPERATOR_PRIVATE_KEY=<your_private_key>`);
  console.log("─".repeat(60));
  
  // Register a test agent
  console.log("\n🤖 Registering test agent...");
  
  const tx = await registry.registerAgent(
    "TestBot-Alpha",
    "1.0.0",
    ["query_data", "analyze", "report"]
  );
  
  await tx.wait();
  console.log("✅ Test agent registered (Agent ID: 1)");
  
  // Log a test action
  console.log("\n📊 Logging test action...");
  
  const actionData = hre.ethers.AbiCoder.defaultAbiCoder().encode(
    ["string", "string"],
    ["query_type", "price_check"]
  );
  
  const resultHash = hre.ethers.keccak256(
    hre.ethers.toUtf8Bytes("result_data_abc123")
  );
  
  const actionTx = await registry.logAction(
    1,                    // agentId
    "query_data",         // actionType
    actionData,           // encoded inputs
    resultHash            // hash of result
  );
  
  await actionTx.wait();
  console.log("✅ Test action logged (Action ID: 1)");
  
  console.log("\n✨ Deployment complete!");
  console.log("\n🔗 View on SnowTrace:");
  
  const network = hre.network.name;
  const explorerUrl = network === "fuji" 
    ? `https://testnet.snowtrace.io/address/${address}`
    : `https://snowtrace.io/address/${address}`;
  
  console.log(`   ${explorerUrl}`);
  
  console.log("\n📝 Next steps:");
  console.log("   1. Copy the contract address to your backend .env");
  console.log("   2. Run the database migration: node scripts/migrate-add-blockchain-fields.js");
  console.log("   3. Restart your backend server");
  console.log("   4. Test registration: POST /agents/register");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Deployment failed:");
    console.error(error);
    process.exit(1);
  });