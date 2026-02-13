.PHONY: help install install-dev dev build prod lint format format-write typecheck test test-ci preview clean docker-build docker-up docker-down docker-logs docker-restart

# Variables
NPM := npm
DOCKER_COMPOSE := docker-compose
APP_NAME := env360-frontend
DOCKER_IMAGE := $(APP_NAME):latest
PORT := 5173
PREVIEW_PORT := 4173

# Colors for output
GREEN := \033[0;32m
YELLOW := \033[1;33m
BLUE := \033[0;34m
NC := \033[0m # No Color

help: ## Show this help message
	@echo "$(GREEN)Available commands:$(NC)"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  $(YELLOW)%-20s$(NC) %s\n", $$1, $$2}'

# =============================================================================
# Development Commands
# =============================================================================

install: ## Install dependencies
	@echo "$(GREEN)Installing dependencies...$(NC)"
	$(NPM) install

install-dev: install ## Install dependencies (alias for install)
	@echo "$(GREEN)Dependencies installed$(NC)"

# =============================================================================
# Run Commands
# =============================================================================

dev: ## Run development server with hot reload
	@echo "$(GREEN)Starting development server...$(NC)"
	@echo "$(YELLOW)Hot reload: enabled$(NC)"
	@echo "$(YELLOW)Local: http://localhost:$(PORT)$(NC)"
	@echo "$(YELLOW)Press Ctrl+C to stop$(NC)"
	$(NPM) run dev

build: ## Build for production
	@echo "$(GREEN)Building for production...$(NC)"
	$(NPM) run build
	@echo "$(GREEN)Build complete! Output in $(BLUE)dist/$(NC)"

prod: build preview ## Build and preview production build
	@echo "$(GREEN)Production build ready!$(NC)"

preview: ## Preview production build locally
	@echo "$(GREEN)Starting preview server...$(NC)"
	@echo "$(YELLOW)Preview: http://localhost:$(PREVIEW_PORT)$(NC)"
	@echo "$(YELLOW)Press Ctrl+C to stop$(NC)"
	$(NPM) run preview -- --port $(PREVIEW_PORT)

# =============================================================================
# Quality Commands
# =============================================================================

lint: ## Run ESLint
	@echo "$(GREEN)Running ESLint...$(NC)"
	$(NPM) run lint

format: ## Check code formatting with Prettier
	@echo "$(GREEN)Checking code formatting...$(NC)"
	$(NPM) run format

format-write: ## Format code with Prettier
	@echo "$(GREEN)Formatting code...$(NC)"
	$(NPM) run format:write
	@echo "$(GREEN)Formatting complete!$(NC)"

typecheck: ## Run TypeScript type checking
	@echo "$(GREEN)Running TypeScript type check...$(NC)"
	$(NPM) run typecheck

# =============================================================================
# Test Commands
# =============================================================================

test: ## Run tests in watch mode
	@echo "$(GREEN)Running tests in watch mode...$(NC)"
	@echo "$(YELLOW)Press Ctrl+C to stop$(NC)"
	$(NPM) run test

test-ci: ## Run tests in CI mode with coverage
	@echo "$(GREEN)Running tests in CI mode with coverage...$(NC)"
	$(NPM) run test:ci

# =============================================================================
# Docker Commands
# =============================================================================

docker-build: ## Build Docker image
	@echo "$(GREEN)Building Docker image...$(NC)"
	docker build -t $(DOCKER_IMAGE) .
	@echo "$(GREEN)Docker image built: $(BLUE)$(DOCKER_IMAGE)$(NC)"

docker-up: ## Run Docker container
	@echo "$(GREEN)Starting Docker container...$(NC)"
	docker run -d -p $(PORT):80 --name $(APP_NAME) $(DOCKER_IMAGE)
	@echo "$(GREEN)Container started: $(BLUE)http://localhost:$(PORT)$(NC)"

docker-down: ## Stop and remove Docker container
	@echo "$(GREEN)Stopping Docker container...$(NC)"
	-docker stop $(APP_NAME)
	-docker rm $(APP_NAME)
	@echo "$(GREEN)Container stopped and removed$(NC)"

docker-logs: ## View Docker container logs
	@echo "$(GREEN)Docker container logs:$(NC)"
	docker logs -f $(APP_NAME)

docker-restart: docker-down docker-up ## Restart Docker container

# =============================================================================
# Cleanup Commands
# =============================================================================

clean: ## Remove build artifacts and dependencies
	@echo "$(GREEN)Cleaning build artifacts...$(NC)"
	rm -rf dist
	rm -rf node_modules
	@echo "$(GREEN)Clean complete!$(NC)"

clean-build: ## Remove only build artifacts
	@echo "$(GREEN)Cleaning build artifacts...$(NC)"
	rm -rf dist
	@echo "$(GREEN)Build artifacts removed$(NC)"

clean-deps: ## Remove only node_modules
	@echo "$(GREEN)Removing node_modules...$(NC)"
	rm -rf node_modules
	@echo "$(GREEN)node_modules removed$(NC)"

# =============================================================================
# Utility Commands
# =============================================================================

check: typecheck lint format ## Run all checks (typecheck, lint, format)
	@echo "$(GREEN)All checks passed!$(NC)"

ci: install check test-ci build ## Run CI pipeline (install, check, test, build)
	@echo "$(GREEN)CI pipeline complete!$(NC)"
