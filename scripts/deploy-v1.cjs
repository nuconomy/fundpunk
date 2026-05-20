const hre = require("hardhat");

const CRYPTOPUNKS_V1_MARKET = "0x6Ba6f2207e343923BA692e5Cae646Fb0F566DB8D";
const PUNKSMARKET = "0x64e507FEBF26521b73FbdfA533106B2042533218";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const balance = await hre.ethers.provider.getBalance(deployer.address);

  console.log("Deploying FundV1PunkFactory");
  console.log("Deployer:", deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "ETH");

  const Factory = await hre.ethers.getContractFactory("FundV1PunkFactory");
  const factory = await Factory.deploy();

  await factory.waitForDeployment();

  const factoryAddress = await factory.getAddress();
  console.log("FundV1PunkFactory:", factoryAddress);
  console.log("CryptoPunks V1 market:", CRYPTOPUNKS_V1_MARKET);
  console.log("PunksMarket adapter:", PUNKSMARKET);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
