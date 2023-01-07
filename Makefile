SHELL := /bin/bash

.DEFAULT_GOAL := help
.PHONY: help
help:
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)


up: ## Run a local development environment with Docker Compose.
	npm run start:dev

down: ## Stop the Docker Compose local development environment.
	@docker compose down  

recreate: ## Recreate and run development docker compose
	@docker compose up --build --force-recreate && npm run start:dev

clean: ## Clean Docker Compose local development environment.
	@docker compose down --remove-orphans --volumes

.PHONY: test
test: ## Run tests
	@npm test

fmt: ## Format code
	@npm run format

lint: ## Run static analysis
	@npm run lint

check: ## Run all checks for this project
	@npm run format:check
	@npm run lint
	@npm run test
	@npm run build
