from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Callable, Awaitable
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.models.versioning import (
    DeploymentQueue, DeploymentQueueStatus,
    ServiceVersion, Deployment, DeploymentStatus,
    DeploymentStepCheckpoint, DeploymentEvent,
)
from app.models.service import Service as ServiceModel


async def _checkpoint_step(db: AsyncSession, deployment_id: str, step_name: str, fn: Callable[[], Awaitable[None]]) -> None:
    """Run step if not already checkpointed, using unique constraint for idempotency."""
    # Check existing
    result = await db.execute(
        select(DeploymentStepCheckpoint).where(
            DeploymentStepCheckpoint.deployment_id == deployment_id,
            DeploymentStepCheckpoint.step_name == step_name
        )
    )
    existing = result.scalar_one_or_none()
    if existing:
        return
    # Run step, then write checkpoint
    await fn()
    db.add(DeploymentStepCheckpoint(deployment_id=deployment_id, step_name=step_name))
    await db.flush()


def _mk_deploy_name(base: str, version_label: str) -> str:
    safe = base.replace('/', '-').replace('_', '-')
    return f"{safe}-{version_label}"


async def process_one(db: AsyncSession, worker_id: str) -> bool:
    """Process one queued deployment if available. Returns True if processed or claimed, else False."""
    # Find one pending item not locked; using simple filter; in production prefer FOR UPDATE SKIP LOCKED
    result = await db.execute(
        select(DeploymentQueue)
        .where(DeploymentQueue.status == DeploymentQueueStatus.PENDING, DeploymentQueue.locked_by.is_(None))
        .limit(1)
    )
    item = result.scalar_one_or_none()
    if not item:
        return False

    # Lock it
    item.locked_by = worker_id
    item.locked_at = datetime.now(timezone.utc)
    item.status = DeploymentQueueStatus.RUNNING
    item.started_at = datetime.now(timezone.utc)
    await db.commit()

    # Reload in new transaction
    await db.refresh(item)

    # Compute or fetch service
    result = await db.execute(select(ServiceModel).where(ServiceModel.id == item.service_id))
    service = result.scalar_one_or_none()

    # Create version and deployment, then run steps
    try:
        # Step: Add entry in service_versions table
        async def step_version():
            ver = ServiceVersion(
                service_id=item.service_id,
                version_label=item.requested_version_label,
                config_hash="",  # optionally compute later
                spec_json=None,
            )
            db.add(ver)
            await db.flush()
        await _checkpoint_step(db, deployment_id="", step_name="create_version", fn=step_version)  # placeholder deployment_id pre creation

        # After version step, we need version id; fetch it
        ver_res = await db.execute(
            select(ServiceVersion).where(
                ServiceVersion.service_id == item.service_id,
                ServiceVersion.version_label == item.requested_version_label
            )
        )
        version = ver_res.scalar_one()

        # Step: add entry in deployment table
        async def step_deployment():
            dep = Deployment(
                service_id=item.service_id,
                version_id=version.id,
                status=DeploymentStatus.PENDING,
            )
            db.add(dep)
            await db.flush()
        await _checkpoint_step(db, deployment_id="", step_name="create_deployment", fn=step_deployment)

        # fetch deployment id
        dep_res = await db.execute(
            select(Deployment).where(Deployment.version_id == version.id).order_by(Deployment.created_at.desc())
        )
        deployment = dep_res.scalar_one()

        # Now subsequent steps can checkpoint against actual deployment_id
        async def step_prepare_k8s():
            deploy_name = _mk_deploy_name(service.name if service else "service", version.version_label)
            deployment_yaml = f"apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: {deploy_name}\n"
            route_name = f"{deploy_name}-route"
            route_yaml = f"apiVersion: networking.istio.io/v1beta1\nkind: VirtualService\nmetadata:\n  name: {route_name}\n"
            db.add(DeploymentEvent(deployment_id=deployment.id, event_type="render", message="Rendered manifests"))
            setattr(deployment, "_rendered_deployment_yaml", deployment_yaml)  # temp attach
            setattr(deployment, "_rendered_route_yaml", route_yaml)
        await _checkpoint_step(db, deployment.id, "prepare_manifests", step_prepare_k8s)

        async def step_apply_deploy():
            # TODO: integrate with Kubernetes client; for now, log
            db.add(DeploymentEvent(deployment_id=deployment.id, event_type="apply", message="Applied deployment"))
        await _checkpoint_step(db, deployment.id, "apply_deployment", step_apply_deploy)

        async def step_apply_route():
            db.add(DeploymentEvent(deployment_id=deployment.id, event_type="apply", message="Applied route"))
        await _checkpoint_step(db, deployment.id, "apply_route", step_apply_route)

        async def step_get_events():
            db.add(DeploymentEvent(deployment_id=deployment.id, event_type="events", message="Fetched deployment events"))
        await _checkpoint_step(db, deployment.id, "get_deployment_events", step_get_events)

        async def step_get_route():
            db.add(DeploymentEvent(deployment_id=deployment.id, event_type="events", message="Fetched route details"))
        await _checkpoint_step(db, deployment.id, "get_route_details", step_get_route)

        # finalize success
        deployment.status = DeploymentStatus.SUCCEEDED
        deployment.completed_at = datetime.now(timezone.utc)
        item.status = DeploymentQueueStatus.SUCCEEDED
        item.completed_at = datetime.now(timezone.utc)
        await db.commit()
    except Exception as e:
        # Record failure
        db.add(DeploymentEvent(deployment_id=deployment.id if 'deployment' in locals() else "", event_type="error", message=str(e)))
        if 'deployment' in locals():
            deployment.status = DeploymentStatus.FAILED
            deployment.completed_at = datetime.now(timezone.utc)
        item.status = DeploymentQueueStatus.FAILED
        item.completed_at = datetime.now(timezone.utc)
        await db.commit()
    return True


async def run_worker(session_factory: Callable[[], AsyncSession], worker_id: str = "web-1", poll_interval: float = 2.0):
    """Background loop to process deployment queue."""
    while True:
        async with session_factory() as db:
            processed = await process_one(db, worker_id)
        if not processed:
            await asyncio.sleep(poll_interval)

