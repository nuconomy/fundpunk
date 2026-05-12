require("@nomicfoundation/hardhat-toolbox");

const networks = {};

if (process.env.MAINNET_RPC_URL) {
  networks.mainnet = {
    url: process.env.MAINNET_RPC_URL,
    chainId: 1,
  };

  if (process.env.DEPLOYER_PRIVATE_KEY) {
    networks.mainnet.accounts = [process.env.DEPLOYER_PRIVATE_KEY];
  }
}

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks,
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || "",
  },
};
