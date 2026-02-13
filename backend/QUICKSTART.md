# Quick Start Guide

## Prerequisites
- Python 3.11+ (recommended: use pyenv)
- PostgreSQL (via Docker recommended)
- Azure AD App Registration (for OAuth)

## Setup Steps

### 1. Setup Python 3.11 with pyenv (Recommended)
```bash
cd backend

# Install pyenv (if not already installed)
# macOS: brew install pyenv
# Linux: curl https://pyenv.run | bash
# See: https://github.com/pyenv/pyenv#installation

# Install Python 3.11
pyenv install 3.11

# Set local Python version (this directory will use 3.11)
pyenv local 3.11

# Verify Python version
python --version  # Should show Python 3.11.x
```

**Note**: The project includes a `.python-version` file that pyenv will automatically use. If you don't use pyenv, ensure you have Python 3.11+ installed.

### 2. Install Poetry
```bash
# Install Poetry (if not already installed)
curl -sSL https://install.python-poetry.org | python3 -
# Or on macOS: brew install poetry
# Or on Windows: (Invoke-WebRequest -Uri https://install.python-poetry.org -UseBasicParsing).Content | python -
```

### 3. Configure Poetry
```bash
cd backend

# Option 1: Run the setup script
./setup-poetry.sh

# Option 2: Configure manually
poetry config virtualenvs.create true
poetry config virtualenvs.in-project true
```

### 4. Install Dependencies
```bash
# This will automatically create a .venv virtual environment if it doesn't exist
poetry install
```

### 5. Configure Environment
```bash
# Copy the example file to .env
cp env.example .env
# Or if .env.example exists: cp .env.example .env

# Edit .env with your actual values:
# - DATABASE_URL: PostgreSQL connection string
#   Format: postgresql+asyncpg://user:password@host:port/database
# - OAuth credentials: Azure AD Client ID and Secret
# - JWT_SECRET_KEY: Generate with: openssl rand -hex 32
# - CORS_ORIGINS: Add your frontend URLs (comma-separated)
```

### 6. Setup Docker Compose Override (for local development)
```bash
cp docker-compose.override.yml.example docker-compose.override.yml
# Edit docker-compose.override.yml with your environment variables
```

### 7. Start PostgreSQL
```bash
# Start PostgreSQL service
docker-compose up -d postgres

# Or start everything (PostgreSQL + Backend) if override file exists
docker-compose up -d
```

### 8. Run Database Migrations
```bash
poetry run alembic upgrade head
```

### 9. Start Server
```bash
poetry run uvicorn app.main:app --reload
# Or activate the virtual environment first:
# poetry shell
# uvicorn app.main:app --reload
```

### 10. Access API
- API: http://localhost:8000
- Docs: http://localhost:8000/docs
- Health: http://localhost:8000/health

## OAuth Setup (Azure AD)

1. Register app in Azure Portal
2. Configure redirect URI: `http://localhost:8000/api/v1/auth/callback`
3. Add API permissions:
   - `User.Read`
   - `GroupMember.Read.All`
4. Configure app roles/groups as needed
5. Update `.env` with:
   - `OAUTH_CLIENT_ID`
   - `OAUTH_CLIENT_SECRET`
   - `OAUTH_REDIRECT_URI`

## Testing Authentication

1. Visit: `http://localhost:8000/api/v1/auth/login`
2. Copy `authorization_url` and open in browser
3. Complete OAuth flow
4. Callback will return JWT token
5. Use token in `Authorization: Bearer <token>` header for GraphQL queries

## Project Structure

```
backend/
├── app/
│   ├── api/
│   │   └── v1/
│   │       ├── auth.py          # OAuth authentication
│   │       └── router.py         # Route aggregation
│   ├── graphql/
│   │   ├── schema.py             # GraphQL schema
│   │   ├── resolvers.py          # GraphQL resolvers
│   │   ├── types.py              # GraphQL types
│   │   └── router.py             # GraphQL router
│   ├── core/
│   │   ├── config.py             # Settings
│   │   ├── database.py           # DB connection
│   │   ├── security.py           # JWT utilities
│   │   ├── oauth.py              # OAuth helpers
│   │   └── dependencies.py      # FastAPI dependencies
│   ├── models/                   # Data models (reference)
│   ├── schemas/                  # Pydantic schemas
│   └── main.py                   # FastAPI app
├── pyproject.toml
├── poetry.lock
├── Dockerfile
├── docker-compose.yml            # PostgreSQL service
└── docker-compose.override.yml   # Backend service (local dev, git-ignored)
```

## Common Commands

```bash
# Run server locally (without Docker)
poetry run uvicorn app.main:app --reload

# Start PostgreSQL only
docker-compose up -d postgres

# Start everything (PostgreSQL + Backend)
docker-compose up -d

# View logs
docker-compose logs -f backend
docker-compose logs -f postgres

# Format code
poetry run black app/

# Run tests
poetry run pytest

# Add a new dependency
poetry add package-name

# Add a development dependency
poetry add --group dev package-name

# Update dependencies
poetry update
```
