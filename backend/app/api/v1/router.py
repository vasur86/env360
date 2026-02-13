"""
Main API router - GraphQL based
"""
from fastapi import APIRouter
from app.api.v1 import auth
from app.graphql_api.router import graphql_router

api_router = APIRouter()

# Keep auth routes as REST (OAuth callback needs REST)
api_router.include_router(auth.router, prefix="/auth", tags=["authentication"])

# GraphQL endpoint
api_router.include_router(graphql_router, prefix="/graphql", tags=["graphql"])

