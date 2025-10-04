# OursGPU-CS-project
A project for the Computer Science and Engineering Projects course in NYCU.

This is a DePIN project that aims to help organizations share their computing resources.

## Tooling Prerequisites

- Docker Engine with the Compose v2 plugin (confirm with `docker compose version`).
- Foundry toolchain for `forge` and `cast`. Install and update it with:

  ```bash
  curl -L https://foundry.paradigm.xyz | bash
  source ~/.foundry/bin/foundryup
  foundryup
  ```

## One-command local bootstrap (chain + contracts + services)

Use the helper script to bring up Anvil/Postgres/Minio, deploy the Solidity contracts with Foundry, and then start the controller and workers with the deployed addresses injected into their environment:

```
make dev-build
make dev-up
```

It writes contract addresses to `ours-gpu/.env.contracts`, which Docker Compose mounts into `controller1`, `worker1`, `worker2`, and `worker3`. The following variables are set:

- `ACCESS_MANAGER_ADDRESS`
- `OCU_TOKEN_ADDRESS`
- `CONTROLLER_LICENSE_ADDRESS`
- `WORKER_MANAGER_ADDRESS`
- `ORG_REGISTRY_ADDRESS`
- `JOB_MANAGER_ADDRESS`

Tear down the dev stack:

```
make dev-down
```

## Dev EVM Chain and Wallets

For local blockchain development, an Anvil (Foundry) node runs alongside the controller and workers in Docker Compose. Each service gets its own funded wallet derived from a shared mnemonic.

- Compose services: `anvil`, `controller1`, `worker1`, `worker2`, `worker3`
- RPC URL: `http://anvil:8545` (reachable from containers) / `http://localhost:8545` (host)
- Chain ID: `31337`
- Mnemonic: `test test test test test test test test test test test junk`
- Wallet indexes: controller1=`0`, worker1=`1`, worker2=`2`, test user=`3`, worker3=`4`
- Seed org tree: `root -> university1 -> lab1` and `root -> university2 -> lab2`; worker3 is assigned to `lab2`
  - You can import them into MetaMask with the private keys printed in the Anvil logs.
