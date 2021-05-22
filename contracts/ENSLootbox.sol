// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity ^0.8.0;

// ============ Imports ============

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

// ============ Interfaces ============

interface IERC721 {
  // Approve contract to send/receive ENS name
  function approve(address to, uint256 tokenId) external;
  // Check owner of ENS name
  function ownerOf(uint256 tokenId) external view returns (address owner);
  // Transfer ENS name to/from contract
  function safeTransferFrom(address from, address to, uint256 tokenId) external;
}

/**
 * @dev Donation catch-all and bounty setter for ENS names.
 */
contract ENSLootbox is Ownable, IERC721Receiver {
  // Using OpenZeppelin library for SafeMath
  using SafeMath for uint256;

  // ============ Immutable storage ============

  // ENSBaseRegistrar ERC721 contract
  IERC721 public immutable ENSBaseRegistrar = IERC721(0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85);

  // ============ Mutable storage ============

  // Tracks total donated amount
  uint256 public donatedAmount;
  // Tracks mapping between ENS name to bounty
  mapping (uint256 => uint256) public bounties;

  // ============ Events ============

  // ETH donation to Lootbox for a particular ENS name
  event LootboxDonation(address indexed donator, uint256 ensId, uint256 amount);
  // ENS name bounty claim from Lootbox
  event LootboxBountyClaimed(address indexed claimer, uint256 ensId, uint256 amount);
  // ENS name withdrawal by Lootbox admin
  event LootboxNameClaimed(address indexed recipient, uint256 ensId);

  // ============ Functions ============

  // Catch-all donation fallback
  receive() external payable {}

  /**
   * @dev Enables ETH donations to a particular ENS names bounty
   */
  function donateETH(uint256 _value, uint256 _ensId) external payable {
    // Check if ENS name is not already owned by this contract (aka completed bounty)
    require(ENSBaseRegistrar.ownerOf(_ensId) != address(this), "ENSLootbox: ENS name is already owned by lootbox");
    // Sanity check that sent ETH == desired donation value
    require(msg.value == _value, "ENSLootbox: Donation amount does not match spent ETH");

    donatedAmount = donatedAmount.add(_value); // Increment total donated amount
    bounties[_ensId] = bounties[_ensId].add(_value); // Increment bounty for ENS name

    // Emit new donation event
    emit LootboxDonation(msg.sender, _ensId, _value);
  }


  /**
   * @dev Enables donating an ENS name and claiming bounty if it exists (requires approval)
   */
  function donateENSName(uint256 _ensId) external {
    // Sanity check to ensure msg.sender owns ENS name
    require(ENSBaseRegistrar.ownerOf(_ensId) == msg.sender, "ENSLootbox: You do not own this ENS Name");

    // Transfer ENS name from msg.sender to this contract
    ENSBaseRegistrar.safeTransferFrom(msg.sender, address(this), _ensId);

    // If a bounty exists for the donated ENS name
    if (bounties[_ensId] > 0) {
      // Transfer bounty to msg.sender
      (bool sent, ) = payable(msg.sender).call{value: bounties[_ensId]}("");
      require(sent, "ENSLootbox: Failed to pay ENS name bounty");

      // Emit new bounty claimed event
      emit LootboxBountyClaimed(msg.sender, _ensId, bounties[_ensId]);

      // Decrement donated amount and nullify ENS name bounty
      donatedAmount = donatedAmount.sub(bounties[_ensId]);
      bounties[_ensId] = 0;
    }
  }

  /**
   * @dev Enables admin to transfer an ENS name from the contract to a recipient
   */
  function removeENSName(uint256 _ensId, address _recipient) external onlyOwner {
    // Sanity check to ensure that Lootbox does in fact own ENS name to withdraw
    require(ENSBaseRegistrar.ownerOf(_ensId) == address(this), "ENSLootbox: Lootbox does not own ENS name");

    // Transfers ENS name from contract to recipient
    ENSBaseRegistrar.safeTransferFrom(address(this), _recipient, _ensId);

    // Emits a name claim event
    emit LootboxNameClaimed(_recipient, _ensId);
  }

  /**
   * @dev Enables withdrawing accidently sent ETH to a recipient
   */
  function removeIncorrectlyDonatedETH(address payable _recipient) external onlyOwner {
    // Requires that the contract balance be greater than donated amount (aka excess exists)
    require(address(this).balance > donatedAmount, "ENSLootbox: No excess ETH donated");

    // Sends excess ETH to recipient
    (bool sent, ) = _recipient.call{value: address(this).balance.sub(donatedAmount)}("");
    require(sent, "ENSLootbox: Failed to remove incorrectly donated ETH");
  }

  /**
   * @dev Implements IERC721Receiver to safely accept ENS name
   */
  function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data) override external returns (bytes4) {
    return this.onERC721Received.selector;
  }
}