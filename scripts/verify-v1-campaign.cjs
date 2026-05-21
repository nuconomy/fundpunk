const hre = require("hardhat");

function campaignAddressFromInput() {
  const value = process.env.CAMPAIGN_ADDRESS || process.argv[2];
  if (!value) throw new Error("Missing CAMPAIGN_ADDRESS or first positional argument");
  if (!hre.ethers.isAddress(value)) throw new Error(`Invalid campaign address: ${value}`);
  return value;
}

async function main() {
  const campaignAddress = campaignAddressFromInput();
  const campaign = await hre.ethers.getContractAt("FundV1PunkCampaign", campaignAddress);

  const [purchaseBudgetWei, fundingDeadline, executionDeadline, creator] = await Promise.all([
    campaign.purchaseBudgetWei(),
    campaign.fundingDeadline(),
    campaign.executionDeadline(),
    campaign.creator(),
  ]);

  const constructorArguments = [
    purchaseBudgetWei.toString(),
    fundingDeadline.toString(),
    executionDeadline.toString(),
    creator,
  ];
  const abiEncodedConstructorArguments = hre.ethers.AbiCoder.defaultAbiCoder()
    .encode(
      ["uint256", "uint64", "uint64", "address"],
      constructorArguments,
    )
    .slice(2);

  console.log("Verifying FundV1PunkCampaign");
  console.log("Campaign:", campaignAddress);
  console.log("Constructor arguments:");
  console.log(JSON.stringify(constructorArguments, null, 2));
  console.log("ABI-encoded constructor arguments:");
  console.log(abiEncodedConstructorArguments);

  try {
    await hre.run("verify:verify", {
      address: campaignAddress,
      contract: "contracts/FundV1PunkCampaign.sol:FundV1PunkCampaign",
      constructorArguments,
    });
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    if (message.toLowerCase().includes("already verified")) {
      console.log("Campaign is already verified.");
      return;
    }
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
