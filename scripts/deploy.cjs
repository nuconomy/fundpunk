const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const balance = await hre.ethers.provider.getBalance(deployer.address);

  console.log("Deploying FundPunkFactory");
  console.log("Deployer:", deployer.address);
  console.log("Balance:", hre.ethers.formatEther(balance), "ETH");

  const Factory = await hre.ethers.getContractFactory("FundPunkFactory");
  const factory = await Factory.deploy();

  await factory.waitForDeployment();

  const factoryAddress = await factory.getAddress();
  console.log("FundPunkFactory:", factoryAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
