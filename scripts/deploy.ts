import hre from "hardhat";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const VaccineColdChain = await hre.ethers.getContractFactory("VaccineColdChain");
  const vaccineColdChain = await VaccineColdChain.deploy(deployer.address);

  await vaccineColdChain.waitForDeployment();

  const address = await vaccineColdChain.getAddress();
  console.log(`VaccineColdChain deployed to ${address}`);
  console.log(`Admin: ${deployer.address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
