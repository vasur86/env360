"""
Kubernetes Cluster model
"""
from typing import Optional
from datetime import datetime
from sqlalchemy import String, DateTime, UniqueConstraint, Enum
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func
from app.core.database import Base
import uuid
import enum
from app.models.environment import EnvironmentType, EnvironmentTypeEnum


class KubeAuthMethod(str, enum.Enum):
    KUBECONFIG = "kubeconfig"
    TOKEN = "token"
    SERVICE_ACCOUNT = "serviceAccount"
    CLIENT_CERT = "clientCert"


class KubernetesCluster(Base):
    """
    Admin-managed Kubernetes cluster connection.
    Secrets (kubeconfig, token, certs) are stored as strings for now.
    """
    __tablename__ = "kubernetes_clusters"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String, nullable=False, unique=True, index=True)
    description: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    api_url: Mapped[str] = mapped_column(String, nullable=False)
    auth_method: Mapped[KubeAuthMethod] = mapped_column(Enum(KubeAuthMethod), nullable=False, index=True)
    # Optional environment type tag to classify the cluster (development, staging, production, etc.)
    environment_type: Mapped[Optional[EnvironmentType]] = mapped_column(EnvironmentTypeEnum, nullable=True, index=True)
    kubeconfig_content: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    token: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    client_key: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    client_cert: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    client_ca_cert: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now(), nullable=True)

    __table_args__ = (
        UniqueConstraint('name', name='uq_kube_cluster_name'),
    )

