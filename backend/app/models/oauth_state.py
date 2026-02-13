"""
OAuth state model for storing OAuth flow state
"""
from typing import Optional
from datetime import datetime
from sqlalchemy import String, DateTime, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
from app.core.database import Base


class OAuthState(Base):
    """OAuth state model for storing OAuth authorization flow state"""
    
    __tablename__ = "oauth_states"
    
    state: Mapped[str] = mapped_column(String, primary_key=True, index=True)
    redirect_uri: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)
    
    def __repr__(self):
        return f"<OAuthState {self.state[:8]}...>"
