# Env360 Backend API

Production-grade FastAPI backend with OAuth/SSO authentication, AD group authorization, and fine-grained permissions.

## Features

- **OAuth/SSO Authentication**: Microsoft Azure AD integration
- **AD Group Authorization**: Project-level access control via Active Directory groups
- **Fine-grained Permissions**: Resource-level permissions (read, write, delete, admin)
- **Hierarchical Data Model**: Project → Environment → Service
- **Configuration Management**: Project, environment, and service-level configurations
- **PostgreSQL Database**: Relational database with SQLAlchemy ORM
- **GraphQL API**: Flexible query interface with authorization
- **Production Ready**: Docker support, database migrations, comprehensive error handling

## Architecture

### Data Hierarchy
```
Project
  ├── Environment (dev, staging, prod)
  │   └── Service (microservice, webapp, database, queue)
  └── Service (can exist at project level)
```

### Authentication Flow
1. User initiates OAuth login via `/api/v1/auth/login`
2. Redirected to OAuth provider (Azure AD)
3. Callback receives authorization code
4. Exchange code for access token
5. Extract user info and AD groups from token
6. Create/update user in database
7. Generate JWT token for API access

### Authorization Model
- **AD Group Level**: Project access via AD groups (e.g., `env360-project-{project-name}`)
- **Permission Level**: Fine-grained permissions per resource
- **Admin Override**: Admins (via `env360-admins` AD group) have full access

## Setup

### Prerequisites
- Python 3.11+ (recommended: use pyenv)
- PostgreSQL (via Docker or local installation)
- Docker & Docker Compose (optional, for PostgreSQL)

### Installation

1. **Clone and navigate to backend directory**
```bash
cd backend
```

2. **Setup Python 3.11 with pyenv** (recommended)
```bash
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

3. **Install Poetry** (if not already installed)
```bash
curl -sSL https://install.python-poetry.org | python3 -
# Or on macOS: brew install poetry
# Or on Windows: (Invoke-WebRequest -Uri https://install.python-poetry.org -UseBasicParsing).Content | python -
```

4. **Configure Poetry** (create virtual environments automatically)
```bash
# Option 1: Run the setup script
./setup-poetry.sh

# Option 2: Configure manually
poetry config virtualenvs.create true
poetry config virtualenvs.in-project true

# Verify configuration
poetry config --list
```

5. **Install dependencies** (this will create the virtual environment if it doesn't exist)
```bash
poetry install
```

5. **Configure environment variables**
```bash
# Copy the example file to .env
cp env.example .env
# Or if .env.example exists: cp .env.example .env

# Edit .env with your actual values:
# - Update DATABASE_URL with your PostgreSQL connection details
# - Add your Azure AD OAuth credentials
# - Set a strong JWT_SECRET_KEY (generate with: openssl rand -hex 32)
# - Update CORS_ORIGINS with your frontend URLs
```

6. **Start PostgreSQL** (if not using Docker)
```bash
# Follow PostgreSQL installation guide: https://www.postgresql.org/download/
```

7. **Start the server**
```bash
poetry run uvicorn app.main:app --reload
# Or activate the virtual environment first:
# poetry shell
# uvicorn app.main:app --reload
```

### Docker Setup

The `docker-compose.yml` file contains the PostgreSQL service. For local development, use the override file:

1. **Create override file** (if it doesn't exist)
```bash
cp docker-compose.override.yml.example docker-compose.override.yml
# Edit docker-compose.override.yml with your environment variables
```

2. **Start all services** (PostgreSQL + Backend)
```bash
docker-compose up -d
# This automatically merges docker-compose.yml and docker-compose.override.yml
```

3. **Start only PostgreSQL** (without backend)
```bash
docker-compose up -d postgres
```

4. **View logs**
```bash
docker-compose logs -f backend
# or
docker-compose logs -f postgres
```

**Note**: `docker-compose.override.yml` is git-ignored and intended for local development. The base `docker-compose.yml` contains only shared services (PostgreSQL).

## API Documentation

Once the server is running, access:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## API Endpoints

### Authentication
- `GET /api/v1/auth/login` - Initiate OAuth login
- `GET /api/v1/auth/callback` - OAuth callback handler
- `GET /api/v1/auth/me` - Get current user info

### GraphQL API

All data operations are available via GraphQL at `/api/v1/graphql`:

- **Queries**: `users`, `user`, `projects`, `project`, `environments`, `environment`, `services`, `service`
- **Mutations**: `createUser`, `updateUser`, `deleteUser`, `createProject`, `updateProject`, `deleteProject`, etc.

See the GraphQL schema documentation at `/api/v1/graphql` for full details.

## Environment Variables

See `env.example` (or `.env.example` if renamed) for all required environment variables:

- `DATABASE_URL`: PostgreSQL connection string
- `OAUTH_CLIENT_ID`: OAuth client ID
- `OAUTH_CLIENT_SECRET`: OAuth client secret
- `OAUTH_DISCOVERY_URL`: OpenID Connect discovery endpoint (e.g., `https://login.microsoftonline.com/{tenant-id}/.well-known/openid-configuration`)
- `OAUTH_REDIRECT_URI`: OAuth callback URL
- `JWT_SECRET_KEY`: Secret key for JWT tokens
- `AD_ADMIN_GROUP`: AD group name for admins
- `AD_PROJECT_PREFIX`: Prefix for project AD groups

## Database Schema

Database schema is managed using Alembic migrations. Models are defined in `app/models/`.

### Running Migrations
```bash
# Create a new migration
poetry run alembic revision --autogenerate -m "description"

# Apply migrations
poetry run alembic upgrade head

# Rollback migration
poetry run alembic downgrade -1
```

## Development

### Code Formatting
```bash
poetry run black app/
```

### Linting
```bash
poetry run flake8 app/
```

### Type Checking
```bash
poetry run mypy app/
```

### Running Tests
```bash
poetry run pytest
```

### Adding Dependencies
```bash
# Add a production dependency
poetry add package-name

# Add a development dependency
poetry add --group dev package-name

# Add a test dependency
poetry add --group test package-name

# Update all dependencies
poetry update
```

## Production Deployment

1. Set `DEBUG=False` in environment
2. Use strong `JWT_SECRET_KEY`
3. Configure proper CORS origins
4. Use production database (not SQLite)
5. Set up proper logging
6. Use process manager (systemd, supervisor, etc.)
7. Configure reverse proxy (nginx, Traefik, etc.)
8. Enable HTTPS/TLS

## Security Considerations

- All endpoints require authentication (except `/health` and `/auth/*`)
- AD groups are validated on each request
- Permissions are checked at resource level
- JWT tokens expire after configured time
- Use HTTPS in production
- Store secrets in environment variables, not code
- Regularly rotate JWT secret key

## License

[Your License Here]
