const hre = require("hardhat");

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function daysFromEnv(name) {
  const days = Number(requiredEnv(name));
  if (!Number.isInteger(days) || days <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return BigInt(days);
}

async function main() {
  const factoryAddress = requiredEnv("FACTORY_ADDRESS");
  const budgetWei = hre.ethers.parseEther(requiredEnv("PURCHASE_BUDGET_ETH"));
  const fundingDays = daysFromEnv("FUNDING_DAYS");
  const executionDays = daysFromEnv("EXECUTION_DAYS");

  const now = BigInt(Math.floor(Date.now() / 1000));
  const fundingDeadline = now + fundingDays * 24n * 60n * 60n;
  const executionDeadline = fundingDeadline + executionDays * 24n * 60n * 60n;

  const factory = await hre.ethers.getContractAt("FundPunkFactory", factoryAddress);
  const tx = await factory.createCampaign(budgetWei, fundingDeadline, executionDeadline);
  const receipt = await tx.wait();

  const event = receipt.logs
    .map((log) => {
      try {
        return factory.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((log) => log && log.name === "CampaignCreated");

  console.log("Factory:", factoryAddress);
  console.log("Budget:", hre.ethers.formatEther(budgetWei), "ETH");
  console.log("Funding deadline:", fundingDeadline.toString());
  console.log("Execution deadline:", executionDeadline.toString());
  console.log("Campaign:", event ? event.args.campaign : "unknown");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
