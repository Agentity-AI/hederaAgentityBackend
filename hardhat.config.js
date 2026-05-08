// hardhat.config.avalanche.js
// Avalanche-specific Hardhat configuration

require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  
  networks: {
    // Avalanche Fuji Testnet
    fuji: {
      url: "https://api.avax-test.network/ext/bc/C/rpc",
      chainId: 43113,
      accounts: process.env.OPERATOR_PRIVATE_KEY 
        ? [process.env.OPERATOR_PRIVATE_KEY] 
        : [],
      gasPrice: 25000000000, // 25 gwei
    },
    
    // Avalanche Mainnet
    mainnet: {
      url: "https://api.avax.network/ext/bc/C/rpc",
      chainId: 43114,
      accounts: process.env.OPERATOR_PRIVATE_KEY 
        ? [process.env.OPERATOR_PRIVATE_KEY] 
        : [],
      gasPrice: 25000000000, // 25 gwei
    },
  },
  
  // SnowTrace verification
  etherscan: {
    apiKey: {
      avalanche: process.env.SNOWTRACE_API_KEY || "",
      avalancheFujiTestnet: process.env.SNOWTRACE_API_KEY || "",
    },
  },
};