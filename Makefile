SHELL := /bin/bash

.PHONY: dev-up dev-down deploy-contracts

dev-up:
	bash scripts/dev-up.sh

dev-test:
	bash scripts/e2e-hash-miner.sh

dev-stop:
	docker compose -f docker-compose.dev.yml stop

dev-down:
	docker compose -f docker-compose.dev.yml down

dev-down-all:
	docker compose -f docker-compose.dev.yml down -v

dev-build:
	docker compose -f docker-compose.dev.yml build

dev-build-new:
	docker compose -f docker-compose.dev.yml build --no-cache
