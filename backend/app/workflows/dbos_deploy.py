import os
from typing import Optional
from dbos import DBOS, DBOSConfig, Queue, DBOSClient
import threading
from sqlalchemy import select
from app.models.service import Service as ServiceModel
from app.models.versioning import ServiceVersion as ServiceVersionModel
from app.models.config import ServiceConfig as ServiceConfigModel, EnvironmentConfig as EnvironmentConfigModel
from app.models.variable import EnvironmentVariable as EnvironmentVariableModel, VariableScope
from app.models.variable import Secret as SecretModel
from app.models.versioning import ServiceVersion, Deployment, DeploymentStatus
from app.models.project import Project as ProjectModel
from app.models.environment import Environment as EnvironmentModel
from app.models.cluster import KubernetesCluster as KubernetesClusterModel
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from fastapi.encoders import jsonable_encoder
import json
import hashlib

# Ordered list of all workflow steps – stored in the deployment record
# so the frontend can build the timeline dynamically.
DEPLOY_STEPS = [
    {"label": "Verify Deployment Details",      "fn": "get_deployment",              "desc": "Validate deployment record"},
    {"label": "Resolve Environment",            "fn": "get_environment_name",        "desc": "Load environment name for routing"},
    {"label": "Verify Service Details",          "fn": "get_service_details",         "desc": "Validate service configuration"},
    {"label": "Generate Kubernetes Manifests",   "fn": "render_manifests",            "desc": "Render manifests for resources"},
    {"label": "Create Namespace",                "fn": "create_namespace",            "desc": "Apply and wait for namespace to be Active"},
    {"label": "Create ServiceAccount",           "fn": "create_service_account",      "desc": "Apply and wait for service account"},
    {"label": "Create Deployment",               "fn": "create_deployment",           "desc": "Apply and wait for all replicas available"},
    {"label": "Create Service",                  "fn": "create_service",              "desc": "Apply K8s Service resource"},
    {"label": "Create DestinationRule",          "fn": "create_destination_rule",     "desc": "Apply Istio DestinationRule subsets"},
    {"label": "Create VirtualService (Mesh)",    "fn": "create_virtual_service_mesh", "desc": "Apply source→dest VirtualService"},
    {"label": "Create VirtualService (External)","fn": "create_virtual_service_ext",  "desc": "Apply external gateway VirtualService"},
]

from app.core.k8s.manifest import (
    render_deployment_yaml, render_namespace_manifest, render_service_account_yaml as manifest_render_sa,
    render_service_yaml, render_route_yaml,
    render_destination_rule, render_virtual_service_source_dest, render_virtual_service_external,
    render_certificate_manifest, render_gateway_manifest,
)
from app.core.k8s.apply import apply_manifest, poll_resource_ready


# Steps
@DBOS.step()
async def add_service_version(service_id: str, version_label: str, service_details: dict) -> str:
    print(f"Add version {version_label} for service {service_id}")
    # Create a new service version record
    async with AsyncSessionLocal() as db:
        # Deterministic JSON and SHA-256 hash of service_details        
        spec_json_str = json.dumps(service_details or {}, sort_keys=True, separators=(",", ":"))
        cfg_hash = hashlib.sha256(spec_json_str.encode("utf-8")).digest().hex()
        version = ServiceVersion(
            service_id=service_id,
            version_label=version_label,
            config_hash=cfg_hash,
            spec_json=spec_json_str,
        )
        db.add(version)
        await db.commit()
        # Return the newly created version ID
        return str(version.id)
    

@DBOS.step()
async def render_manifests(service_details: dict, deployment_id: str, env_name: str = "", downstream_overrides: list | None = None) -> dict:
    version_label = service_details.get("version")
    lane_id = service_details.get("lane_id", "")
    print(f"Rendering Kubernetes manifests for service {service_details.get('name')}:{version_label}")
    manifests: dict = {
        "namespace": render_namespace_manifest(service_details),
        "deployment": render_deployment_yaml(service_details, version_label, deployment_id),
        "service_account": manifest_render_sa(service_details, version_label, deployment_id),
        "service": render_service_yaml(service_details, version_label, deployment_id),
        # Istio lane routing replaces HTTPRoute
        "destination_rules": render_destination_rule(
            service_details, version_label, deployment_id,
            downstream_overrides=downstream_overrides,
        ),
        "virtual_services_mesh": render_virtual_service_source_dest(
            service_details, version_label, deployment_id,
            lane_id=lane_id,
            downstream_overrides=downstream_overrides,
        ),
        "virtual_service_ext": render_virtual_service_external(
            service_details, version_label, deployment_id,
            env_name=env_name,
        ),
        # Keep HTTPRoute for non-Istio environments (gateway API)
        "route": render_route_yaml(service_details, version_label, deployment_id, env_name=env_name),
    }
    print(f"Manifests: {manifests}")
    return manifests


@DBOS.step()
async def get_environment_name(environment_id: str) -> str:
    """Load environment name by id."""
    if not environment_id:
        return ""
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(EnvironmentModel).where(EnvironmentModel.id == environment_id))
        env = res.scalar_one_or_none()
        return env.name if env else ""


@DBOS.step()
async def get_deployment(deployment_id: str) -> Deployment:
    """Load deployment by id or raise."""
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(Deployment).where(Deployment.id == deployment_id))
        dep = res.scalar_one()
        return dep

async def _load_cluster_for_deployment(deployment_id: str):
    """Load the KubernetesCluster model for a deployment's environment."""
    async with AsyncSessionLocal() as db:
        dep_res = await db.execute(select(Deployment).where(Deployment.id == deployment_id))
        dep = dep_res.scalar_one_or_none()
        if not dep or not dep.environment_id:
            raise Exception(f"Deployment {deployment_id} has no environment_id")
        env_res = await db.execute(select(EnvironmentModel).where(EnvironmentModel.id == dep.environment_id))
        env = env_res.scalar_one_or_none()
        if not env or not env.cluster_id:
            raise Exception(f"Environment {dep.environment_id} has no cluster mapped")
        cluster_res = await db.execute(select(KubernetesClusterModel).where(KubernetesClusterModel.id == env.cluster_id))
        cluster = cluster_res.scalar_one_or_none()
        if not cluster:
            raise Exception(f"Cluster {env.cluster_id} not found")
        return cluster


POLL_TIMEOUT = 300  # 5 minutes
POLL_INTERVAL = 10  # seconds


@DBOS.step()
async def create_namespace(manifests: dict, deployment_id: str) -> dict:
    """Apply the namespace manifest and poll until Active."""
    ns_manifest = manifests.get("namespace")
    if not ns_manifest:
        return {"skipped": True, "reason": "No namespace manifest"}
    cluster = await _load_cluster_for_deployment(deployment_id)
    ok, msg = await apply_manifest(ns_manifest, cluster=cluster)
    if not ok:
        raise Exception(f"create_namespace failed: {msg}")
    ok, poll_msg = await poll_resource_ready(ns_manifest, cluster=cluster, timeout_seconds=POLL_TIMEOUT, poll_interval=POLL_INTERVAL)
    if not ok:
        raise Exception(f"namespace not ready: {poll_msg}")
    return {"ok": True, "applied": msg, "status": poll_msg}


@DBOS.step()
async def create_service_account(manifests: dict, deployment_id: str) -> dict:
    """Apply the ServiceAccount manifest and poll until it exists."""
    sa_manifest = manifests.get("service_account")
    if not sa_manifest:
        return {"skipped": True, "reason": "No service_account manifest"}
    cluster = await _load_cluster_for_deployment(deployment_id)
    ok, msg = await apply_manifest(sa_manifest, cluster=cluster)
    if not ok:
        raise Exception(f"create_service_account failed: {msg}")
    ok, poll_msg = await poll_resource_ready(sa_manifest, cluster=cluster, timeout_seconds=POLL_TIMEOUT, poll_interval=POLL_INTERVAL)
    if not ok:
        raise Exception(f"service account not ready: {poll_msg}")
    return {"ok": True, "applied": msg, "status": poll_msg}


@DBOS.step()
async def create_volumes(manifests: dict, deployment_id: str) -> dict:
    """Apply volume/PVC manifests to the target cluster."""
    vol_manifest = manifests.get("volumes")
    if not vol_manifest:
        return {"skipped": True, "reason": "No volumes manifest"}
    cluster = await _load_cluster_for_deployment(deployment_id)
    ok, msg = await apply_manifest(vol_manifest, cluster=cluster)
    if not ok:
        raise Exception(f"create_volumes failed: {msg}")
    return {"ok": ok, "message": msg}


@DBOS.step()
async def create_secrets(manifests: dict, deployment_id: str) -> dict:
    """Apply Kubernetes Secrets manifests to the target cluster."""
    sec_manifest = manifests.get("secrets")
    if not sec_manifest:
        return {"skipped": True, "reason": "No secrets manifest"}
    cluster = await _load_cluster_for_deployment(deployment_id)
    ok, msg = await apply_manifest(sec_manifest, cluster=cluster)
    if not ok:
        raise Exception(f"create_secrets failed: {msg}")
    return {"ok": ok, "message": msg}


@DBOS.step()
async def create_deployment(manifests: dict, deployment_id: str) -> dict:
    """Apply the Deployment manifest and poll until all replicas available."""
    dep_manifest = manifests.get("deployment")
    if not dep_manifest:
        return {"skipped": True, "reason": "No deployment manifest"}
    cluster = await _load_cluster_for_deployment(deployment_id)
    ok, msg = await apply_manifest(dep_manifest, cluster=cluster)
    if not ok:
        raise Exception(f"create_deployment failed: {msg}")
    ok, poll_msg = await poll_resource_ready(dep_manifest, cluster=cluster, timeout_seconds=POLL_TIMEOUT, poll_interval=POLL_INTERVAL)
    if not ok:
        raise Exception(f"deployment not ready: {poll_msg}")
    return {"ok": True, "applied": msg, "status": poll_msg}


@DBOS.step()
async def create_subdomain(manifests: dict, deployment_id: str) -> dict:
    """Apply the subdomain / VirtualService host manifest."""
    sub_manifest = manifests.get("subdomain")
    if not sub_manifest:
        return {"skipped": True, "reason": "No subdomain manifest"}
    cluster = await _load_cluster_for_deployment(deployment_id)
    ok, msg = await apply_manifest(sub_manifest, cluster=cluster)
    if not ok:
        raise Exception(f"create_subdomain failed: {msg}")
    return {"ok": ok, "message": msg}


@DBOS.step()
async def create_certificate(manifests: dict, deployment_id: str) -> dict:
    """Apply the TLS Certificate manifest."""
    cert_manifest = manifests.get("certificate")
    if not cert_manifest:
        return {"skipped": True, "reason": "No certificate manifest"}
    cluster = await _load_cluster_for_deployment(deployment_id)
    ok, msg = await apply_manifest(cert_manifest, cluster=cluster)
    if not ok:
        raise Exception(f"create_certificate failed: {msg}")
    return {"ok": ok, "message": msg}


@DBOS.step()
async def create_service(manifests: dict, deployment_id: str) -> dict:
    """Apply the Kubernetes Service manifest and poll until ready."""
    svc_manifest = manifests.get("service")
    if not svc_manifest:
        return {"skipped": True, "reason": "No service manifest"}
    cluster = await _load_cluster_for_deployment(deployment_id)
    ok, msg = await apply_manifest(svc_manifest, cluster=cluster)
    if not ok:
        raise Exception(f"create_service failed: {msg}")
    ok, poll_msg = await poll_resource_ready(svc_manifest, cluster=cluster, timeout_seconds=POLL_TIMEOUT, poll_interval=POLL_INTERVAL)
    if not ok:
        raise Exception(f"service not ready: {poll_msg}")
    return {"ok": True, "applied": msg, "status": poll_msg}


@DBOS.step()
async def create_destination_rule(manifests: dict, deployment_id: str) -> dict:
    """Apply all DestinationRule manifests (one per host with version subsets)."""
    dr_list = manifests.get("destination_rules", [])
    if not dr_list:
        return {"skipped": True, "reason": "No destination rules to apply"}
    cluster = await _load_cluster_for_deployment(deployment_id)
    results = []
    for dr in dr_list:
        ok, msg = await apply_manifest(dr, cluster=cluster)
        if not ok:
            raise Exception(f"create_destination_rule failed: {msg}")
        results.append({"name": dr["metadata"]["name"], "ok": ok, "message": msg})
    return {"ok": True, "applied": results}


@DBOS.step()
async def create_virtual_service_mesh(manifests: dict, deployment_id: str) -> dict:
    """Apply all source→dest (mesh-internal) VirtualService manifests."""
    vs_list = manifests.get("virtual_services_mesh", [])
    if not vs_list:
        return {"skipped": True, "reason": "No mesh VirtualServices (no downstream overrides)"}
    cluster = await _load_cluster_for_deployment(deployment_id)
    results = []
    for vs in vs_list:
        ok, msg = await apply_manifest(vs, cluster=cluster)
        if not ok:
            raise Exception(f"create_virtual_service_mesh failed: {msg}")
        results.append({"name": vs["metadata"]["name"], "ok": ok, "message": msg})
    return {"ok": True, "applied": results}


@DBOS.step()
async def create_virtual_service_ext(manifests: dict, deployment_id: str) -> dict:
    """Apply the external gateway VirtualService manifest."""
    vs_ext = manifests.get("virtual_service_ext")
    if not vs_ext:
        return {"skipped": True, "reason": "No external VirtualService manifest"}
    cluster = await _load_cluster_for_deployment(deployment_id)
    ok, msg = await apply_manifest(vs_ext, cluster=cluster)
    if not ok:
        raise Exception(f"create_virtual_service_ext failed: {msg}")
    return {"ok": True, "applied": msg}



@DBOS.step()
async def get_latest_version_label(service_id: str) -> str:
    print(f"Getting latest version label for service {service_id}")
    async with AsyncSessionLocal() as db:
        res = await db.execute(
            select(ServiceVersion)
            .where(ServiceVersion.service_id == service_id)
            .order_by(ServiceVersion.created_at.desc())
        )
        latest = res.scalars().first()
        def parse_num(v: Optional[str]) -> int:
            if not v:
                return 0
            try:
                return int(str(v).lstrip('vV'))
            except Exception:
                return 0
        next_num = parse_num(getattr(latest, "version_label", None)) + 1
        return f"v{max(1, next_num)}"

@DBOS.step()
async def get_service_details(version_id: str) -> dict:
    print(f"Getting service details for version {version_id}")
    spec = {}
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(ServiceVersionModel).where(ServiceVersionModel.id == version_id))
        version = res.scalar_one_or_none()
        if not version:
            raise Exception(f"Version not found: {version_id}")
        # ensure "version" is a plain dict, not a single-element tuple        
        spec = json.loads(version.spec_json) if version.spec_json else {}
        spec["version"] = version.version_label        
        print(f"Service details: {spec}")
        return spec

# Workflow
@DBOS.workflow(name="deploy_workflow")
async def deploy_workflow(deployment_id: str):    
    deployment = await get_deployment(deployment_id)
    env_name = await get_environment_name(deployment.environment_id)
    service_details = await get_service_details(deployment.version_id)
    # Downstream version overrides stored on the deployment record
    downstream_overrides = getattr(deployment, "downstream_overrides", None) or []
    manifests = await render_manifests(
        service_details, deployment_id,
        env_name=env_name,
        downstream_overrides=downstream_overrides,
    )
    namespace_out = await create_namespace(manifests, deployment_id)
    service_account_out = await create_service_account(manifests, deployment_id)
    deployment_out = await create_deployment(manifests, deployment_id)
    service_out = await create_service(manifests, deployment_id)
    dr_out = await create_destination_rule(manifests, deployment_id)
    vs_mesh_out = await create_virtual_service_mesh(manifests, deployment_id)
    vs_ext_out = await create_virtual_service_ext(manifests, deployment_id)


# Ordered list of workflow steps for environment subdomain setup
SETUP_ENV_STEPS = [
    {"label": "Save Domain Info",           "fn": "save_domain_info",             "desc": "Persist domain details and load environment info"},
    {"label": "Generate Manifests",          "fn": "render_env_manifests",         "desc": "Render Certificate and Gateway manifests"},
    {"label": "Apply Certificate",           "fn": "apply_env_certificate",        "desc": "Apply Certificate and wait for readiness"},
    {"label": "Apply Gateway",              "fn": "apply_env_gateway",            "desc": "Apply Gateway and wait for readiness"},
]


@DBOS.step()
async def save_domain_info(environment_id: str) -> dict:
    """
    First step: resolve environment + project details, persist domain_info
    in the environment_configs table, and return everything the later steps need.
    """
    from app.core.k8s.manifest import _normalize_name

    async with AsyncSessionLocal() as db:
        env = (
            await db.execute(
                select(EnvironmentModel).where(EnvironmentModel.id == environment_id)
            )
        ).scalar_one_or_none()
        if not env:
            raise Exception(f"Environment {environment_id} not found")
        project = (
            await db.execute(
                select(ProjectModel).where(ProjectModel.id == env.project_id)
            )
        ).scalar_one_or_none()
        if not project:
            raise Exception(f"Project {env.project_id} not found for environment {environment_id}")

        env_seg = _normalize_name(env.name)
        proj_seg = _normalize_name(project.name)
        domain_info = {
            "project_name": proj_seg,
            "environment_name": env_seg,
        }

        # Upsert domain_info in environment_configs
        existing = (
            await db.execute(
                select(EnvironmentConfigModel).where(
                    EnvironmentConfigModel.environment_id == environment_id,
                    EnvironmentConfigModel.key == "domain_info",
                )
            )
        ).scalar_one_or_none()
        if existing:
            existing.value = json.dumps(domain_info)
            existing.config_data = domain_info
        else:
            db.add(EnvironmentConfigModel(
                environment_id=environment_id,
                key="domain_info",
                value=json.dumps(domain_info),
                config_data=domain_info,
            ))
        await db.commit()

        # Load all environment config entries for reference
        all_configs = (
            await db.execute(
                select(EnvironmentConfigModel).where(
                    EnvironmentConfigModel.environment_id == environment_id,
                )
            )
        ).scalars().all()
        domain_info_entries = [
            {"key": c.key, "value": c.value, "config_data": c.config_data}
            for c in all_configs
        ]

    return {
        "environment_id": environment_id,
        "environment_name": env.name,
        "project_name": project.name,
        "cluster_id": env.cluster_id,
        "domain_info_entries": domain_info_entries,
    }


@DBOS.step()
async def render_env_manifests(env_details: dict) -> dict:
    """Render Certificate + Gateway manifests in one step."""
    env_name = env_details["environment_name"]
    project_name = env_details["project_name"]
    return {
        "certificate": render_certificate_manifest(env_name=env_name, project_name=project_name),
        "gateway": render_gateway_manifest(env_name=env_name, project_name=project_name, listeners=env_details["domain_info_entries"]),
    }


async def _resolve_cluster(cluster_id: str | None):
    """Load a KubernetesCluster by its ID."""
    if not cluster_id:
        return None
    async with AsyncSessionLocal() as db:
        res = await db.execute(
            select(KubernetesClusterModel).where(KubernetesClusterModel.id == cluster_id)
        )
        cluster = res.scalar_one_or_none()
        if not cluster:
            raise Exception(f"Cluster {cluster_id} not found")
        return cluster


@DBOS.step()
async def apply_env_certificate(cert_manifest: dict, cluster_id: str | None) -> dict:
    """Apply the Certificate manifest and poll until ready."""
    cluster = await _resolve_cluster(cluster_id)
    ok, msg = await apply_manifest(cert_manifest, cluster=cluster)
    if not ok:
        raise Exception(f"apply_env_certificate failed: {msg}")
    return {"ok": True, "message": msg}


@DBOS.step()
async def apply_env_gateway(gateway_manifest: dict, cluster_id: str | None) -> dict:
    """Apply the Gateway manifest and poll until ready."""
    cluster = await _resolve_cluster(cluster_id)
    ok, msg = await apply_manifest(gateway_manifest, cluster=cluster)
    if not ok:
        raise Exception(f"apply_env_gateway failed: {msg}")
    return {"ok": True, "message": msg}


@DBOS.workflow(name="setup_env_subdomain")
async def setup_env_subdomain_workflow(environment_id: str):
    """
    Durable workflow to set up Certificate + Gateway for an environment.

    Steps:
    1. Save domain info & resolve environment details
    2. Render Certificate + Gateway manifests
    3. Apply Certificate to the cluster
    4. Apply Gateway to the cluster
    """
    env_details = await save_domain_info(environment_id)
    manifests = await render_env_manifests(env_details)
    cluster_id = env_details.get("cluster_id")
    cert_out = await apply_env_certificate(manifests["certificate"], cluster_id)
    gateway_out = await apply_env_gateway(manifests["gateway"], cluster_id)


# Bootstrap helper
def launch_dbos(system_db_url: Optional[str]):
    Queue(settings.DBOS_WORKFLOW_QUEUE_NAME)
    cfg: DBOSConfig = {
        "name": "env360",
        "system_database_url": system_db_url,
        # Keep everything local-only and quiet at INFO level
        "run_admin_server": False,   # don't start local admin server
        "enable_otlp": False,        # ensure no OTLP exporters are enabled
        "log_level": "INFO",      # suppress INFO hint about connecting to Conductor
        # Intentionally omit conductor_key to avoid any Conductor connection attempts
        # Intentionally omit otlp endpoints to avoid any outbound telemetry
    }
    DBOS(config=cfg)
    DBOS.launch()
    # threading.Event().wait()


def create_dbos_client() -> DBOSClient:
    """
    Factory for DBOSClient using centralized app settings.
    Uses the configured application database URL as the system DB URL in this setup.
    """
    return DBOSClient(
        system_database_url=settings.DATABASE_URL,
        application_database_url=settings.DATABASE_URL,
    )

