# Contracts

## WorkerManager.sol

- Staking: Workers can stake ERC20 tokens (e.g., OCU) via `stake()` and withdraw via `unstake()`.
- Slashing: Any address that holds a ControllerLicense NFT can call `slash(worker, amount, recipient)` to slash misbehaving workers.
- Queries: `stakeOf(worker)` helper.

## ControllerLicense.sol

- Identity: ERC721 NFT to identify controllers.
- Admin: Mint/Burn/Update URI restricted by AccessManager.
- Queries: `isController(account)` helper (equivalent to `balanceOf(account) > 0`).

## OrgRegistry.sol

Use a tree structure to records the relations ships of organizations. 
This contract calculate the fee to use a node. 

## JobManager.sol

- Token escrow for job rewards (ERC20).
- Requires licensed controller for job status updates.
- Requires staked worker (via WorkerManager) to submit solutions.
- Integrates with `OrgRegistry` to compute dynamic fees.

## Deployment Notes

The following constructor arguments are required now:

- `WorkerManager(manager, stakeToken, controllerLicense)`
- `JobManager(manager, token, orgRegistry, controllerLicense, workerManager)`

Grant appropriate roles in `RoleManager/AccessManager` to allow minting controller licenses.

## 
