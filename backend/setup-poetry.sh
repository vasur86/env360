#!/bin/bash
# Setup script for Poetry configuration
# This script configures Poetry to automatically create virtual environments

set -e

echo "Configuring Poetry..."

# Configure Poetry to create virtual environments automatically
poetry config virtualenvs.create true

# Configure Poetry to create virtual environments in the project directory (.venv)
poetry config virtualenvs.in-project true

echo "Poetry configuration complete!"
echo ""
echo "Current Poetry configuration:"
poetry config --list | grep virtualenvs

echo ""
echo "You can now run 'poetry install' to create the virtual environment and install dependencies."
