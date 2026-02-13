.PHONY: help install run dev build test migrate migrate-up migrate-down migrate-revision format lint clean docker-build docker-up docker-down docker-logs

# Variables
PYTHON := python
POETRY := poetry
DOCKER_COMPOSE := docker-compose
APP_NAME := env360-backend
DOCKER_IMAGE := $(APP_NAME):latest
PORT := 8000

# Colors for output
GREEN := \033[0;32m
YELLOW := \033[1;33m
NC := \033[0m # No Color

help: ## Show this help message
	@echo "$(GREEN)Available commands:$(NC)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(YELLOW)%-20s$(NC) %s\n", $$1, $$2}'

# =============================================================================
# Development Commands
# =============================================================================

install: ## Install dependencies using Poetry
	@echo "$(GREEN)Installing dependencies...$(NC)"
	$(POETRY) install

install-dev: ## Install dependencies including dev dependencies
	@echo "$(GREEN)Installing dependencies with dev tools...$(NC)"
	$(POETRY) install --with dev,test

setup: install-dev ## Initial setup: install dependencies and configure Poetry
	@echo "$(GREEN)Setting up Poetry...$(NC)"
	@bash setup-poetry.sh || true
	@echo "$(GREEN)Setup complete!$(NC)"

# =============================================================================
# Run Commands
# =============================================================================

run: ## Run the application
	@echo "$(GREEN)Starting application...$(NC)"
	$(POETRY) run uvicorn app.main:app --host 0.0.0.0 --port $(PORT) --reload

dev: ## Run the application in debug mode with hot reload
	@echo "$(GREEN)Starting application in DEBUG mode with hot reload...$(NC)"
	@echo "$(YELLOW)Debug mode: enabled$(NC)"
	@echo "$(YELLOW)Hot reload: enabled$(NC)"
	@echo "$(YELLOW)API docs: http://localhost:$(PORT)/docs$(NC)"
	@echo "$(YELLOW)GraphQL playground: http://localhost:$(PORT)/api/v1/graphql$(NC)"
	DEBUG=true $(POETRY) run uvicorn app.main:app --host 0.0.0.0 --port $(PORT) --reload --log-level debug

run-prod: ## Run the application in production mode
	@echo "$(GREEN)Starting application in production mode...$(NC)"
	$(POETRY) run uvicorn app.main:app --host 0.0.0.0 --port $(PORT) --workers 4

# =============================================================================
# Database Migration Commands
# =============================================================================

migrate: migrate-up ## Alias for migrate-up

migrate-up: ## Run database migrations (upgrade to head)
	@echo "$(GREEN)Running database migrations...$(NC)"
	$(POETRY) run alembic upgrade head

migrate-down: ## Rollback last database migration
	@echo "$(YELLOW)Rolling back last migration...$(NC)"
	$(POETRY) run alembic downgrade -1

migrate-revision: ## Create a new migration (usage: make migrate-revision MESSAGE="description")
	@if [ -z "$(MESSAGE)" ]; then \
		echo "$(YELLOW)Error: MESSAGE is required$(NC)"; \
		echo "Usage: make migrate-revision MESSAGE=\"your migration description\""; \
		exit 1; \
	fi
	@echo "$(GREEN)Creating new migration: $(MESSAGE)$(NC)"
	$(POETRY) run alembic revision --autogenerate -m "$(MESSAGE)"

migrate-history: ## Show migration history
	@echo "$(GREEN)Migration history:$(NC)"
	$(POETRY) run alembic history

migrate-current: ## Show current migration version
	@echo "$(GREEN)Current migration version:$(NC)"
	$(POETRY) run alembic current

# =============================================================================
# Testing Commands
# =============================================================================

test: ## Run all tests
	@echo "$(GREEN)Running tests...$(NC)"
	$(POETRY) run pytest

test-verbose: ## Run tests with verbose output
	@echo "$(GREEN)Running tests with verbose output...$(NC)"
	$(POETRY) run pytest -v

test-coverage: ## Run tests with coverage report
	@echo "$(GREEN)Running tests with coverage...$(NC)"
	$(POETRY) run pytest --cov=app --cov-report=html --cov-report=term

test-file: ## Run tests for a specific file (usage: make test-file FILE=path/to/test_file.py)
	@if [ -z "$(FILE)" ]; then \
		echo "$(YELLOW)Error: FILE is required$(NC)"; \
		echo "Usage: make test-file FILE=tests/test_example.py"; \
		exit 1; \
	fi
	@echo "$(GREEN)Running tests in $(FILE)...$(NC)"
	$(POETRY) run pytest $(FILE)

# =============================================================================
# Code Quality Commands
# =============================================================================

format: ## Format code with black
	@echo "$(GREEN)Formatting code with black...$(NC)"
	$(POETRY) run black app tests

format-check: ## Check code formatting without making changes
	@echo "$(GREEN)Checking code formatting...$(NC)"
	$(POETRY) run black --check app tests

lint: ## Run linters (flake8)
	@echo "$(GREEN)Running linters...$(NC)"
	$(POETRY) run flake8 app --max-line-length=100 --exclude=__pycache__,*.pyc

type-check: ## Run type checking with mypy
	@echo "$(GREEN)Running type checks...$(NC)"
	$(POETRY) run mypy app

check: format-check lint type-check ## Run all checks (format, lint, type-check)

# =============================================================================
# Docker Commands
# =============================================================================

docker-build: ## Build Docker image
	@echo "$(GREEN)Building Docker image...$(NC)"
	docker build -t $(DOCKER_IMAGE) .

docker-up: ## Start Docker containers (PostgreSQL)
	@echo "$(GREEN)Starting Docker containers...$(NC)"
	cd $(shell pwd) && $(DOCKER_COMPOSE) up -d

docker-down: ## Stop Docker containers
	@echo "$(YELLOW)Stopping Docker containers...$(NC)"
	cd $(shell pwd) && $(DOCKER_COMPOSE) down

docker-logs: ## Show Docker container logs
	@echo "$(GREEN)Docker container logs:$(NC)"
	cd $(shell pwd) && $(DOCKER_COMPOSE) logs -f

docker-ps: ## Show running Docker containers
	@echo "$(GREEN)Running Docker containers:$(NC)"
	cd $(shell pwd) && $(DOCKER_COMPOSE) ps

docker-restart: docker-down docker-up ## Restart Docker containers

# =============================================================================
# Database Commands
# =============================================================================

db-up: docker-up ## Start database (alias for docker-up)
	@echo "$(GREEN)Waiting for database to be ready...$(NC)"
	@sleep 3

db-down: docker-down ## Stop database (alias for docker-down)

db-reset: ## Reset database (WARNING: This will delete all data!)
	@echo "$(YELLOW)WARNING: This will delete all database data!$(NC)"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		cd $(shell pwd) && $(DOCKER_COMPOSE) down -v; \
		cd $(shell pwd) && $(DOCKER_COMPOSE) up -d; \
		sleep 5; \
		$(POETRY) run alembic upgrade head; \
		echo "$(GREEN)Database reset complete!$(NC)"; \
	fi

db-shell: ## Open PostgreSQL shell
	@echo "$(GREEN)Opening PostgreSQL shell...$(NC)"
	cd $(shell pwd) && $(DOCKER_COMPOSE) exec postgres psql -U env360 -d env360

# =============================================================================
# Cleanup Commands
# =============================================================================

clean: ## Clean Python cache files
	@echo "$(GREEN)Cleaning Python cache files...$(NC)"
	find . -type d -name "__pycache__" -exec rm -r {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete
	find . -type f -name "*.pyo" -delete
	find . -type d -name "*.egg-info" -exec rm -r {} + 2>/dev/null || true
	@echo "$(GREEN)Clean complete!$(NC)"

clean-all: clean ## Clean cache files and Poetry cache
	@echo "$(GREEN)Cleaning Poetry cache...$(NC)"
	$(POETRY) cache clear pypi --all || true
	@echo "$(GREEN)All clean!$(NC)"

# =============================================================================
# Utility Commands
# =============================================================================

shell: ## Open Python shell with app context
	@echo "$(GREEN)Opening Python shell...$(NC)"
	$(POETRY) run python -c "from app.main import app; import IPython; IPython.embed()" || \
	$(POETRY) run python

env-check: ## Check if .env file exists
	@if [ ! -f .env ]; then \
		echo "$(YELLOW)Warning: .env file not found$(NC)"; \
		echo "Copy env.example to .env and update with your values:"; \
		echo "  cp env.example .env"; \
	else \
		echo "$(GREEN).env file exists$(NC)"; \
	fi

version: ## Show application version
	@echo "$(GREEN)Application version:$(NC)"
	@$(POETRY) run python -c "from app.core.config import settings; print(f'Version: {settings.APP_VERSION}')"

# =============================================================================
# Quick Start Commands
# =============================================================================

quickstart: env-check db-up migrate ## Quick start: check env, start DB, run migrations
	@echo "$(GREEN)Quick start complete!$(NC)"
	@echo "$(GREEN)Run 'make run' to start the application$(NC)"
