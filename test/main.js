const { expect } = require("chai");
const { BigNumber } = require("ethers");
const { ethers, waffle } = require("hardhat");
const { ENSBaseRegistrarABI } = require("./abi/ENSBaseRegistrar");

// Setup addresses
const adminWallet = "0xddd88795d0d9dd724750fe0e02fbd018d7588c50"; // Anish's wallet
const ENSHolder = "0xe5501bc2b0df6d0d7daafc18d2ef127d9e612963"; // Mike's wallet
const ENSBeneficiary = "0xe0fa212aafb8e4ed051767ffb755871c6af9b819"; // Alexis Ohanian's wallet
const Binance = "0x3f5CE5FBFe3E9af3971dD833D26bA9b5C936f0bE"; // Binance
const DeployedENSBaseRegistrar = "0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85"; // ENSBaseRegistrar

// Setup ENS name to track
const ethcloutENS =
  "35335197631003614368981001289464312557811210200188364658220803463187799125791";

// Setup contracts
let LootboxContract;
let LootboxContractAddress;

// Setup contstants
const provider = waffle.provider;
const ONE_ETHER = ethers.utils.parseEther("1.0");
const ERROR_MESSAGES = {
  INCORRECT_ETH_VALUE: "ENSLootbox: Donation amount does not match spent ETH",
  OWNS_ENS_NAME: "ENSLootbox: ENS name is already owned by lootbox",
  NO_EXCESS_ETH: "ENSLootbox: No excess ETH donated",
  ENS_NOT_OWNED: "ENSLootbox: Lootbox does not own ENS name",
};

async function deploy() {
  // Impersonate Binance
  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [Binance],
  });
  const binanceSigner = await ethers.provider.getSigner(Binance);

  // Fund each used wallet with 100 ETH
  await binanceSigner.sendTransaction({
    to: adminWallet,
    value: ethers.utils.parseEther("100.0"),
  });
  await binanceSigner.sendTransaction({
    to: ENSHolder,
    value: ethers.utils.parseEther("100.0"),
  });
  await binanceSigner.sendTransaction({
    to: ENSBeneficiary,
    value: ethers.utils.parseEther("100.0"),
  });

  // Stop impersonating Binance and start impersonating admin
  await hre.network.provider.request({
    method: "hardhat_stopImpersonatingAccount",
    params: [Binance],
  });
  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [adminWallet],
  });
  const adminSigner = await ethers.provider.getSigner(adminWallet);

  // Deploy Lootbox contract w/ admin wallet
  const ENSLootbox = await ethers.getContractFactory("ENSLootbox");
  const contractWithSigner = ENSLootbox.connect(adminSigner);
  const contract = await contractWithSigner.deploy();
  await contract.deployed();
  LootboxContract = contract;
  LootboxContractAddress = contract.address.toString();
}

async function impersonateSigner(account) {
  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [account],
  });
  return await ethers.provider.getSigner(account);
}

describe("ENSLootbox", () => {
  beforeEach(async () => {
    await network.provider.request({
      method: "hardhat_reset",
      params: [
        {
          forking: {
            jsonRpcUrl: "",
            blockNumber: 12482458,
          },
        },
      ],
    });
    await deploy();
  });

  it("Should allow donating ETH to an ENS name bounty", async () => {
    // Impersonate Binance
    await impersonateSigner(Binance);

    // Donate to contract with ENS
    await LootboxContract.donateETH(ONE_ETHER, ethcloutENS, {
      value: ONE_ETHER,
    });

    const LootboxBalance = await provider.getBalance(LootboxContractAddress);
    const LootboxDonatedAmount = await LootboxContract.donatedAmount();
    const LootboxBountyAmount = await LootboxContract.bounties(ethcloutENS);

    expect(LootboxBalance.toString()).to.equal(LootboxDonatedAmount.toString());
    expect(LootboxDonatedAmount.toString()).to.equal(
      LootboxBountyAmount.toString()
    );
  });

  it("Should revert donating ETH value does not mach msg.value", async () => {
    // Impersonate Binance
    await impersonateSigner(Binance);

    // Donate to contract with ENS
    const tx = LootboxContract.donateETH("1", ethcloutENS, {
      value: ONE_ETHER,
    });

    await expect(tx).revertedWith(ERROR_MESSAGES.INCORRECT_ETH_VALUE);
  });

  it("Should revert donating when contract owns ENS name", async () => {
    // Impersonate ENS holder
    const ENSHolderSigner = await impersonateSigner(ENSHolder);

    // Transfer ENS name
    const ENSBaseRegistrar = new ethers.Contract(
      DeployedENSBaseRegistrar,
      ENSBaseRegistrarABI,
      ENSHolderSigner
    );
    await ENSBaseRegistrar.transferFrom(
      ENSHolder,
      LootboxContractAddress,
      ethcloutENS
    );

    // Attempt to add bounty
    const tx = LootboxContract.donateETH("1", ethcloutENS, {
      value: ONE_ETHER,
    });

    await expect(tx).revertedWith(ERROR_MESSAGES.OWNS_ENS_NAME);
  });

  it("Should enable donating ENS name without a bounty", async () => {
    // Impersonate ENS holder
    const ENSHolderSigner = await impersonateSigner(ENSHolder);
    const LootboxContractSigner = LootboxContract.connect(ENSHolderSigner);
    const ENSBaseRegistrar = new ethers.Contract(
      DeployedENSBaseRegistrar,
      ENSBaseRegistrarABI,
      ENSHolderSigner
    );

    await ENSBaseRegistrar.approve(LootboxContractAddress, ethcloutENS);
    await LootboxContractSigner.donateENSName(ethcloutENS);

    const ethcloutENSOwner = await ENSBaseRegistrar.ownerOf(ethcloutENS);

    expect(ethcloutENSOwner).to.equal(LootboxContractAddress);
  });

  it("Should enable donating ENS name with a bounty", async () => {
    // Impersonate Binance
    await impersonateSigner(Binance);

    // Donate to contract with ENS
    await LootboxContract.donateETH(ONE_ETHER, ethcloutENS, {
      value: ONE_ETHER,
    });

    // Impersonate ENS holder
    const ENSHolderSigner = await impersonateSigner(ENSHolder);
    const LootboxContractSigner = LootboxContract.connect(ENSHolderSigner);
    const ENSBaseRegistrar = new ethers.Contract(
      DeployedENSBaseRegistrar,
      ENSBaseRegistrarABI,
      ENSHolderSigner
    );

    await ENSBaseRegistrar.approve(LootboxContractAddress, ethcloutENS);
    await LootboxContractSigner.donateENSName(ethcloutENS);

    const ENSHolderBalance = await provider.getBalance(ENSHolder);
    expect(ENSHolderBalance.gt(ethers.utils.parseEther("100.0")));

    const LootboxBalance = await provider.getBalance(LootboxContractAddress);
    const LootboxDonatedAmount = await LootboxContract.donatedAmount();
    const LootboxBountyAmount = await LootboxContract.bounties(ethcloutENS);

    expect(LootboxBalance.toString()).to.equal("0");
    expect(LootboxDonatedAmount.toString()).to.equal("0");
    expect(LootboxBountyAmount.toString()).to.equal("0");
  });

  it("Should allow withdrawing ENS name by admin", async () => {
    // Impersonate ENS holder
    const ENSHolderSigner = await impersonateSigner(ENSHolder);
    const LootboxContractSigner = LootboxContract.connect(ENSHolderSigner);
    const ENSBaseRegistrar = new ethers.Contract(
      DeployedENSBaseRegistrar,
      ENSBaseRegistrarABI,
      ENSHolderSigner
    );

    await ENSBaseRegistrar.approve(LootboxContractAddress, ethcloutENS);
    await LootboxContractSigner.donateENSName(ethcloutENS);

    const AdminSigner = await impersonateSigner(adminWallet);
    const LootboxContractAdmin = LootboxContract.connect(AdminSigner);
    await LootboxContractAdmin.removeENSName(ethcloutENS, adminWallet);

    const ethcloutENSOwner = await ENSBaseRegistrar.ownerOf(ethcloutENS);

    expect(adminWallet.toLowerCase()).to.equal(ethcloutENSOwner.toLowerCase());
  });

  it("Should revert when withdrawing ENS name by admin without contract owning name", async () => {
    const AdminSigner = await impersonateSigner(adminWallet);
    const LootboxContractAdmin = LootboxContract.connect(AdminSigner);
    const tx = LootboxContractAdmin.removeENSName(ethcloutENS, adminWallet);

    await expect(tx).revertedWith(ERROR_MESSAGES.ENS_NOT_OWNED);
  });

  it("Should allow admins to remove incorrectly donated ETH", async () => {
    // Impersonate Binance
    const binanceSigner = await impersonateSigner(Binance);

    // Send 1,000 ETH directly to contract
    await binanceSigner.sendTransaction({
      to: LootboxContractAddress,
      value: ethers.utils.parseEther("1000.0"),
    });

    const AdminSigner = await impersonateSigner(adminWallet);
    const LootboxContractAdmin = LootboxContract.connect(AdminSigner);
    await LootboxContractAdmin.removeIncorrectlyDonatedETH(adminWallet);

    const AdminBalance = await provider.getBalance(adminWallet);
    expect(AdminBalance.gt(ethers.utils.parseEther("1000.0")));

    const LootboxBalance = await provider.getBalance(LootboxContractAddress);
    expect(LootboxBalance.toString()).to.equal("0");
  });

  it("Should revert when admins try to remove ETH without contract excess", async () => {
    // Impersonate Binance
    await impersonateSigner(Binance);

    // Donate to contract with ENS
    await LootboxContract.donateETH(ONE_ETHER, ethcloutENS, {
      value: ONE_ETHER,
    });

    const AdminSigner = await impersonateSigner(adminWallet);
    const LootboxContractAdmin = LootboxContract.connect(AdminSigner);
    const tx = LootboxContractAdmin.removeIncorrectlyDonatedETH(adminWallet);

    await expect(tx).revertedWith(ERROR_MESSAGES.NO_EXCESS_ETH);
  });
});
