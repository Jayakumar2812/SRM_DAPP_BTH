import { expect } from "chai";
import hre from "hardhat";

const Stage = {
  Manufacturing: 0,
  Transport: 1,
  Storage: 2,
  Distribution: 3,
  LocalDepot: 4,
  ClinicDelivery: 5,
  Administered: 6
} as const;

describe("VaccineColdChain", function () {
  async function deployFixture() {
    const [admin, manufacturer, transporter, storage, distributor, clinic, iot, outsider] =
      await hre.ethers.getSigners();
    const VaccineColdChain = await hre.ethers.getContractFactory("VaccineColdChain");
    const contract = await VaccineColdChain.deploy(admin.address);
    await contract.waitForDeployment();

    await contract.grantRole(await contract.MANUFACTURER_ROLE(), manufacturer.address);
    await contract.grantRole(await contract.TRANSPORTER_ROLE(), transporter.address);
    await contract.grantRole(await contract.STORAGE_ROLE(), storage.address);
    await contract.grantRole(await contract.DISTRIBUTOR_ROLE(), distributor.address);
    await contract.grantRole(await contract.CLINIC_ROLE(), clinic.address);
    await contract.grantRole(await contract.IOT_ROLE(), iot.address);

    const batchId = hre.ethers.id("VX4492");

    return {
      contract,
      batchId,
      admin,
      manufacturer,
      transporter,
      storage,
      distributor,
      clinic,
      iot,
      outsider
    };
  }

  it("lets manufacturers create a batch with an initial cold-chain event", async function () {
    const { contract, batchId, manufacturer } = await deployFixture();

    await expect(
      contract
        .connect(manufacturer)
        .createBatch(batchId, manufacturer.address, "ipfs://vx4492", 4, "Mumbai", "QA certified")
    )
      .to.emit(contract, "BatchCreated")
      .withArgs(batchId, manufacturer.address, manufacturer.address, "ipfs://vx4492");

    const batch = await contract.getBatch(batchId);
    expect(batch.manufacturer).to.equal(manufacturer.address);
    expect(batch.isCompromised).to.equal(false);
    expect(await contract.getEventCount(batchId)).to.equal(1n);
  });

  it("blocks unauthorized batch creation and handoff recording", async function () {
    const { contract, batchId, manufacturer, outsider } = await deployFixture();

    await expect(
      contract
        .connect(outsider)
        .createBatch(batchId, outsider.address, "ipfs://bad", 4, "Mumbai", "not authorized")
    ).to.be.reverted;

    await contract
      .connect(manufacturer)
      .createBatch(batchId, manufacturer.address, "ipfs://vx4492", 4, "Mumbai", "QA certified");

    await expect(
      contract
        .connect(outsider)
        .recordHandoff(batchId, 4, outsider.address, Stage.Transport, "Route B", "attempt")
    ).to.be.revertedWithCustomError(contract, "UnauthorizedRecorder");
  });

  it("records the PDF-style custody timeline and keeps safe batches usable", async function () {
    const { contract, batchId, manufacturer, transporter, storage, distributor, clinic } =
      await deployFixture();

    await contract
      .connect(manufacturer)
      .createBatch(batchId, manufacturer.address, "ipfs://vx4492", 4, "Mumbai", "Batch tagged");
    await contract
      .connect(transporter)
      .recordHandoff(batchId, 4, transporter.address, Stage.Transport, "Route B", "Reefer truck");
    await contract
      .connect(storage)
      .recordHandoff(batchId, 2, storage.address, Stage.Storage, "Warehouse A", "Cold bay");
    await contract
      .connect(distributor)
      .recordHandoff(batchId, 3, distributor.address, Stage.Distribution, "Hub Central", "Verified");
    await contract
      .connect(clinic)
      .recordHandoff(batchId, 4, clinic.address, Stage.ClinicDelivery, "Hospital", "Final hop");

    const batch = await contract.getBatch(batchId);
    expect(batch.currentCustodian).to.equal(clinic.address);
    expect(batch.status).to.equal(5n);
    expect(batch.isCompromised).to.equal(false);
    expect(await contract.isSafeForUse(batchId)).to.equal(true);
    expect(await contract.getEventCount(batchId)).to.equal(5n);
  });

  it("permanently marks a batch compromised after out-of-range telemetry", async function () {
    const { contract, batchId, manufacturer, transporter } = await deployFixture();

    await contract
      .connect(manufacturer)
      .createBatch(batchId, manufacturer.address, "ipfs://vx4492", 4, "Mumbai", "Batch tagged");

    await expect(
      contract
        .connect(transporter)
        .recordHandoff(batchId, 22, transporter.address, Stage.Transport, "Route B", "Warm reading")
    )
      .to.emit(contract, "BatchCompromised")
      .withArgs(batchId, 22, Stage.Transport);

    await contract
      .connect(transporter)
      .recordHandoff(batchId, 4, transporter.address, Stage.Transport, "Route B", "Back in range");

    const batch = await contract.getBatch(batchId);
    expect(batch.isCompromised).to.equal(true);
    expect(await contract.isSafeForUse(batchId)).to.equal(false);
  });

  it("allows trusted IoT devices to submit telemetry for operational stages", async function () {
    const { contract, batchId, manufacturer, iot, transporter } = await deployFixture();

    await contract
      .connect(manufacturer)
      .createBatch(batchId, manufacturer.address, "ipfs://vx4492", 4, "Mumbai", "Batch tagged");
    await contract
      .connect(iot)
      .recordHandoff(batchId, 5, transporter.address, Stage.Transport, "Live GPS", "SIM telemetry");

    const event = await contract.getBatchEvent(batchId, 1);
    expect(event.submitter).to.equal(iot.address);
    expect(event.handler).to.equal(transporter.address);
    expect(event.inRange).to.equal(true);
  });

  it("lets clinics mark delivered batches as administered", async function () {
    const { contract, batchId, manufacturer, clinic } = await deployFixture();

    await contract
      .connect(manufacturer)
      .createBatch(batchId, manufacturer.address, "ipfs://vx4492", 4, "Mumbai", "Batch tagged");
    await contract
      .connect(clinic)
      .recordHandoff(batchId, 4, clinic.address, Stage.ClinicDelivery, "Hospital", "Final hop");

    await expect(
      contract.connect(clinic).markAdministered(batchId, 4, "Hospital", "Administered safely")
    )
      .to.emit(contract, "BatchAdministered")
      .withArgs(batchId, clinic.address);

    const batch = await contract.getBatch(batchId);
    expect(batch.status).to.equal(6n);
    expect(await contract.isSafeForUse(batchId)).to.equal(false);
  });
});
