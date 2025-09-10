# OursGPU-CS-project
A project for the Computer Science and Engineering Projects course in NYCU.

This is a DePIN project that aims to help organizations share their computing resources.

## Dev EVM Chain and Wallets

For local blockchain development, an Anvil (Foundry) node runs alongside the controller and workers in Docker Compose. Each service gets its own funded wallet derived from a shared mnemonic.

- Compose services: `anvil`, `controller1`, `worker1`, `worker2`
- RPC URL: `http://anvil:8545` (reachable from containers) / `http://localhost:8545` (host)
- Chain ID: `31337`
- Mnemonic: `test test test test test test test test test test test junk`
- Wallet indexes: controller1=`0`, worker1=`1`, worker2=`2`

Run in development (hot-reload for Node apps):

```
docker compose -f docker-compose.dev.yml up --build
```

Run the lean (non-dev) stack:

```
docker compose up --build
```

On startup, controller and workers log their EVM address, chainId and balance. You can also hit `GET http://localhost:3000/wallet` to see the controller wallet address and chain.

To customize wallets or connect to a different chain, set in your environment (or Compose):

- `CHAIN_RPC_URL` (e.g., `http://anvil:8545`)
- `CHAIN_ID` (e.g., `31337`)
- Either `WALLET_PRIVATE_KEY` or `WALLET_MNEMONIC` + `WALLET_INDEX`

## One-command local bootstrap (chain + contracts + services)

Use the helper script to bring up Anvil/Postgres/Minio, deploy the Solidity contracts with Foundry, and then start the controller and workers with the deployed addresses injected into their environment:

```
make dev-up
# or
bash scripts/dev-up.sh
```

It writes contract addresses to `ours-gpu/.env.contracts`, which Docker Compose mounts into `controller1`, `worker1`, and `worker2`. The following variables are set:

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
