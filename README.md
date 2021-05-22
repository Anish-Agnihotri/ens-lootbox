# ENS Lootbox

Quick hack inspired by [Mike's tweet about celebrity ENS domain donations](https://twitter.com/mikedemarais/status/1395910410063253505).

## Flow

**Donator Flow**

1. Anyone can send ETH to fund the donation contract.

**ENS Administrator Flow**

1. Can update the desired ENS names looking to be captured.
2. Can attach a `bounty` to the desired ENS names (where `bounty < balance(contract)`).
3. Can withdraw the ENS names sent to the `ENSLootbox` contract to their EOA.

**ENS Celebrity Name Owner Flow**

1. Can check the `bounty` for a desired ENS name.
2. Can send a matching ENS name to the contract and be rewarded `bounty`.
