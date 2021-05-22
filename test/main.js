const { expect } = require("chai");
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

// Setup contract placeholders
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

/**
 * Deploy contracts at beginning of each test
 */
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

  // Store contract details to global variables
  LootboxContract = contract;
  LootboxContractAddress = contract.address.toString();
}

/**
 * Returns impersonated signer
 * @param {string} account to impersonate
 * @returns {ethers.Signer} authenticated as account
 */
async function impersonateSigner(account) {
  // Impersonate account
  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [account],
  });
  // Return ethers signer
  return await ethers.provider.getSigner(account);
}

describe("ENSLootbox", () => {
  beforeEach(async () => {
    // Reset hardhat forknet
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

    // Deploy contracts
    await deploy();
  });

  it("Should allow donating ETH to an ENS name bounty", async () => {
    // Impersonate Binance
    await impersonateSigner(Binance);

    // Donate to contract with ENS
    await LootboxContract.donateETH(ONE_ETHER, ethcloutENS, {
      value: ONE_ETHER,
    });

    // Collect lootbox balance, donatedAmount, and bounties[ethcloutENS]
    const LootboxBalance = await provider.getBalance(LootboxContractAddress);
    const LootboxDonatedAmount = await LootboxContract.donatedAmount();
    const LootboxBountyAmount = await LootboxContract.bounties(ethcloutENS);

    // Expect contract balance === donatedAmount
    expect(LootboxBalance.toString()).to.equal(LootboxDonatedAmount.toString());
    // Expect donatedAmount === bounties[ethcloutENS]
    expect(LootboxDonatedAmount.toString()).to.equal(
      LootboxBountyAmount.toString()
    );
  });

  it("Should revert donating ETH value does not mach msg.value", async () => {
    // Impersonate Binance
    await impersonateSigner(Binance);

    // Donate to contract with ENS with incorrect value
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

    // Approve contract for transferring ENS
    await ENSBaseRegistrar.approve(LootboxContractAddress, ethcloutENS);
    // Donate ENS with no bounty
    await LootboxContractSigner.donateENSName(ethcloutENS);

    // Collect ENS name owner
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

    // Donate ENS name
    await ENSBaseRegistrar.approve(LootboxContractAddress, ethcloutENS);
    await LootboxContractSigner.donateENSName(ethcloutENS);

    // Ensure bounty paid
    const ENSHolderBalance = await provider.getBalance(ENSHolder);
    expect(ENSHolderBalance.gt(ethers.utils.parseEther("100.0")));

    // Ensure appropriate state changes (nullify bounty)
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

    // DonateENS name
    await ENSBaseRegistrar.approve(LootboxContractAddress, ethcloutENS);
    await LootboxContractSigner.donateENSName(ethcloutENS);

    // Impersonate admin and withdraw ENS name
    const AdminSigner = await impersonateSigner(adminWallet);
    const LootboxContractAdmin = LootboxContract.connect(AdminSigner);
    await LootboxContractAdmin.removeENSName(ethcloutENS, adminWallet);

    // Check ENS name owner
    const ethcloutENSOwner = await ENSBaseRegistrar.ownerOf(ethcloutENS);

    // Ensure ENS name owner is now Admin EOA
    expect(adminWallet.toLowerCase()).to.equal(ethcloutENSOwner.toLowerCase());
  });

  it("Should revert when withdrawing ENS name by admin without contract owning name", async () => {
    // Try to withdraw an ENS name not owned by the contract
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

    // Let admin withdraw 1,000 surplus ETH
    const AdminSigner = await impersonateSigner(adminWallet);
    const LootboxContractAdmin = LootboxContract.connect(AdminSigner);
    await LootboxContractAdmin.removeIncorrectlyDonatedETH(adminWallet);

    // Check Admin balance to see update
    const AdminBalance = await provider.getBalance(adminWallet);
    expect(AdminBalance.gt(ethers.utils.parseEther("1000.0")));

    // Confirm that contract balance is decremented
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

    // Try to collect ETH excess
    const AdminSigner = await impersonateSigner(adminWallet);
    const LootboxContractAdmin = LootboxContract.connect(AdminSigner);
    const tx = LootboxContractAdmin.removeIncorrectlyDonatedETH(adminWallet);

    // Should fail since no excess exists
    await expect(tx).revertedWith(ERROR_MESSAGES.NO_EXCESS_ETH);
  });
});
