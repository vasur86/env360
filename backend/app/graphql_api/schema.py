"""
GraphQL schema definition with queries and mutations
"""
from typing import List, Optional, Any
import strawberry
from app.graphql_api.types import (
    User, Project, Environment, Service,
    ProjectConfig, EnvironmentConfig, ServiceConfig, AdminConfig,
    EnvironmentVariable, Secret,
    Permission, UserPermission, ResourcePermission, ComputedUserPermission,
    PaginatedProjects, PaginatedEnvironments, PaginatedServices, PaginatedUsers,
    ProjectDetails, EnvironmentDetails, ServiceDetails,
    ServiceVersion, Deployment, WorkflowStatus, WorkflowStepInfo,
    ConnectionTestResult,
    KubernetesCluster as GqlKubernetesCluster,
    ClusterCreateInput, ClusterUpdateInput,
    UserCreateInput, UserUpdateInput,
    ProjectCreateInput, ProjectUpdateInput,
    EnvironmentCreateInput, EnvironmentUpdateInput,
    ServiceCreateInput, ServiceUpdateInput,
    ProjectConfigCreateInput, ProjectConfigUpdateInput,
    EnvironmentConfigCreateInput, ServiceConfigCreateInput, ServiceConfigUpdateInput,
    AdminConfigCreateInput, AdminConfigUpdateInput,
    EnvironmentVariableCreateInput, EnvironmentVariableUpdateInput,
    SecretCreateInput, SecretUpdateInput,
    PermissionCreateInput, UserPermissionCreateInput,
    ResourcePermissionCreateInput, ResourcePermissionUpdateInput,
    GitOrganization, GitRepository,
    DownstreamOverrideInput,
)
from app.graphql_api.resolvers import (
    resolve_users, resolve_projects, resolve_environments, resolve_services,
    model_to_user, model_to_project, model_to_environment, model_to_service,
)
from app.core.dependencies import check_permission, check_resource_permission, can_grant_resource_permission
from app.models.permission import ResourcePermission as ResourcePermissionModel, PermissionScope
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, exists, and_, text
from sqlalchemy.orm import selectinload
from sqlalchemy.exc import IntegrityError
from app.models.user import User as UserModel
from app.models.project import Project as ProjectModel
from app.models.environment import Environment as EnvironmentModel
from app.models.service import Service as ServiceModel
from app.models.config import ProjectConfig as ProjectConfigModel, EnvironmentConfig as EnvironmentConfigModel, ServiceConfig as ServiceConfigModel, AdminConfig as AdminConfigModel
from app.models.versioning import ServiceVersion as ServiceVersionModel, Deployment as DeploymentModel, DeploymentStatus as DeploymentStatusModel
from app.models.cluster import KubernetesCluster as KubernetesClusterModel, KubeAuthMethod
from app.models.variable import EnvironmentVariable as EnvironmentVariableModel, Secret as SecretModel, VariableScope
from app.models.permission import Permission as PermissionModel, UserPermission as UserPermissionModel, PermissionAction, PermissionResource, PermissionScope
from datetime import datetime
import json
import hashlib
import os
from dbos import DBOSClient
from app.workflows.dbos_deploy import create_dbos_client
from app.core.config import settings
from app.core.security import encrypt_secret, decrypt_secret
from app.core.k8s.health import check_readyz
from app.core.k8s.connection import check_connection
@strawberry.type
class PublishVersionResult:
    ok: bool
    message: str
    version: Optional[ServiceVersion] = None

@strawberry.type
class SectionDiff:
    previous: Optional[str] = None
    current: Optional[str] = None
    changed: "SectionChangeStatus"

@strawberry.type
class ValidateNewVersionResult:
    config: SectionDiff
    variables: SectionDiff
    secrets: SectionDiff
    matchingVersionLabels: List[str]
    overall: "OverallChangeStatus"

@strawberry.type
class KeyChange:
    key: str
    changed: bool

@strawberry.type
class SectionChangeStatus:
    master: bool
    keys: List[KeyChange]

@strawberry.type
class OverallChangeStatus:
    master: bool
    config: bool
    variables: bool
    secrets: bool

try:
    import kubernetes
    from kubernetes.client import Configuration as K8sConfiguration, ApiClient as K8sApiClient
    from kubernetes.client.rest import ApiException as K8sApiException
    from kubernetes.client import AuthenticationApi as K8sAuthenticationApi
    from kubernetes import config as k8s_config
except Exception:
    kubernetes = None  # type: ignore
    K8sConfiguration = None  # type: ignore
    K8sApiClient = None  # type: ignore
    K8sApiException = Exception  # type: ignore
    K8sAuthenticationApi = None  # type: ignore
    k8s_config = None  # type: ignore


@strawberry.type
class Query:
    """GraphQL Query type"""
    
    @strawberry.field
    async def users(
        self,
        skip: int = 0,
        limit: int = 100,
        search: Optional[str] = None,
        info: Any = None,
    ) -> PaginatedUsers:
        """Get list of users with pagination (any authenticated user)"""
        context = info.context
        db = context.db
        current_user = context.current_user
        
        if not current_user:
            raise Exception("Authentication required")
        
        items, total = await resolve_users(skip, limit, search, db, current_user)
        return PaginatedUsers(items=items, total=total)
    
    @strawberry.field
    async def clusters(self, info: Any = None) -> List["GqlKubernetesCluster"]:
        """List all Kubernetes clusters (admin only)."""
        context = info.context
        db = context.db
        current_user = context.current_user
        if not current_user:
            raise Exception("Authentication required")
        if not (current_user.get('is_admin', False) or current_user.get('is_super_admin', False)):
            raise Exception("Access denied")
        results = await db.execute(select(KubernetesClusterModel).order_by(KubernetesClusterModel.created_at.desc()))
        items = results.scalars().all()
        out: List[GqlKubernetesCluster] = []
        for i in items:
            cluster = GqlKubernetesCluster(
                    id=i.id,
                    name=i.name,
                    description=i.description,
                    api_url=i.api_url,
                    auth_method=i.auth_method.value if hasattr(i.auth_method, "value") else str(i.auth_method),
                    environment_type=(i.environment_type.value if hasattr(i.environment_type, "value") else i.environment_type),
                    created_at=i.created_at,
                    updated_at=i.updated_at,
                )
            # Compute unauthenticated /readyz using shared helper
            ok, msg = await check_readyz(i.api_url or "", timeout_seconds=3.0, verify_ssl=False)
            cluster.api_health = ConnectionTestResult(ok=ok, message=msg)
            # Compute authenticated connection (best-effort) via shared helper
            try:
                ok2, msg2 = await check_connection(cluster=i)
                cluster.cluster_connection = ConnectionTestResult(ok=ok2, message=msg2)
            except Exception as e:
                cluster.cluster_connection = ConnectionTestResult(ok=False, message=str(e))
            out.append(cluster)
        return out

    @strawberry.field
    async def admin_configs(self, info: Any = None) -> List["AdminConfig"]:
        """List all admin configs (admin only)."""
        context = info.context
        db = context.db
        current_user = context.current_user
        if not current_user:
            raise Exception("Authentication required")
        if not (current_user.get('is_admin', False) or current_user.get('is_super_admin', False)):
            raise Exception("Access denied")
        results = await db.execute(select(AdminConfigModel).order_by(AdminConfigModel.key))
        items = results.scalars().all()
        return [
            AdminConfig(
                id=i.id,
                key=i.key,
                value=i.value,
                config_data=json.dumps(i.config_data) if i.config_data else None,
                created_at=i.created_at,
                updated_at=i.updated_at,
            ) for i in items
        ]

    @strawberry.field
    async def admin_config(self, key: str, info: Any = None) -> Optional["AdminConfig"]:
        """Get a single admin config by key (admin only)."""
        context = info.context
        db = context.db
        current_user = context.current_user
        if not current_user:
            raise Exception("Authentication required")
        if not (current_user.get('is_admin', False) or current_user.get('is_super_admin', False)):
            raise Exception("Access denied")
        result = await db.execute(select(AdminConfigModel).where(AdminConfigModel.key == key))
        item = result.scalar_one_or_none()
        if not item:
            return None
        return AdminConfig(
            id=item.id,
            key=item.key,
            value=item.value,
            config_data=json.dumps(item.config_data) if item.config_data else None,
            created_at=item.created_at,
            updated_at=item.updated_at,
        )

    @strawberry.field
    async def service_versions(self, service_id: str, info: Any = None) -> List["ServiceVersion"]:
        """List all versions for a service (newest first)."""
        context = info.context
        db = context.db
        current_user = context.current_user
        if not current_user:
            raise Exception("Authentication required")
        if not current_user.get('is_admin', False):
            has_access = await check_resource_permission(current_user, PermissionAction.READ, PermissionScope.SERVICE, service_id, db)
            if not has_access:
                raise Exception("Access denied")
        results = await db.execute(
            select(ServiceVersionModel)
            .where(ServiceVersionModel.service_id == service_id)
            .order_by(ServiceVersionModel.created_at.desc())
        )
        versions = results.scalars().all()
        from app.graphql_api.types import ServiceVersion as GqlServiceVersion
        return [
            GqlServiceVersion(
                id=v.id,
                service_id=v.service_id,
                version_label=v.version_label,
                config_hash=v.config_hash,
                spec_json=v.spec_json,
                created_at=v.created_at,
            ) for v in versions
        ]
    
    @strawberry.field
    async def validate_new_service_version(self, service_id: str, info: Any = None) -> ValidateNewVersionResult:
        """Compare current spec against latest version; show per-section diffs and any fully matching previous versions."""
        context = info.context
        db = context.db
        current_user = context.current_user
        if not current_user:
            raise Exception("Authentication required")
        if not current_user.get('is_admin', False):
            has_access = await check_resource_permission(current_user, PermissionAction.WRITE, PermissionScope.SERVICE, service_id, db)
            if not has_access:
                raise Exception("Access denied")
        # Load service
        svc_res = await db.execute(select(ServiceModel).where(ServiceModel.id == service_id))
        svc = svc_res.scalar_one_or_none()
        if not svc:
            raise Exception("Service not found")
        # Only compare docker_image, ports, variables, and secrets for version changes
        cfg_res = await db.execute(select(ServiceConfigModel).where(ServiceConfigModel.service_id == service_id))
        cfg_rows = cfg_res.scalars().all()
        full_cfg_map = {c.key: c.value for c in cfg_rows}
        # Filter config to only version-relevant keys: docker_image and ports
        VERSIONED_CONFIG_KEYS = ("docker_image", "ports")
        cfg_map = {k: full_cfg_map[k] for k in VERSIONED_CONFIG_KEYS if k in full_cfg_map}
        # Parse JSON-encoded config values (e.g. ports) into native types
        for _cfg_key in ("ports",):
            if _cfg_key in cfg_map and isinstance(cfg_map[_cfg_key], str):
                try:
                    cfg_map[_cfg_key] = json.loads(cfg_map[_cfg_key])
                except (json.JSONDecodeError, TypeError):
                    pass
        env_res = await db.execute(
            select(EnvironmentVariableModel).where(
                and_(EnvironmentVariableModel.scope == VariableScope.SERVICE,
                     EnvironmentVariableModel.resource_id == service_id)
            )
        )
        env_rows = env_res.scalars().all()
        env_map = {e.key: e.value for e in env_rows}
        sec_res = await db.execute(
            select(SecretModel).where(
                and_(SecretModel.scope == VariableScope.SERVICE,
                     SecretModel.resource_id == service_id)
            )
        )
        sec_rows = sec_res.scalars().all()
        sec_map = {s.key: s.value for s in sec_rows}
        # Latest previous version
        latest_res = await db.execute(
            select(ServiceVersionModel)
            .where(ServiceVersionModel.service_id == service_id)
            .order_by(ServiceVersionModel.created_at.desc())
        )
        latest = latest_res.scalars().first()
        prev_spec = {}
        if latest and latest.spec_json:
            try:
                prev_spec = json.loads(latest.spec_json)
            except Exception:
                prev_spec = {}
        # Helper to dumps
        def dumps(obj: Any) -> str:
            return json.dumps(obj, sort_keys=True, separators=(",", ":"))
        # Build per-section change maps
        def section_change(prev_obj: Any, curr_obj: Any) -> SectionChangeStatus:
            prev_dict = prev_obj if isinstance(prev_obj, dict) else {}
            curr_dict = curr_obj if isinstance(curr_obj, dict) else {}
            keys = set(prev_dict.keys()) | set(curr_dict.keys())
            key_status: List[KeyChange] = []
            any_changed = False
            for k in sorted(keys):
                pv = prev_dict.get(k, None)
                cv = curr_dict.get(k, None)
                changed = dumps(pv) != dumps(cv)
                if changed:
                    any_changed = True
                key_status.append(KeyChange(key=k, changed=changed))
            return SectionChangeStatus(master=any_changed, keys=key_status)
        # Only compare config (docker_image, ports), variables, and secrets against previous version
        prev_cfg = prev_spec.get("config", {}) or {}
        prev_cfg_filtered = {k: prev_cfg.get(k) for k in VERSIONED_CONFIG_KEYS if k in prev_cfg}
        config_changed = section_change(prev_cfg_filtered, cfg_map)
        variables_changed = section_change(prev_spec.get("variables", None), env_map)
        secrets_changed = section_change(prev_spec.get("secrets", None), sec_map)
        config_diff = SectionDiff(previous=dumps(prev_cfg_filtered), current=dumps(cfg_map), changed=config_changed)
        variables_diff = SectionDiff(previous=dumps(prev_spec.get("variables", None)), current=dumps(env_map), changed=variables_changed)
        secrets_diff = SectionDiff(previous=dumps(prev_spec.get("secrets", None)), current=dumps(sec_map), changed=secrets_changed)
        # Matching versions — hash based only on versioned fields
        current_spec = {
            "config": cfg_map,
            "variables": env_map,
            "secrets": sec_map,
        }
        current_spec_str = dumps(current_spec)
        current_hash = hashlib.sha256(current_spec_str.encode("utf-8")).hexdigest()
        match_res = await db.execute(
            select(ServiceVersionModel).where(
                ServiceVersionModel.service_id == service_id,
                ServiceVersionModel.config_hash == current_hash
            ).order_by(ServiceVersionModel.created_at.desc())
        )
        matching = match_res.scalars().all()
        overall = OverallChangeStatus(
            master=(config_changed.master or variables_changed.master or secrets_changed.master),
            config=config_changed.master,
            variables=variables_changed.master,
            secrets=secrets_changed.master,
        )
        return ValidateNewVersionResult(
            config=config_diff,
            variables=variables_diff,
            secrets=secrets_diff,
            matchingVersionLabels=[m.version_label for m in matching],
            overall=overall,
        )
    
    @strawberry.field
    async def service_deployments(self, service_id: str, limit: int = 50, info: Any = None) -> List["Deployment"]:
        """List deployments for a service (newest first)."""
        context = info.context
        db = context.db
        current_user = context.current_user
        if not current_user:
            raise Exception("Authentication required")
        if not current_user.get('is_admin', False):
            has_access = await check_resource_permission(current_user, PermissionAction.READ, PermissionScope.SERVICE, service_id, db)
            if not has_access:
                raise Exception("Access denied")
        results = await db.execute(
            select(DeploymentModel)
            .where(DeploymentModel.service_id == service_id)
            .order_by(DeploymentModel.created_at.desc())
            .limit(limit)
        )
        deployments = results.scalars().all()
        # Compute subversion_index: 1-based index per (version_id, environment_id) group, ordered by created_at asc
        from collections import defaultdict
        group_counters: dict[tuple, int] = defaultdict(lambda: 1)
        sorted_deps = sorted(deployments, key=lambda d: d.created_at)
        subversion_map: dict[str, int] = {}
        for d in sorted_deps:
            key = (d.version_id, d.environment_id)
            subversion_map[d.id] = group_counters[key]
            group_counters[key] += 1

        # Fetch real-time status from dbos.workflow_status for deployments with workflow_uuid
        wf_uuids = [d.workflow_uuid for d in deployments if d.workflow_uuid]
        wf_status_map: dict[str, str] = {}
        if wf_uuids:
            params = {f"id{i}": uid for i, uid in enumerate(wf_uuids)}
            in_clause = ", ".join(f":id{i}" for i in range(len(wf_uuids)))
            sql = text(f"SELECT workflow_uuid, status FROM dbos.workflow_status WHERE workflow_uuid IN ({in_clause})")
            rs = await db.execute(sql, params)
            for row in rs.fetchall():
                wf_status_map[str(row[0])] = str(row[1])

        from app.graphql_api.types import Deployment as GqlDeployment, DeployStep as GqlDeployStep
        def _to_gql_steps(raw_steps):
            if not raw_steps or not isinstance(raw_steps, list):
                return None
            return [GqlDeployStep(label=s.get("label",""), fn=s.get("fn",""), desc=s.get("desc")) for s in raw_steps if isinstance(s, dict)]

        return [
            GqlDeployment(
                id=d.id,
                service_id=d.service_id,
                version_id=d.version_id,
                environment_id=d.environment_id,
                workflow_uuid=d.workflow_uuid,
                steps=_to_gql_steps(d.steps),
                downstream_overrides=json.dumps(d.downstream_overrides) if d.downstream_overrides else None,
                status=wf_status_map.get(d.workflow_uuid, d.status.value) if d.workflow_uuid else d.status.value,
                created_at=d.created_at,
                completed_at=d.completed_at,
                subversion_index=subversion_map.get(d.id, 0),
            ) for d in deployments
        ]

    @strawberry.field
    async def service_deployment(self, id: str, info: Any = None) -> Optional["Deployment"]:
        """Get a single deployment by id with permission checks."""
        context = info.context
        db = context.db
        current_user = context.current_user
        if not current_user:
            raise Exception("Authentication required")
        res = await db.execute(select(DeploymentModel).where(DeploymentModel.id == id))
        d = res.scalar_one_or_none()
        if not d:
            return None
        # Permission check on the service owning this deployment
        if not current_user.get('is_admin', False):
            has_access = await check_resource_permission(current_user, PermissionAction.READ, PermissionScope.SERVICE, d.service_id, db)
            if not has_access:
                raise Exception("Access denied")
        # Compute subversion_index for this deployment
        count_res = await db.execute(
            select(DeploymentModel)
            .where(
                DeploymentModel.service_id == d.service_id,
                DeploymentModel.version_id == d.version_id,
                DeploymentModel.environment_id == d.environment_id,
                DeploymentModel.created_at < d.created_at,
            )
        )
        subversion_index = len(count_res.scalars().all()) + 1
        # Fetch real-time status from dbos.workflow_status if workflow_uuid is present
        resolved_status = d.status.value
        if d.workflow_uuid:
            wf_row = await db.execute(
                text("SELECT status FROM dbos.workflow_status WHERE workflow_uuid = :id LIMIT 1"),
                {"id": d.workflow_uuid},
            )
            wf_hit = wf_row.first()
            if wf_hit:
                resolved_status = str(wf_hit[0])
        from app.graphql_api.types import Deployment as GqlDeployment, DeployStep as GqlDeployStep
        def _to_gql_steps(raw_steps):
            if not raw_steps or not isinstance(raw_steps, list):
                return None
            return [GqlDeployStep(label=s.get("label",""), fn=s.get("fn",""), desc=s.get("desc")) for s in raw_steps if isinstance(s, dict)]

        return GqlDeployment(
            id=d.id,
            service_id=d.service_id,
            version_id=d.version_id,
            environment_id=d.environment_id,
            workflow_uuid=d.workflow_uuid,
            steps=_to_gql_steps(d.steps),
            downstream_overrides=json.dumps(d.downstream_overrides) if d.downstream_overrides else None,
            status=resolved_status,
            created_at=d.created_at,
            completed_at=d.completed_at,
            subversion_index=subversion_index,
        )

    @strawberry.mutation
    async def add_deployment(self, serviceId: str, environmentId: str, info: Any = None) -> "Deployment":
        """Create a new deployment record with environment id (status=pending)."""
        context = info.context
        db: AsyncSession = context.db
        current_user = context.current_user
        if not current_user:
            raise Exception("Authentication required")
        # Require WRITE permission on service unless admin
        if not current_user.get('is_admin', False):
            has_access = await check_resource_permission(
                current_user, PermissionAction.WRITE, PermissionScope.SERVICE, serviceId, db
            )
            if not has_access:
                raise Exception("Access denied")
        # Ensure service exists
        svc_res = await db.execute(select(ServiceModel).where(ServiceModel.id == serviceId))
        svc = svc_res.scalar_one_or_none()
        if not svc:
            raise Exception("Service not found")
        # Optional: ensure env exists
        env_res = await db.execute(select(EnvironmentModel).where(EnvironmentModel.id == environmentId))
        env = env_res.scalar_one_or_none()
        if not env:
            raise Exception("Environment not found")
        # Find latest version for the service (if any)
        ver_res = await db.execute(
            select(ServiceVersionModel)
            .where(ServiceVersionModel.service_id == serviceId)
            .order_by(ServiceVersionModel.created_at.desc())
        )
        ver = ver_res.scalar_one_or_none()
        if not ver:
            raise Exception("No service version found; create a version first")
        # Insert deployment
        from app.models.versioning import Deployment as DeploymentModel, DeploymentStatus as DeploymentStatusModel
        dep = DeploymentModel(
            service_id=serviceId,
            version_id=ver.id,
            environment_id=environmentId,
            status=DeploymentStatusModel.PENDING,
        )
        db.add(dep)
        await db.commit()
        await db.refresh(dep)
        from app.graphql_api.types import Deployment as GqlDeployment, DeployStep as GqlDeployStep
        def _to_gql_steps(raw_steps):
            if not raw_steps or not isinstance(raw_steps, list):
                return None
            return [GqlDeployStep(label=s.get("label",""), fn=s.get("fn",""), desc=s.get("desc")) for s in raw_steps if isinstance(s, dict)]

        return GqlDeployment(
            id=dep.id,
            service_id=dep.service_id,
            version_id=dep.version_id,
            environment_id=dep.environment_id,
            workflow_uuid=dep.workflow_uuid,
            steps=_to_gql_steps(dep.steps),
            downstream_overrides=json.dumps(dep.downstream_overrides) if dep.downstream_overrides else None,
            status=dep.status.value,
            created_at=dep.created_at,
            completed_at=dep.completed_at,
        )
    
    @strawberry.field
    async def workflows(
        self,
        serviceId: str,        
        limit: int = 50,
        info: Any = None,
    ) -> List["WorkflowStatus"]:
        """
        List DBOS workflows for a specific service (requires read permission).
        Optionally filter by workflow name (e.g., \"deploy_workflow\").
        Includes simple progress metadata if available.
        """
        context = info.context
        current_user = context.current_user
        if not current_user:
            raise Exception("Authentication required")
        # Allow admins or users with READ permission on the service
        if not current_user.get('is_admin', False):
            db: AsyncSession = context.db
            has_access = await check_resource_permission(
                current_user,
                PermissionAction.READ,
                PermissionScope.SERVICE,
                serviceId,
                db,
            )
            if not has_access:
                raise Exception("Access denied")
        # Prefer direct read from dbos.workflow_status using workflow_uuids mapped from deployments
        db: AsyncSession = context.db
        dep_rows = await db.execute(
            select(DeploymentModel.workflow_uuid)
            .where(DeploymentModel.service_id == serviceId, DeploymentModel.workflow_uuid.is_not(None))
            .order_by(DeploymentModel.created_at.desc())
        )
        ids = [str(r[0]) for r in dep_rows.all() if r and r[0]]
        if not ids:
            return []
        # Limit the number of ids we query
        ids = ids[: max(1, min(limit, len(ids)))]
        # Build dynamic IN clause with bound params
        params = {f"id{i}": ids[i] for i in range(len(ids))}
        in_clause = ", ".join(f":id{i}" for i in range(len(ids)))
        sql = text(f"select workflow_uuid, status from dbos.workflow_status where workflow_uuid in ({in_clause})")
        rs = await db.execute(sql, params)
        rows = rs.fetchall()
        # Map status to GraphQL type
        from app.graphql_api.types import WorkflowStatus as GqlWorkflowStatus
        out: List[GqlWorkflowStatus] = []
        for wfid, status in rows:
            out.append(GqlWorkflowStatus(workflow_id=str(wfid), workflow_status=str(status), steps_completed=None, num_steps=None))
        # If nothing returned (e.g., records not yet persisted), fall back to client
        if out:
            # Sort by the order of ids
            order = {ids[i]: i for i in range(len(ids))}
            out.sort(key=lambda x: order.get(x.workflow_id, 1_000_000))
            return out
        # Fallback to client API
        client = create_dbos_client()
        try:
            wf_list_all = client.list_workflows(sort_desc=True, name="deploy_workflow", limit=limit, load_input=True)
            from app.graphql_api.types import WorkflowStatus as GqlWorkflowStatus
            results: List[GqlWorkflowStatus] = []
            for wf in wf_list_all:
                wf_id = (wf.get("workflow_uuid") or wf.get("workflow_id") or wf.get("uuid")) if isinstance(wf, dict) else (getattr(wf, "workflow_uuid", None) or getattr(wf, "workflow_id", None) or getattr(wf, "uuid", ""))
                wf_status = wf.get("status") if isinstance(wf, dict) else getattr(wf, "status", "")
                if ids and wf_id not in ids:
                    continue
                results.append(GqlWorkflowStatus(workflow_id=str(wf_id), workflow_status=str(wf_status), steps_completed=None, num_steps=None))
            return results
        finally:
            client.destroy()

    @strawberry.field
    async def kubernetesClusterConnection(self, clusterId: str, info: Any = None) -> "ConnectionTestResult":
        """
        Attempt a live API call to the cluster's /apis/authentication.k8s.io using stored credentials.
        Uses Kubernetes python client AuthenticationApi.get_api_group.
        """
        context = info.context
        db: AsyncSession = context.db
        current_user = context.current_user
        if not current_user:
            raise Exception("Authentication required")
        if not (current_user.get('is_admin', False) or current_user.get('is_super_admin', False)):
            raise Exception("Access denied")
        # Load cluster
        result = await db.execute(select(KubernetesClusterModel).where(KubernetesClusterModel.id == clusterId))
        cluster = result.scalars().first()
        if not cluster:
            return ConnectionTestResult(ok=False, message="Cluster not found.")
        ok, msg = await check_connection(cluster=cluster)
        return ConnectionTestResult(ok=ok, message=msg)
    @strawberry.field
    async def kubernetesApiHealth(self, clusterId: str, info: Any = None) -> "ConnectionTestResult":
        """Check Kubernetes API /readyz endpoint without authentication and return ok on success."""
        context = info.context
        db: AsyncSession = context.db
        current_user = context.current_user
        if not current_user:
            raise Exception("Authentication required")
        if not (current_user.get('is_admin', False) or current_user.get('is_super_admin', False)):
            raise Exception("Access denied")
        # Load cluster API URL
        result = await db.execute(select(KubernetesClusterModel).where(KubernetesClusterModel.id == clusterId))
        cluster = result.scalars().first()
        if not cluster:
            return ConnectionTestResult(ok=False, message="Cluster not found.")
        host = (cluster.api_url or "").strip()
        if not host:
            return ConnectionTestResult(ok=False, message="Cluster API URL is not configured.")
        ok, msg = await check_readyz(host, timeout_seconds=5.0, verify_ssl=False)
        return ConnectionTestResult(ok=ok, message=msg)

    @strawberry.field
    async def queuedWorkflows(
        self,
        serviceId: str,
        name: Optional[str] = None,
        limit: int = 50,
        info: Any = None,
    ) -> List["WorkflowStatus"]:
        """
        List queued DBOS workflows for a specific service (requires read permission).
        """
        context = info.context
        current_user = context.current_user
        if not current_user:
            raise Exception("Authentication required")
        if not current_user.get('is_admin', False):
            db: AsyncSession = context.db
            has_access = await check_resource_permission(
                current_user,
                PermissionAction.READ,
                PermissionScope.SERVICE,
                serviceId,
                db,
            )
            if not has_access:
                raise Exception("Access denied")

        client = create_dbos_client()
        try:
            wf_list_all = client.list_queued_workflows(
                name=name,
                limit=limit,
                sort_desc=True,
                load_input=True,
            )
            from app.graphql_api.types import WorkflowStatus as GqlWorkflowStatus
            results: List[GqlWorkflowStatus] = []
            # Build allowed workflow id set from deployments for non-admin users
            allowed_ids: set[str] = set()
            if not current_user.get('is_admin', False):
                dep_rows = await db.execute(
                    select(DeploymentModel.workflow_uuid).where(
                        DeploymentModel.service_id == serviceId,
                        DeploymentModel.workflow_uuid.is_not(None),
                    )
                )
                allowed_ids = {str(r[0]) for r in dep_rows.all() if r and r[0]}
            for wf in wf_list_all:
                wf_id = (
                    (wf.get("workflow_uuid") or wf.get("workflow_id") or wf.get("uuid")) if isinstance(wf, dict)
                    else (getattr(wf, "workflow_uuid", None) or getattr(wf, "workflow_id", None) or getattr(wf, "uuid", ""))
                )
                wf_status = wf.get("status") if isinstance(wf, dict) else getattr(wf, "status", "")
                # Filter by serviceId via inputs first arg
                belongs_to_service = False
                try:
                    inputs_raw = wf.get("inputs") if isinstance(wf, dict) else getattr(wf, "inputs", None)
                    if inputs_raw:
                        inputs = json.loads(inputs_raw) if isinstance(inputs_raw, str) else inputs_raw
                        args = inputs.get("args") if isinstance(inputs, dict) else None
                        if isinstance(args, list) and len(args) > 0 and isinstance(args[0], str):
                            if args[0] == serviceId:
                                belongs_to_service = True
                except Exception:
                    belongs_to_service = False
                # For non-admins, also allow if workflow id is associated to this service via deployments
                if not current_user.get('is_admin', False) and not (belongs_to_service or (wf_id and wf_id in allowed_ids)):
                    continue
                results.append(
                    GqlWorkflowStatus(
                        workflow_id=wf_id,
                        workflow_status=str(wf_status),
                        steps_completed=None,
                        num_steps=None,
                    )
                )
            return results
        finally:
            client.destroy()

    @strawberry.field
    async def workflowStatus(
        self,
        serviceId: str,
        workflowId: str,
        info: Any = None,
    ) -> Optional["WorkflowStatus"]:
        """
        Fetch a single workflow status (requires read permission on the service).
        """
        context = info.context
        current_user = context.current_user
        if not current_user:
            raise Exception("Authentication required")
        if not current_user.get('is_admin', False):
            db: AsyncSession = context.db
            has_access = await check_resource_permission(
                current_user,
                PermissionAction.READ,
                PermissionScope.SERVICE,
                serviceId,
                db,
            )
            if not has_access:
                raise Exception("Access denied")

        client = create_dbos_client()
        try:
            # Reuse list_workflows to get one
            wf_list = client.list_workflows(
                workflow_ids=[workflowId],
                load_input=True,
            )
            if not wf_list:
                # Fall back to direct DB read from dbos.workflow_status
                db: AsyncSession = context.db
                row = await db.execute(text("select workflow_uuid, status from dbos.workflow_status where workflow_uuid = :id limit 1"), {"id": workflowId})
                hit = row.first()
                if not hit:
                    return None
                wf_id = str(hit[0])
                wf_status = str(hit[1])
                # Optional: verify belongs to serviceId via deployments mapping for non-admins
                if not current_user.get('is_admin', False):
                    dep_rows = await db.execute(
                        select(DeploymentModel.workflow_uuid).where(
                            DeploymentModel.service_id == serviceId,
                            DeploymentModel.workflow_uuid == wf_id,
                        )
                    )
                    if not dep_rows.first():
                        return None
                from app.graphql_api.types import WorkflowStatus as GqlWorkflowStatus
                return GqlWorkflowStatus(workflow_id=wf_id, workflow_status=str(wf_status))
            wf = wf_list[0]
            wf_id = (
                (wf.get("workflow_uuid") or wf.get("workflow_id") or wf.get("uuid")) if isinstance(wf, dict)
                else (getattr(wf, "workflow_uuid", None) or getattr(wf, "workflow_id", None) or getattr(wf, "uuid", ""))
            )
            wf_status = wf.get("status") if isinstance(wf, dict) else getattr(wf, "status", "")
            # Optional: verify belongs to serviceId
            if not current_user.get('is_admin', False):
                try:
                    inputs_raw = wf.get("inputs") if isinstance(wf, dict) else getattr(wf, "inputs", None)
                    if inputs_raw:
                        inputs = json.loads(inputs_raw) if isinstance(inputs_raw, str) else inputs_raw
                        args = inputs.get("args") if isinstance(inputs, dict) else None
                        if not (isinstance(args, list) and len(args) > 0 and args[0] == serviceId):
                            # Fallback: allow if this workflow id is associated to this service via deployments
                            dep_rows = await db.execute(
                                select(DeploymentModel.workflow_uuid).where(
                                    DeploymentModel.service_id == serviceId,
                                    DeploymentModel.workflow_uuid == wf_id,
                                )
                            )
                            dep_hit = dep_rows.first()
                            if not dep_hit:
                                return None
                except Exception:
                    # As a last resort, check deployments mapping
                    dep_rows = await db.execute(
                        select(DeploymentModel.workflow_uuid).where(
                            DeploymentModel.service_id == serviceId,
                            DeploymentModel.workflow_uuid == wf_id,
                        )
                    )
                    dep_hit = dep_rows.first()
                    if not dep_hit:
                        return None
            from app.graphql_api.types import WorkflowStatus as GqlWorkflowStatus
            return GqlWorkflowStatus(
                workflow_id=wf_id,
                workflow_status=str(wf_status),
            )
        finally:
            client.destroy()

    @strawberry.field
    async def retrieveWorkflow(
        self,
        serviceId: str,
        workflowId: str,
        info: Any = None,
    ) -> Optional["WorkflowStatus"]:
        """
        Retrieve workflow handle info (mapped to status). Requires read permission.
        """
        return await self.workflowStatus(serviceId=serviceId, workflowId=workflowId, info=info)

    @strawberry.field
    async def workflow(
        self,
        workflowId: str,
        info: Any = None,
    ) -> Optional["WorkflowStatus"]:
        """
        Fetch a single workflow by workflowId only.
        - If the caller is admin, returns the workflow unconditionally (if found).
        - Otherwise, infers the serviceId from the workflow inputs (first arg) and performs READ permission check.
        """
        context = info.context
        current_user = context.current_user
        if not current_user:
            raise Exception("Authentication required")

        client = create_dbos_client()
        try:            
            db: AsyncSession = context.db
            result = await db.execute(
                text("select workflow_uuid, status from dbos.workflow_status where workflow_uuid = :id limit 1"),
                {"id": workflowId},
            )
            row = result.first()
            if not row:
                return None
            wf_id = str(row[0])
            wf_status = str(row[1])
            from app.graphql_api.types import WorkflowStatus as GqlWorkflowStatus
            # Permission: admins see any workflow; others must have READ on mapped service
            if not current_user.get('is_admin', False):
                dep_row = await db.execute(
                    select(DeploymentModel.service_id).where(DeploymentModel.workflow_uuid == wf_id)
                )
                dep_svc = dep_row.first()
                inferred_service_id = dep_svc[0] if dep_svc else None
                if not inferred_service_id:
                    return None
                has_access = await check_resource_permission(
                    current_user,
                    PermissionAction.READ,
                    PermissionScope.SERVICE,
                    inferred_service_id,
                    db,
                )
                if not has_access:
                    return None
            return GqlWorkflowStatus(workflow_id=wf_id, workflow_status=wf_status)        
        finally:
            client.destroy()

    @strawberry.field
    async def env_subdomain_workflow(
        self,
        environment_id: str,
        info: Any = None,
    ) -> Optional["WorkflowStatus"]:
        """
        Fetch the latest setup_env_subdomain workflow status for an environment.
        Reads workflow_uuid from the domain_info environment config record,
        then returns the workflow status and steps from dbos.workflow_status.
        """
        context = info.context
        current_user = context.current_user
        if not current_user:
            raise Exception("Authentication required")
        db: AsyncSession = context.db

        # Permission check
        if not current_user.get('is_admin', False):
            has_access = await check_resource_permission(
                current_user, PermissionAction.READ, PermissionScope.ENVIRONMENT, environment_id, db
            )
            if not has_access:
                raise Exception("Access denied")

        # Look up the domain_info config for this environment
        from app.models.config import EnvironmentConfig as EnvironmentConfigModel
        cfg_res = await db.execute(
            select(EnvironmentConfigModel).where(
                EnvironmentConfigModel.environment_id == environment_id,
                EnvironmentConfigModel.key == "domain_info",
            )
        )
        cfg = cfg_res.scalar_one_or_none()
        if not cfg or not cfg.workflow_uuid:
            return None

        wf_uuid = cfg.workflow_uuid
        # Fetch workflow status from dbos.workflow_status
        result = await db.execute(
            text(
                "SELECT workflow_uuid, status, "
                "  (SELECT count(*) FROM dbos.operation_outputs WHERE workflow_uuid = ws.workflow_uuid) AS steps_completed "
                "FROM dbos.workflow_status ws WHERE ws.workflow_uuid = :id LIMIT 1"
            ),
            {"id": wf_uuid},
        )
        row = result.first()
        if not row:
            return None

        from app.graphql_api.types import WorkflowStatus as GqlWorkflowStatus
        return GqlWorkflowStatus(
            workflow_id=str(row[0]),
            workflow_status=str(row[1]),
            steps_completed=int(row[2]) if row[2] is not None else None,
            _source="environment",
            _environment_id=environment_id,
        )

    @strawberry.field
    async def listWorkflowSteps(
        self,
        serviceId: str,
        workflowId: str,
        info: Any = None,
    ) -> List["WorkflowStepInfo"]:
        """
        List workflow step information. Requires read permission.
        """
        context = info.context
        current_user = context.current_user
        if not current_user:
            raise Exception("Authentication required")
        if not current_user.get('is_admin', False):
            db: AsyncSession = context.db
            has_access = await check_resource_permission(
                current_user,
                PermissionAction.READ,
                PermissionScope.SERVICE,
                serviceId,
                db,
            )
            if not has_access:
                raise Exception("Access denied")

        client = create_dbos_client()
        try:
            steps = client.list_workflow_steps(workflowId)
            items: List[WorkflowStepInfo] = []
            for s in steps:
                output_str = None
                if s.get("output") is not None:
                    try:
                        output_str = json.dumps(s.get("output"))
                    except Exception:
                        output_str = str(s.get("output"))
                error_str = None
                if s.get("error") is not None:
                    error_str = str(s.get("error"))
                items.append(
                    WorkflowStepInfo(
                        function_id=int(s.get("function_id")),
                        function_name=str(s.get("function_name")),
                        output=output_str,
                        error=error_str,
                        child_workflow_id=s.get("child_workflow_id"),
                        started_at_epoch_ms=s.get("started_at_epoch_ms"),
                        completed_at_epoch_ms=s.get("completed_at_epoch_ms"),
                    )
                )
            return items
        finally:
            client.destroy()

    @strawberry.field
    async def readWorkflowStream(
        self,
        serviceId: str,
        workflowId: str,
        key: str,
        maxItems: int = 100,
        info: Any = None,
    ) -> List[str]:
        """
        Read current stream values as a list (up to maxItems). Requires read permission.
        """
        context = info.context
        current_user = context.current_user
        if not current_user:
            raise Exception("Authentication required")
        if not current_user.get('is_admin', False):
            db: AsyncSession = context.db
            has_access = await check_resource_permission(
                current_user,
                PermissionAction.READ,
                PermissionScope.SERVICE,
                serviceId,
                db,
            )
            if not has_access:
                raise Exception("Access denied")

        client = create_dbos_client()
        try:
            out: List[str] = []
            for i, v in enumerate(client.read_stream(workflowId, key)):
                if i >= maxItems:
                    break
                try:
                    out.append(json.dumps(v))
                except Exception:
                    out.append(str(v))
            return out
        finally:
            client.destroy()

    @strawberry.field
    async def workflowEvent(
        self,
        serviceId: str,
        workflowId: str,
        key: str,
        timeoutSeconds: int = 0,
        info: Any = None,
    ) -> Optional[str]:
        """
        Get a workflow event value by key (as JSON string). Requires read permission.
        """
        context = info.context
        current_user = context.current_user
        if not current_user:
            raise Exception("Authentication required")
        if not current_user.get('is_admin', False):
            db: AsyncSession = context.db
            has_access = await check_resource_permission(
                current_user,
                PermissionAction.READ,
                PermissionScope.SERVICE,
                serviceId,
                db,
            )
            if not has_access:
                raise Exception("Access denied")

        client = create_dbos_client()
        try:
            val = client.get_event(workflowId, key, timeout_seconds=float(timeoutSeconds))
            if val is None:
                return None
            try:
                return json.dumps(val)
            except Exception:
                return str(val)
        finally:
            client.destroy()
    
    @strawberry.field
    async def user(self, id: str, info: Any = None) -> Optional[User]:
        """Get user by ID (any authenticated user)"""
        context = info.context
        db = context.db
        current_user = context.current_user
        
        if not current_user:
            raise Exception("Authentication required")
        
        # Allow any authenticated user to query any user
        result = await db.execute(select(UserModel).where(UserModel.id == id, UserModel.deleted_at.is_(None)))
        user = result.scalar_one_or_none()
        
        if not user:
            return None
        
        return model_to_user(user)
    
    @strawberry.field
    async def projects(
        self,
        skip: int = 0,
        limit: int = 100,
        search: Optional[str] = None,
        requireWritePermission: bool = False,
        info: Any = None,
    ) -> PaginatedProjects:
        """Get list of projects with pagination. If requireWritePermission is true, only returns projects where user has write access."""
        context = info.context
        db = context.db
        current_user = context.current_user
        
        if not current_user:
            raise Exception("Authentication required")
        
        items, total = await resolve_projects(skip, limit, search, db, current_user, requireWritePermission)
        return PaginatedProjects(items=items, total=total)
    
    @strawberry.field
    async def project(self, id: str, info: Any = None) -> Optional[Project]:
        """Get project by ID (any authenticated user)"""
        context = info.context
        db = context.db
        current_user = context.current_user
        
        if not current_user:
            raise Exception("Authentication required")
        
        result = await db.execute(
            select(ProjectModel)
            .options(
                selectinload(ProjectModel.environments).selectinload(EnvironmentModel.services),
                selectinload(ProjectModel.services)
            )
            .where(ProjectModel.id == id, ProjectModel.deleted_at.is_(None))
        )
        project = result.scalar_one_or_none()
        
        if not project:
            return None
        
        return model_to_project(project)
    
    @strawberry.field
    async def projectDetails(self, id: str, info: Any = None) -> Optional[ProjectDetails]:
        """Get consolidated project details including permissions, env vars, and secrets in one query"""
        
        context = info.context
        db = context.db
        current_user = context.current_user
        
        if not current_user:
            raise Exception("Authentication required")
        
        # Fetch project
        result = await db.execute(
            select(ProjectModel)
            .options(
                selectinload(ProjectModel.environments).selectinload(EnvironmentModel.services),
                selectinload(ProjectModel.services)
            )
            .where(ProjectModel.id == id, ProjectModel.deleted_at.is_(None))
        )
        project = result.scalar_one_or_none()
        
        if not project:
            return None
        
        project_type = model_to_project(project)
        
        # Build UserPermission object using check_resource_permission
        is_admin = current_user.get('is_admin', False)
        is_owner = project.owner_id == current_user.get('id')
        
        # Check permissions using the existing check_resource_permission function
        can_read = await check_resource_permission(
            current_user, PermissionAction.READ, PermissionScope.PROJECT, id, db
        )
        can_write = await check_resource_permission(
            current_user, PermissionAction.WRITE, PermissionScope.PROJECT, id, db
        )
        can_delete = await check_resource_permission(
            current_user, PermissionAction.DELETE, PermissionScope.PROJECT, id, db
        )
        
        permissions_obj = ComputedUserPermission(
            can_read=can_read,
            can_write=can_write,
            can_delete=can_delete,
            is_admin=is_admin,
            is_owner=is_owner,
        )
        
        # Fetch environment variables
        env_vars_result = await db.execute(
            select(EnvironmentVariableModel).where(
                EnvironmentVariableModel.scope == VariableScope.PROJECT,
                EnvironmentVariableModel.resource_id == id,
                EnvironmentVariableModel.deleted_at.is_(None)
            )
        )
        env_vars = env_vars_result.scalars().all()
        
        # Check read permission for env vars
        has_env_var_access = await check_resource_permission(
            current_user, PermissionAction.READ, PermissionScope.PROJECT, id, db
        )
        
        env_vars_list = []
        if has_env_var_access:
            env_vars_list = [
                EnvironmentVariable(
                    id=e.id,
                    scope=e.scope.value,
                    resource_id=e.resource_id,
                    key=e.key,
                    value=e.value,
                    created_at=e.created_at,
                    updated_at=e.updated_at,
                )
                for e in env_vars
            ]
        
        # Fetch secrets
        secrets_result = await db.execute(
            select(SecretModel).where(
                SecretModel.scope == VariableScope.PROJECT,
                SecretModel.resource_id == id,
                SecretModel.deleted_at.is_(None)
            )
        )
        secrets = secrets_result.scalars().all()
        
        # Check read permission for secrets
        has_secret_access = await check_resource_permission(
            current_user, PermissionAction.READ, PermissionScope.PROJECT, id, db
        )
        
        secrets_list = []
        if has_secret_access:
            secrets_list = [
                Secret(
                    id=s.id,
                    scope=s.scope.value,
                    resource_id=s.resource_id,
                    key=s.key,
                    value_length=len(s.value) if s.value else 0,
                    created_at=s.created_at,
                    updated_at=s.updated_at,
                )
                for s in secrets
            ]
        
        # Fetch resource permissions for this project
        # Check if user can view all permissions (owner or admin)
        can_view_all_permissions = await can_grant_resource_permission(
            current_user, PermissionScope.PROJECT, id, db
        )
        
        # Always filter by scope and resource_id to ensure we only get permissions for this specific project
        resource_perms_query = select(ResourcePermissionModel).where(
            ResourcePermissionModel.scope == PermissionScope.PROJECT,
            ResourcePermissionModel.resource_id == id  # Critical: ensure we only get permissions for this project
        )
        
        # If user can't view all, only show their own permissions
        if not can_view_all_permissions:
            resource_perms_query = resource_perms_query.where(
                ResourcePermissionModel.user_id == current_user.get('id')
            )
        
        resource_perms_result = await db.execute(resource_perms_query)
        resource_perms = resource_perms_result.scalars().all()
        
        # Double-check: filter out any permissions that don't match this project (defensive programming)
        resource_perms_list = [
            ResourcePermission(
                id=rp.id,
                user_id=rp.user_id,
                scope=rp.scope.value if hasattr(rp.scope, 'value') else rp.scope,
                resource_id=rp.resource_id,
                actions=rp.actions,
                granted_at=rp.granted_at,
                granted_by=rp.granted_by,
            )
            for rp in resource_perms
            if rp.scope == PermissionScope.PROJECT and rp.resource_id == id  # Extra validation
        ]
        
        return ProjectDetails(
            project=project_type,
            permissions=permissions_obj,
            environmentVariables=env_vars_list,
            secrets=secrets_list,
            resourcePermissions=resource_perms_list,
        )
    
    @strawberry.field
    async def usersByIds(self, ids: List[str], info: Any = None) -> List[User]:
        """Get multiple users by IDs in one query (batch query)"""
        context = info.context
        db = context.db
        current_user = context.current_user
        
        if not current_user:
            raise Exception("Authentication required")
        
        if not ids:
            return []
        
        result = await db.execute(
            select(UserModel).where(
                UserModel.id.in_(ids),
                UserModel.deleted_at.is_(None)
            )
        )
        users = result.scalars().all()
        
        return [model_to_user(u) for u in users]
    
    @strawberry.field
    async def environmentDetails(self, id: str, info: Any = None) -> Optional[EnvironmentDetails]:
        """Get consolidated environment details including permissions, env vars, and secrets in one query"""
        
        context = info.context
        db = context.db
        current_user = context.current_user
        
        if not current_user:
            raise Exception("Authentication required")
        
        # Fetch environment
        result = await db.execute(
            select(EnvironmentModel)
            .options(selectinload(EnvironmentModel.project), selectinload(EnvironmentModel.services))
            .where(EnvironmentModel.id == id, EnvironmentModel.deleted_at.is_(None))
        )
        env = result.scalar_one_or_none()
        
        if not env:
            return None
        
        env_type = model_to_environment(env)
        # Attach cluster subset if mapped
        if getattr(env, "cluster_id", None):
            try:
                result2 = await db.execute(select(KubernetesClusterModel).where(KubernetesClusterModel.id == env.cluster_id))
                kc = result2.scalar_one_or_none()
                if kc:
                    env_type.cluster_id = kc.id
                    env_type.cluster = GqlKubernetesCluster(
                        id=kc.id,
                        name=kc.name,
                        description=kc.description,
                        api_url=kc.api_url,
                        auth_method=kc.auth_method.value if hasattr(kc.auth_method, "value") else str(kc.auth_method),
                        environment_type=(kc.environment_type.value if hasattr(kc.environment_type, "value") else kc.environment_type),
                        created_at=kc.created_at,
                        updated_at=kc.updated_at,
                        api_health=None,
                        cluster_connection=None,
                    )
            except Exception:
                pass
        
        # Build UserPermission object using check_resource_permission
        is_admin = current_user.get('is_admin', False)
        # For environments, owner is the project owner
        project_result = await db.execute(
            select(ProjectModel).where(ProjectModel.id == env.project_id, ProjectModel.deleted_at.is_(None))
        )
        project = project_result.scalar_one_or_none()
        is_owner = project and project.owner_id == current_user.get('id')
        
        # Check permissions using the existing check_resource_permission function
        can_read = await check_resource_permission(
            current_user, PermissionAction.READ, PermissionScope.ENVIRONMENT, id, db
        )
        can_write = await check_resource_permission(
            current_user, PermissionAction.WRITE, PermissionScope.ENVIRONMENT, id, db
        )
        can_delete = await check_resource_permission(
            current_user, PermissionAction.DELETE, PermissionScope.ENVIRONMENT, id, db
        )
        
        permissions_obj = ComputedUserPermission(
            can_read=can_read,
            can_write=can_write,
            can_delete=can_delete,
            is_admin=is_admin,
            is_owner=is_owner,
        )
        
        # Fetch environment variables
        env_vars_result = await db.execute(
            select(EnvironmentVariableModel).where(
                EnvironmentVariableModel.scope == VariableScope.ENVIRONMENT,
                EnvironmentVariableModel.resource_id == id,
                EnvironmentVariableModel.deleted_at.is_(None)
            )
        )
        env_vars = env_vars_result.scalars().all()
        
        # Check read permission for env vars
        has_env_var_access = await check_resource_permission(
            current_user, PermissionAction.READ, PermissionScope.ENVIRONMENT, id, db
        )
        
        env_vars_list = []
        if has_env_var_access:
            env_vars_list = [
                EnvironmentVariable(
                    id=e.id,
                    scope=e.scope.value,
                    resource_id=e.resource_id,
                    key=e.key,
                    value=e.value,
                    created_at=e.created_at,
                    updated_at=e.updated_at,
                )
                for e in env_vars
            ]
        
        # Fetch secrets
        secrets_result = await db.execute(
            select(SecretModel).where(
                SecretModel.scope == VariableScope.ENVIRONMENT,
                SecretModel.resource_id == id,
                SecretModel.deleted_at.is_(None)
            )
        )
        secrets = secrets_result.scalars().all()
        
        # Check read permission for secrets
        has_secret_access = await check_resource_permission(
            current_user, PermissionAction.READ, PermissionScope.ENVIRONMENT, id, db
        )
        
        secrets_list = []
        if has_secret_access:
            secrets_list = [
                Secret(
                    id=s.id,
                    scope=s.scope.value,
                    resource_id=s.resource_id,
                    key=s.key,
                    value_length=len(s.value) if s.value else 0,
                    created_at=s.created_at,
                    updated_at=s.updated_at,
                )
                for s in secrets
            ]
        
        # Fetch resource permissions for this environment
        # Check if user can view all permissions (owner or admin)
        can_view_all_permissions = await can_grant_resource_permission(
            current_user, PermissionScope.ENVIRONMENT, id, db
        )
        
        # Always filter by scope and resource_id to ensure we only get permissions for this specific environment
        resource_perms_query = select(ResourcePermissionModel).where(
            ResourcePermissionModel.scope == PermissionScope.ENVIRONMENT,
            ResourcePermissionModel.resource_id == id  # Critical: ensure we only get permissions for this environment
        )
        
        # If user can't view all, only show their own permissions
        if not can_view_all_permissions:
            resource_perms_query = resource_perms_query.where(
                ResourcePermissionModel.user_id == current_user.get('id')
            )
        
        resource_perms_result = await db.execute(resource_perms_query)
        resource_perms = resource_perms_result.scalars().all()
        
        # Double-check: filter out any permissions that don't match this environment (defensive programming)
        resource_perms_list = [
            ResourcePermission(
                id=rp.id,
                user_id=rp.user_id,
                scope=rp.scope.value if hasattr(rp.scope, 'value') else rp.scope,
                resource_id=rp.resource_id,
                actions=rp.actions,
                granted_at=rp.granted_at,
                granted_by=rp.granted_by,
            )
            for rp in resource_perms
            if rp.scope == PermissionScope.ENVIRONMENT and rp.resource_id == id  # Extra validation
        ]
        
        return EnvironmentDetails(
            environment=env_type,
            permissions=permissions_obj,
            environmentVariables=env_vars_list,
            secrets=secrets_list,
            resourcePermissions=resource_perms_list,
        )
    
    @strawberry.field
    async def serviceDetails(self, id: str, info: Any = None) -> Optional[ServiceDetails]:
        """Get consolidated service details including permissions, env vars, and secrets in one query"""
        
        context = info.context
        db = context.db
        current_user = context.current_user
        
        if not current_user:
            raise Exception("Authentication required")
        
        # Fetch service
        result = await db.execute(
            select(ServiceModel)
            .options(selectinload(ServiceModel.project), selectinload(ServiceModel.environments))
            .where(ServiceModel.id == id, ServiceModel.deleted_at.is_(None))
        )
        svc = result.scalar_one_or_none()
        
        if not svc:
            return None
        
        svc_type = model_to_service(svc)
        
        # Build UserPermission object using check_resource_permission
        is_admin = current_user.get('is_admin', False)
        # For services, owner is the project owner
        project_result = await db.execute(
            select(ProjectModel).where(ProjectModel.id == svc.project_id, ProjectModel.deleted_at.is_(None))
        )
        project = project_result.scalar_one_or_none()
        is_owner = project and project.owner_id == current_user.get('id')
        
        # Check permissions using the existing check_resource_permission function
        can_read = await check_resource_permission(
            current_user, PermissionAction.READ, PermissionScope.SERVICE, id, db
        )
        can_write = await check_resource_permission(
            current_user, PermissionAction.WRITE, PermissionScope.SERVICE, id, db
        )
        can_delete = await check_resource_permission(
            current_user, PermissionAction.DELETE, PermissionScope.SERVICE, id, db
        )
        
        permissions_obj = ComputedUserPermission(
            can_read=can_read,
            can_write=can_write,
            can_delete=can_delete,
            is_admin=is_admin,
            is_owner=is_owner,
        )
        
        # Fetch environment variables
        env_vars_result = await db.execute(
            select(EnvironmentVariableModel).where(
                EnvironmentVariableModel.scope == VariableScope.SERVICE,
                EnvironmentVariableModel.resource_id == id,
                EnvironmentVariableModel.deleted_at.is_(None)
            )
        )
        env_vars = env_vars_result.scalars().all()
        
        # Check read permission for env vars
        has_env_var_access = await check_resource_permission(
            current_user, PermissionAction.READ, PermissionScope.SERVICE, id, db
        )
        
        env_vars_list = []
        if has_env_var_access:
            env_vars_list = [
                EnvironmentVariable(
                    id=e.id,
                    scope=e.scope.value,
                    resource_id=e.resource_id,
                    key=e.key,
                    value=e.value,
                    created_at=e.created_at,
                    updated_at=e.updated_at,
                )
                for e in env_vars
            ]
        
        # Fetch secrets
        secrets_result = await db.execute(
            select(SecretModel).where(
                SecretModel.scope == VariableScope.SERVICE,
                SecretModel.resource_id == id,
                SecretModel.deleted_at.is_(None)
            )
        )
        secrets = secrets_result.scalars().all()
        
        # Check read permission for secrets
        has_secret_access = await check_resource_permission(
            current_user, PermissionAction.READ, PermissionScope.SERVICE, id, db
        )
        
        secrets_list = []
        if has_secret_access:
            secrets_list = [
                Secret(
                    id=s.id,
                    scope=s.scope.value,
                    resource_id=s.resource_id,
                    key=s.key,
                    value_length=len(s.value) if s.value else 0,
                    created_at=s.created_at,
                    updated_at=s.updated_at,
                )
                for s in secrets
            ]
        
        # Fetch service configs
        service_configs_result = await db.execute(
            select(ServiceConfigModel).where(
                ServiceConfigModel.service_id == id,
                ServiceConfigModel.deleted_at.is_(None)
            )
        )
        service_configs = service_configs_result.scalars().all()
        
        # Check read permission for service configs (same as service read permission)
        has_config_access = await check_resource_permission(
            current_user, PermissionAction.READ, PermissionScope.SERVICE, id, db
        )
        
        service_configs_list = []
        if has_config_access:
            service_configs_list = [
                ServiceConfig(
                    id=sc.id,
                    service_id=sc.service_id,
                    key=sc.key,
                    value=sc.value,
                    config_data=json.dumps(sc.config_data) if sc.config_data else None,
                    created_at=sc.created_at,
                    updated_at=sc.updated_at,
                )
                for sc in service_configs
            ]
        
        # Fetch resource permissions for this service
        # Check if user can view all permissions (owner or admin)
        can_view_all_permissions = await can_grant_resource_permission(
            current_user, PermissionScope.SERVICE, id, db
        )
        
        # Always filter by scope and resource_id to ensure we only get permissions for this specific service
        resource_perms_query = select(ResourcePermissionModel).where(
            ResourcePermissionModel.scope == PermissionScope.SERVICE,
            ResourcePermissionModel.resource_id == id  # Critical: ensure we only get permissions for this service
        )
        
        # If user can't view all, only show their own permissions
        if not can_view_all_permissions:
            resource_perms_query = resource_perms_query.where(
                ResourcePermissionModel.user_id == current_user.get('id')
            )
        
        resource_perms_result = await db.execute(resource_perms_query)
        resource_perms = resource_perms_result.scalars().all()
        
        # Double-check: filter out any permissions that don't match this service (defensive programming)
        resource_perms_list = [
            ResourcePermission(
                id=rp.id,
                user_id=rp.user_id,
                scope=rp.scope.value if hasattr(rp.scope, 'value') else rp.scope,
                resource_id=rp.resource_id,
                actions=rp.actions,
                granted_at=rp.granted_at,
                granted_by=rp.granted_by,
            )
            for rp in resource_perms
            if rp.scope == PermissionScope.SERVICE and rp.resource_id == id  # Extra validation
        ]
        
        return ServiceDetails(
            service=svc_type,
            permissions=permissions_obj,
            environmentVariables=env_vars_list,
            secrets=secrets_list,
            serviceConfigs=service_configs_list,
            resourcePermissions=resource_perms_list,
        )
    
    @strawberry.field
    async def environments(
        self,
        skip: int = 0,
        limit: int = 100,
        project_id: Optional[str] = None,
        info: Any = None,
    ) -> PaginatedEnvironments:
        """Get list of environments with pagination"""
        context = info.context
        db = context.db
        current_user = context.current_user
        
        if not current_user:
            raise Exception("Authentication required")
        
        items, total = await resolve_environments(skip, limit, project_id, db, current_user)
        return PaginatedEnvironments(items=items, total=total)
    
    @strawberry.field
    async def environment(self, id: str, info: Any = None) -> Optional[Environment]:
        """Get environment by ID (any authenticated user)"""
        context = info.context
        db = context.db
        current_user = context.current_user
        
        if not current_user:
            raise Exception("Authentication required")
        
        result = await db.execute(
            select(EnvironmentModel)
            .options(selectinload(EnvironmentModel.project), selectinload(EnvironmentModel.services))
            .where(EnvironmentModel.id == id, EnvironmentModel.deleted_at.is_(None))
        )
        env = result.scalar_one_or_none()
        
        if not env:
            return None
        
        env_type = model_to_environment(env)
        # Attach cluster subset if mapped
        if getattr(env, "cluster_id", None):
            try:
                result2 = await db.execute(select(KubernetesClusterModel).where(KubernetesClusterModel.id == env.cluster_id))
                kc = result2.scalar_one_or_none()
                if kc:
                    env_type.cluster_id = kc.id
                    env_type.cluster = GqlKubernetesCluster(
                        id=kc.id,
                        name=kc.name,
                        description=kc.description,
                        api_url=kc.api_url,
                        auth_method=kc.auth_method.value if hasattr(kc.auth_method, "value") else str(kc.auth_method),
                        environment_type=(kc.environment_type.value if hasattr(kc.environment_type, "value") else kc.environment_type),
                        created_at=kc.created_at,
                        updated_at=kc.updated_at,
                        api_health=None,
                        cluster_connection=None,
                    )
            except Exception:
                pass
        return env_type
    
    @strawberry.field
    async def services(
        self,
        skip: int = 0,
        limit: int = 100,
        project_id: Optional[str] = None,
        environment_id: Optional[str] = None,
        info: Any = None,
    ) -> PaginatedServices:
        """Get list of services with pagination"""
        context = info.context
        db = context.db
        current_user = context.current_user
        
        if not current_user:
            raise Exception("Authentication required")
        
        items, total = await resolve_services(skip, limit, project_id, environment_id, db, current_user)
        return PaginatedServices(items=items, total=total)
    
    @strawberry.field
    async def service(self, id: str, info: Any = None) -> Optional[Service]:
        """Get service by ID (any authenticated user)"""
        context = info.context
        db = context.db
        current_user = context.current_user
        
        if not current_user:
            raise Exception("Authentication required")
        
        result = await db.execute(
            select(ServiceModel)
            .options(selectinload(ServiceModel.project), selectinload(ServiceModel.environments))
            .where(ServiceModel.id == id, ServiceModel.deleted_at.is_(None))
        )
        service = result.scalar_one_or_none()
        
        if not service:
            return None
        
        return model_to_service(service)
    
    @strawberry.field
    async def gitOrganizations(self, gitType: str, info: Any = None) -> List["GitOrganization"]:
        """Get list of Git organizations for a given Git type (GitHub, Bitbucket, GitLab)"""
        context = info.context
        current_user = context.current_user
        
        if not current_user:
            raise Exception("Authentication required")
        
        # TODO: Implement actual API calls to GitHub/Bitbucket/GitLab
        # For now, return empty list - this will be implemented with actual API integration
        # The implementation should:
        # 1. Get user's access token for the Git provider (from OAuth or stored credentials)
        # 2. Call the appropriate API:
        #    - GitHub: GET /user/orgs
        #    - Bitbucket: GET /2.0/workspaces
        #    - GitLab: GET /groups (user's groups)
        # 3. Map the response to GitOrganization type
        
        return []
    
    @strawberry.field
    async def gitRepositories(self, gitType: str, organization: str, info: Any = None) -> List["GitRepository"]:
        """Get list of Git repositories for a given Git type and organization"""
        context = info.context
        current_user = context.current_user
        
        if not current_user:
            raise Exception("Authentication required")
        
        # TODO: Implement actual API calls to GitHub/Bitbucket/GitLab
        # For now, return empty list - this will be implemented with actual API integration
        # The implementation should:
        # 1. Get user's access token for the Git provider (from OAuth or stored credentials)
        # 2. Call the appropriate API:
        #    - GitHub: GET /orgs/{org}/repos
        #    - Bitbucket: GET /2.0/repositories/{workspace}
        #    - GitLab: GET /groups/{id}/projects
        # 3. Map the response to GitRepository type
        
        return []
    
    @strawberry.field
    async def permissions(
        self,
        skip: int = 0,
        limit: int = 100,
        action: Optional[str] = None,
        resource: Optional[str] = None,
        info: Any = None,
    ) -> List[Permission]:
        """Get list of permission definitions (admin only)"""
        context = info.context
        db = context.db
        current_user = context.current_user
        
        if not current_user or not current_user.get('is_admin', False):
            raise Exception("Admin access required")
        
        query = select(PermissionModel)
        
        if action:
            try:
                query = query.where(PermissionModel.action == PermissionAction(action))
            except ValueError:
                raise Exception(f"Invalid action: {action}")
        
        if resource:
            try:
                query = query.where(PermissionModel.resource == PermissionResource(resource))
            except ValueError:
                raise Exception(f"Invalid resource: {resource}")
        
        result = await db.execute(query.offset(skip).limit(limit))
        permissions = result.scalars().all()
        
        return [
            Permission(
                id=p.id,
                name=p.name,
                action=p.action.value,
                resource=p.resource.value,
                description=p.description,
                created_at=p.created_at,
            )
            for p in permissions
        ]
    
    @strawberry.field
    async def permission(self, id: str, info: Any = None) -> Optional[Permission]:
        """Get permission definition by ID (admin only)"""
        context = info.context
        db = context.db
        current_user = context.current_user
        
        if not current_user or not current_user.get('is_admin', False):
            raise Exception("Admin access required")
        
        result = await db.execute(select(PermissionModel).where(PermissionModel.id == id))
        perm = result.scalar_one_or_none()
        
        if not perm:
            return None
        
        return Permission(
            id=perm.id,
            name=perm.name,
            action=perm.action.value,
            resource=perm.resource.value,
            description=perm.description,
            created_at=perm.created_at,
        )
    
    @strawberry.field
    async def user_permissions(
        self,
        skip: int = 0,
        limit: int = 100,
        user_id: Optional[str] = None,
        info: Any = None,
    ) -> List[UserPermission]:
        """Get list of user permissions (admin only)"""
        context = info.context
        db = context.db
        current_user = context.current_user
        
        if not current_user or not current_user.get('is_admin', False):
            raise Exception("Admin access required")
        
        query = select(UserPermissionModel).join(PermissionModel)
        
        if user_id:
            query = query.where(UserPermissionModel.user_id == user_id)
        
        result = await db.execute(query.offset(skip).limit(limit))
        user_perms = result.scalars().all()
        
        return [
            UserPermission(
                id=up.id,
                user_id=up.user_id,
                permission_id=up.permission_id,
                resource_id=up.resource_id,
                granted_at=up.granted_at,
                granted_by=up.granted_by,
            )
            for up in user_perms
        ]
    
    @strawberry.field
    async def user_permission(self, id: str, info: Any = None) -> Optional[UserPermission]:
        """Get user permission by ID (admin only)"""
        context = info.context
        db = context.db
        current_user = context.current_user
        
        if not current_user or not current_user.get('is_admin', False):
            raise Exception("Admin access required")
        
        result = await db.execute(select(UserPermissionModel).where(UserPermissionModel.id == id))
        user_perm = result.scalar_one_or_none()
        
        if not user_perm:
            return None
        
        return UserPermission(
            id=user_perm.id,
            user_id=user_perm.user_id,
            permission_id=user_perm.permission_id,
            resource_id=user_perm.resource_id,
            granted_at=user_perm.granted_at,
            granted_by=user_perm.granted_by,
        )
    
    @strawberry.field
    async def resource_permissions(
        self,
        skip: int = 0,
        limit: int = 100,
        user_id: Optional[str] = None,
        scope: Optional[str] = None,
        resource_id: Optional[str] = None,
        info: Any = None,
    ) -> List[ResourcePermission]:
        """Get list of resource permissions"""
        context = info.context
        db = context.db
        current_user = context.current_user
        
        if not current_user:
            raise Exception("Authentication required")
        
        # If querying by scope and resource_id, check if user can view all permissions for that resource
        # (i.e., they're owner or admin, which allows them to manage permissions)
        can_view_all = False
        if scope and resource_id:
            try:
                scope_enum = PermissionScope(scope.lower())
                # Check if user can grant permissions (owner or admin) - if so, they can view all permissions
                can_view_all = await can_grant_resource_permission(
                    current_user, scope_enum, resource_id, db
                )
            except Exception:
                pass  # If check fails, user can't view all
        
        # Users can only see their own permissions unless they're admin or can grant permissions
        if not current_user.get('is_admin', False) and not can_view_all:
            if user_id and user_id != current_user.get('id'):
                raise Exception("You can only view your own permissions")
            # Only filter by user_id if we're not viewing all permissions for a resource
            if not (scope and resource_id):
                user_id = current_user.get('id')
        
        query = select(ResourcePermissionModel)
        
        # Only filter by user_id if specified and user doesn't have permission to view all
        if user_id and not can_view_all:
            query = query.where(ResourcePermissionModel.user_id == user_id)
        
        if scope:
            try:
                scope_enum = PermissionScope(scope.lower())
                query = query.where(ResourcePermissionModel.scope == scope_enum)
            except ValueError:
                raise Exception(f"Invalid scope: {scope}. Must be 'project', 'environment', or 'service'")
        
        if resource_id:
            query = query.where(ResourcePermissionModel.resource_id == resource_id)
        
        result = await db.execute(query.offset(skip).limit(limit))
        resource_perms = result.scalars().all()
        
        # Double-check: filter out any permissions that don't match the requested scope/resource_id (defensive programming)
        # This is especially important when owner = current user, as they might have access to multiple resources
        filtered_perms = resource_perms
        if scope and resource_id:
            try:
                scope_enum = PermissionScope(scope.lower())
                filtered_perms = [
                    rp for rp in resource_perms
                    if rp.scope == scope_enum and rp.resource_id == resource_id
                ]
            except (ValueError, AttributeError):
                pass  # If scope validation fails, use original list
        
        return [
            ResourcePermission(
                id=rp.id,
                user_id=rp.user_id,
                scope=rp.scope.value if hasattr(rp.scope, 'value') else rp.scope,
                resource_id=rp.resource_id,
                actions=rp.actions or [],
                granted_at=rp.granted_at,
                granted_by=rp.granted_by,
            )
            for rp in filtered_perms
        ]
    
    @strawberry.field
    async def resource_permission(self, id: str, info: Any = None) -> Optional[ResourcePermission]:
        """Get resource permission by ID"""
        context = info.context
        db = context.db
        current_user = context.current_user
        
        if not current_user:
            raise Exception("Authentication required")
        
        result = await db.execute(select(ResourcePermissionModel).where(ResourcePermissionModel.id == id))
        rp = result.scalar_one_or_none()
        
        if not rp:
            return None
        
        # Users can only see their own permissions unless they're admin
        if not current_user.get('is_admin', False) and rp.user_id != current_user.get('id'):
            raise Exception("You can only view your own permissions")
        
        # Handle scope - it might be an enum or a string
        scope_value = rp.scope.value if hasattr(rp.scope, 'value') else rp.scope
        
        return ResourcePermission(
            id=rp.id,
            user_id=rp.user_id,
            scope=scope_value,
            resource_id=rp.resource_id,
            actions=rp.actions or [],
            granted_at=rp.granted_at,
            granted_by=rp.granted_by,
        )
    
    @strawberry.field
    async def environment_variables(
        self,
        scope: str,
        resource_id: str,
        info: Any = None,
    ) -> List[EnvironmentVariable]:
        """Get environment variables for a resource (project, environment, or service)"""
        context = info.context
        db = context.db
        current_user = context.current_user
        
        if not current_user:
            raise Exception("Authentication required")
        
        # Validate scope
        try:
            scope_enum = VariableScope(scope)
        except ValueError:
            raise Exception(f"Invalid scope: {scope}. Must be 'project', 'environment', or 'service'")
        
        # Check permissions based on scope
        if scope_enum == VariableScope.PROJECT:
            # Check if user has read access to the project
            has_access = await check_resource_permission(current_user, PermissionAction.READ, PermissionScope.PROJECT, resource_id, db)
            if not has_access:
                raise Exception("Permission denied. You don't have read access to this project.")
        elif scope_enum == VariableScope.ENVIRONMENT:
            # Check if user has read access to the environment
            has_access = await check_resource_permission(current_user, PermissionAction.READ, PermissionScope.ENVIRONMENT, resource_id, db)
            if not has_access:
                raise Exception("Permission denied. You don't have read access to this environment.")
        elif scope_enum == VariableScope.SERVICE:
            # Check if user has read access to the service
            has_access = await check_resource_permission(current_user, PermissionAction.READ, PermissionScope.SERVICE, resource_id, db)
            if not has_access:
                raise Exception("Permission denied. You don't have read access to this service.")
        
        result = await db.execute(
            select(EnvironmentVariableModel)
            .where(
                EnvironmentVariableModel.scope == scope_enum,
                EnvironmentVariableModel.resource_id == resource_id,
                EnvironmentVariableModel.deleted_at.is_(None)
            )
        )
        env_vars = result.scalars().all()
        
        return [
            EnvironmentVariable(
                id=ev.id,
                scope=ev.scope.value,
                resource_id=ev.resource_id,
                key=ev.key,
                value=ev.value,
                created_at=ev.created_at,
                updated_at=ev.updated_at,
            )
            for ev in env_vars
        ]
    
    @strawberry.field
    async def secrets(
        self,
        scope: str,
        resource_id: str,
        info: Any = None,
    ) -> List[Secret]:
        """Get secrets for a resource (project, environment, or service)"""
        context = info.context
        db = context.db
        current_user = context.current_user
        
        if not current_user:
            raise Exception("Authentication required")
        
        # Validate scope
        try:
            scope_enum = VariableScope(scope)
        except ValueError:
            raise Exception(f"Invalid scope: {scope}. Must be 'project', 'environment', or 'service'")
        
        # Check permissions based on scope
        if scope_enum == VariableScope.PROJECT:
            # Check if user has read access to the project
            has_access = await check_resource_permission(current_user, PermissionAction.READ, PermissionScope.PROJECT, resource_id, db)
            if not has_access:
                raise Exception("Permission denied. You don't have read access to this project.")
        elif scope_enum == VariableScope.ENVIRONMENT:
            # Check if user has read access to the environment
            has_access = await check_resource_permission(current_user, PermissionAction.READ, PermissionScope.ENVIRONMENT, resource_id, db)
            if not has_access:
                raise Exception("Permission denied. You don't have read access to this environment.")
        elif scope_enum == VariableScope.SERVICE:
            # Check if user has read access to the service
            has_access = await check_resource_permission(current_user, PermissionAction.READ, PermissionScope.SERVICE, resource_id, db)
            if not has_access:
                raise Exception("Permission denied. You don't have read access to this service.")
        
        result = await db.execute(
            select(SecretModel)
            .where(
                SecretModel.scope == scope_enum,
                SecretModel.resource_id == resource_id,
                SecretModel.deleted_at.is_(None)
            )
        )
        secrets = result.scalars().all()
        
        return [
            Secret(
                id=s.id,
                scope=s.scope.value,
                resource_id=s.resource_id,
                key=s.key,
                value_length=len(s.value) if s.value else 0,  # Only return length, not the actual value
                created_at=s.created_at,
                updated_at=s.updated_at,
            )
            for s in secrets
        ]


# Helper function to check write permission for a scope/resource_id
async def check_scope_write_permission(
    scope: VariableScope,
    resource_id: str,
    current_user: dict,
    db: AsyncSession,
) -> bool:
    """Optimized permission check for variable/secret scope"""
    user_id = current_user.get('id')
    is_admin = current_user.get('is_admin', False)
    
    if scope == VariableScope.PROJECT:
        project_result = await db.execute(
            select(ProjectModel).where(ProjectModel.id == resource_id, ProjectModel.deleted_at.is_(None))
        )
        project = project_result.scalar_one_or_none()
        if not project:
            return False
        
        if is_admin or project.owner_id == user_id:
            return True
        
        perm_result = await db.execute(
            select(ResourcePermissionModel).where(
                ResourcePermissionModel.user_id == user_id,
                ResourcePermissionModel.scope == PermissionScope.PROJECT.value,
                ResourcePermissionModel.resource_id == resource_id,
            )
        )
        resource_perm = perm_result.scalar_one_or_none()
        return resource_perm and resource_perm.actions and 'write' in resource_perm.actions
    
    elif scope == VariableScope.ENVIRONMENT:
        env_result = await db.execute(
            select(EnvironmentModel).where(EnvironmentModel.id == resource_id, EnvironmentModel.deleted_at.is_(None))
        )
        env = env_result.scalar_one_or_none()
        if not env:
            return False
        
        project_result = await db.execute(
            select(ProjectModel).where(ProjectModel.id == env.project_id, ProjectModel.deleted_at.is_(None))
        )
        project = project_result.scalar_one_or_none()
        
        if is_admin or (project and project.owner_id == user_id):
            return True
        
        # Check direct environment permission
        perm_result = await db.execute(
            select(ResourcePermissionModel).where(
                ResourcePermissionModel.user_id == user_id,
                ResourcePermissionModel.scope == PermissionScope.ENVIRONMENT.value,
                ResourcePermissionModel.resource_id == resource_id,
            )
        )
        env_perm = perm_result.scalar_one_or_none()
        if env_perm and env_perm.actions and 'write' in env_perm.actions:
            return True
        
        # Check project-level permission inheritance
        if project:
            proj_perm_result = await db.execute(
                select(ResourcePermissionModel).where(
                    ResourcePermissionModel.user_id == user_id,
                    ResourcePermissionModel.scope == PermissionScope.PROJECT.value,
                    ResourcePermissionModel.resource_id == env.project_id,
                )
            )
            proj_perm = proj_perm_result.scalar_one_or_none()
            if proj_perm and proj_perm.actions and 'write' in proj_perm.actions:
                return True
        
        return False
    
    elif scope == VariableScope.SERVICE:
        service_result = await db.execute(
            select(ServiceModel).options(selectinload(ServiceModel.project))
            .where(ServiceModel.id == resource_id, ServiceModel.deleted_at.is_(None))
        )
        service = service_result.scalar_one_or_none()
        if not service:
            return False
        
        if is_admin or (service.project and service.project.owner_id == user_id):
            return True
        
        # Check direct service permission
        perm_result = await db.execute(
            select(ResourcePermissionModel).where(
                ResourcePermissionModel.user_id == user_id,
                ResourcePermissionModel.scope == PermissionScope.SERVICE.value,
                ResourcePermissionModel.resource_id == resource_id,
            )
        )
        service_perm = perm_result.scalar_one_or_none()
        if service_perm and service_perm.actions and 'write' in service_perm.actions:
            return True
        
        # Check project-level permission inheritance
        if service.project:
            proj_perm_result = await db.execute(
                select(ResourcePermissionModel).where(
                    ResourcePermissionModel.user_id == user_id,
                    ResourcePermissionModel.scope == PermissionScope.PROJECT.value,
                    ResourcePermissionModel.resource_id == service.project_id,
                )
            )
            proj_perm = proj_perm_result.scalar_one_or_none()
            if proj_perm and proj_perm.actions and 'write' in proj_perm.actions:
                return True
        
        return False
    
    return False


@strawberry.type
class Mutation:
    """GraphQL Mutation type"""
    
    @strawberry.mutation
    async def add_cluster(self, input: ClusterCreateInput, info: Any = None) -> "GqlKubernetesCluster":
        """Add a new Kubernetes cluster (admin only)."""
        context = info.context
        db: AsyncSession = context.db
        current_user = context.current_user
        if not current_user:
            raise Exception("Authentication required")
        if not (current_user.get('is_admin', False) or current_user.get('is_super_admin', False)):
            raise Exception("Access denied")
        # Basic validation
        if not input.name.strip():
            raise Exception("Cluster name is required")
        if not input.api_url.strip():
            raise Exception("API URL is required")
        # Map auth method
        try:
            auth_method = KubeAuthMethod(input.auth_method)
        except Exception:
            raise Exception("Invalid auth_method")
        # Create model
        model = KubernetesClusterModel(
            name=input.name.strip(),
            description=(input.description or None),
            api_url=input.api_url.strip(),
            auth_method=auth_method,
            environment_type=(input.environment_type or None),
            kubeconfig_content=encrypt_secret(input.kubeconfig_content),
            token=encrypt_secret(input.token),
            client_key=encrypt_secret(input.client_key),
            client_cert=encrypt_secret(input.client_cert),
            client_ca_cert=encrypt_secret(input.client_ca_cert),
        )
        db.add(model)
        try:
            await db.flush()
            await db.commit()
            # Load server-populated defaults (e.g., created_at)
            await db.refresh(model)
        except IntegrityError as e:
            raise Exception(f"Failed to add cluster: {str(e)}")
        return GqlKubernetesCluster(
            id=model.id,
            name=model.name,
            description=model.description,
            api_url=model.api_url,
            auth_method=model.auth_method.value,
            environment_type=(model.environment_type.value if hasattr(model.environment_type, "value") else model.environment_type),
            created_at=model.created_at,
            updated_at=model.updated_at,
        )

    @strawberry.mutation
    async def update_cluster(self, input: ClusterUpdateInput, info: Any = None) -> "GqlKubernetesCluster":
        """Update an existing Kubernetes cluster (admin only)."""
        context = info.context
        db: AsyncSession = context.db
        current_user = context.current_user
        if not current_user:
            raise Exception("Authentication required")
        if not (current_user.get('is_admin', False) or current_user.get('is_super_admin', False)):
            raise Exception("Access denied")
        # Load model
        result = await db.execute(select(KubernetesClusterModel).where(KubernetesClusterModel.id == input.id))
        model = result.scalars().first()
        if not model:
            raise Exception("Cluster not found")
        # Apply updates
        if input.name is not None:
            model.name = input.name.strip()
        if input.api_url is not None:
            model.api_url = input.api_url.strip()
        if input.description is not None:
            model.description = input.description
        if input.auth_method is not None:
            try:
                model.auth_method = KubeAuthMethod(input.auth_method)
            except Exception:
                raise Exception("Invalid auth_method")
        if input.environment_type is not None:
            model.environment_type = input.environment_type
        if input.kubeconfig_content is not None:
            model.kubeconfig_content = encrypt_secret(input.kubeconfig_content)
        if input.token is not None:
            model.token = encrypt_secret(input.token)
        if input.client_key is not None:
            model.client_key = encrypt_secret(input.client_key)
        if input.client_cert is not None:
            model.client_cert = encrypt_secret(input.client_cert)
        if input.client_ca_cert is not None:
            model.client_ca_cert = encrypt_secret(input.client_ca_cert)
        try:
            await db.flush()
            await db.commit()
            await db.refresh(model)
        except IntegrityError as e:
            raise Exception(f"Failed to update cluster: {str(e)}")
        return GqlKubernetesCluster(
            id=model.id,
            name=model.name,
            description=model.description,
            api_url=model.api_url,
            auth_method=model.auth_method.value if hasattr(model.auth_method, "value") else str(model.auth_method),
            environment_type=(model.environment_type.value if hasattr(model.environment_type, "value") else model.environment_type),
            created_at=model.created_at,
            updated_at=model.updated_at,
        )

    @strawberry.mutation
    async def create_admin_config(self, input: AdminConfigCreateInput, info: Any = None) -> AdminConfig:
        """Create or upsert an admin config entry (admin only)."""
        from app.core.config import load_admin_configs
        context = info.context
        db: AsyncSession = context.db
        current_user = context.current_user
        if not current_user:
            raise Exception("Authentication required")
        if not (current_user.get('is_admin', False) or current_user.get('is_super_admin', False)):
            raise Exception("Access denied")
        # Upsert: update if key exists, else create
        result = await db.execute(select(AdminConfigModel).where(AdminConfigModel.key == input.key))
        existing = result.scalar_one_or_none()
        if existing:
            existing.value = input.value
            existing.config_data = json.loads(input.config_data) if input.config_data else None
            existing.updated_at = datetime.now()
            await db.commit()
            await db.refresh(existing)
            model = existing
        else:
            model = AdminConfigModel(
                key=input.key,
                value=input.value,
                config_data=json.loads(input.config_data) if input.config_data else None,
            )
            db.add(model)
            await db.commit()
            await db.refresh(model)
        # Reload admin configs into global settings
        await load_admin_configs()
        return AdminConfig(
            id=model.id,
            key=model.key,
            value=model.value,
            config_data=json.dumps(model.config_data) if model.config_data else None,
            created_at=model.created_at,
            updated_at=model.updated_at,
        )

    @strawberry.mutation
    async def update_admin_config(self, key: str, input: AdminConfigUpdateInput, info: Any = None) -> AdminConfig:
        """Update an admin config by key (admin only)."""
        from app.core.config import load_admin_configs
        context = info.context
        db: AsyncSession = context.db
        current_user = context.current_user
        if not current_user:
            raise Exception("Authentication required")
        if not (current_user.get('is_admin', False) or current_user.get('is_super_admin', False)):
            raise Exception("Access denied")
        result = await db.execute(select(AdminConfigModel).where(AdminConfigModel.key == key))
        model = result.scalar_one_or_none()
        if not model:
            raise Exception(f"Admin config '{key}' not found")
        if input.value is not None:
            model.value = input.value
        if input.config_data is not None:
            model.config_data = json.loads(input.config_data) if input.config_data else None
        model.updated_at = datetime.now()
        await db.commit()
        await db.refresh(model)
        # Reload admin configs into global settings
        await load_admin_configs()
        return AdminConfig(
            id=model.id,
            key=model.key,
            value=model.value,
            config_data=json.dumps(model.config_data) if model.config_data else None,
            created_at=model.created_at,
            updated_at=model.updated_at,
        )

    @strawberry.mutation
    async def delete_admin_config(self, key: str, info: Any = None) -> bool:
        """Delete an admin config by key (admin only)."""
        from app.core.config import load_admin_configs
        context = info.context
        db: AsyncSession = context.db
        current_user = context.current_user
        if not current_user:
            raise Exception("Authentication required")
        if not (current_user.get('is_admin', False) or current_user.get('is_super_admin', False)):
            raise Exception("Access denied")
        result = await db.execute(select(AdminConfigModel).where(AdminConfigModel.key == key))
        model = result.scalar_one_or_none()
        if not model:
            raise Exception(f"Admin config '{key}' not found")
        await db.delete(model)
        await db.commit()
        # Reload admin configs into global settings
        await load_admin_configs()
        return True

    @strawberry.mutation
    async def create_user(self, input: UserCreateInput, info: Any = None) -> User:
        """Create a new user (admin only)"""
        context = info.context
        db = context.db
        current_user = context.current_user
        
        if not current_user or not current_user.get('is_admin', False):
            raise Exception("Admin access required")
        
        # Check if user exists (excluding soft-deleted users)
        result = await db.execute(select(UserModel).where(UserModel.email == input.email, UserModel.deleted_at.is_(None)))
        existing = result.scalar_one_or_none()
        if existing:
            raise Exception("User with this email already exists")
        
        # Create new user
        new_user = UserModel(
            email=input.email,
            name=input.name,
            is_active=input.is_active,
            is_admin=input.is_admin,
        )
        db.add(new_user)
        await db.commit()
        await db.refresh(new_user)
        
        return model_to_user(new_user)
    
    @strawberry.mutation
    async def update_user(self, id: str, input: UserUpdateInput, info: Any = None) -> User:
        """Update user"""
        context = info.context
        db = context.db
        current_user = context.current_user
        
        if not current_user:
            raise Exception("Authentication required")
        
        # Check permissions
        if id != current_user.get('id') and not current_user.get('is_admin', False):
            raise Exception("Not enough permissions")
        
        # Get existing user (excluding soft-deleted users)
        result = await db.execute(select(UserModel).where(UserModel.id == id, UserModel.deleted_at.is_(None)))
        user = result.scalar_one_or_none()
        if not user:
            raise Exception("User not found")
        
        # Update user fields
        if input.email is not None:
            user.email = input.email
        if input.name is not None:
            user.name = input.name
        if input.is_active is not None:
            user.is_active = input.is_active
        if input.is_admin is not None and current_user.get('is_admin', False):
            user.is_admin = input.is_admin
        
        await db.commit()
        await db.refresh(user)
        
        return model_to_user(user)
    
    @strawberry.mutation
    async def delete_user(self, id: str, info: Any = None) -> bool:
        """Soft delete user (admin only) - sets deleted_at timestamp"""
        context = info.context
        db = context.db
        current_user = context.current_user
        
        if not current_user or not current_user.get('is_admin', False):
            raise Exception("Admin access required")
        
        result = await db.execute(select(UserModel).where(UserModel.id == id, UserModel.deleted_at.is_(None)))
        user = result.scalar_one_or_none()
        if not user:
            raise Exception("User not found")
        
        # Soft delete: set deleted_at timestamp
        from datetime import datetime, timezone
        user.deleted_at = datetime.now(timezone.utc)
        await db.commit()
        return True


    @strawberry.mutation
    async def cancel_workflow(
        self,
        serviceId: str,
        workflowId: str,
        info: Any = None,
    ) -> bool:
        """
        Cancel a workflow execution. Requires write permission.
        """
        context = info.context
        current_user = context.current_user
        if not current_user:
            raise Exception("Authentication required")
        if not current_user.get('is_admin', False):
            db: AsyncSession = context.db
            has_access = await check_resource_permission(
                current_user,
                PermissionAction.WRITE,
                PermissionScope.SERVICE,
                serviceId,
                db,
            )
            if not has_access:
                raise Exception("Access denied")

        client = create_dbos_client()
        try:
            client.cancel_workflow(workflowId)
            return True
        finally:
            client.destroy()

    @strawberry.mutation
    async def resume_workflow(
        self,
        serviceId: str,
        workflowId: str,
        info: Any = None,
    ) -> bool:
        """
        Resume a paused workflow. Requires write permission.
        """
        context = info.context
        current_user = context.current_user
        if not current_user:
            raise Exception("Authentication required")
        if not current_user.get('is_admin', False):
            db: AsyncSession = context.db
            has_access = await check_resource_permission(
                current_user,
                PermissionAction.WRITE,
                PermissionScope.SERVICE,
                serviceId,
                db,
            )
            if not has_access:
                raise Exception("Access denied")

        client = create_dbos_client()
        try:
            client.resume_workflow(workflowId)
            return True
        finally:
            client.destroy()

    @strawberry.mutation
    async def fork_workflow(
        self,
        serviceId: str,
        workflowId: str,
        startStep: int,
        applicationVersion: Optional[str] = None,
        info: Any = None,
    ) -> str:
        """
        Fork a workflow from a given step. Requires write permission.
        """
        context = info.context
        current_user = context.current_user
        if not current_user:
            raise Exception("Authentication required")
        if not current_user.get('is_admin', False):
            db: AsyncSession = context.db
            has_access = await check_resource_permission(
                current_user,
                PermissionAction.WRITE,
                PermissionScope.SERVICE,
                serviceId,
                db,
            )
            if not has_access:
                raise Exception("Access denied")

        client = create_dbos_client()
        try:
            handle = client.fork_workflow(workflowId, startStep, application_version=applicationVersion)
            return handle.get_workflow_id()
        finally:
            client.destroy()

    @strawberry.mutation
    async def send_workflow_message(
        self,
        serviceId: str,
        destinationId: str,
        message: str,
        topic: Optional[str] = None,
        idempotencyKey: Optional[str] = None,
        info: Any = None,
    ) -> bool:
        """
        Send a message to a workflow (or destination). Requires write permission.
        """
        context = info.context
        current_user = context.current_user
        if not current_user:
            raise Exception("Authentication required")
        if not current_user.get('is_admin', False):
            db: AsyncSession = context.db
            has_access = await check_resource_permission(
                current_user,
                PermissionAction.WRITE,
                PermissionScope.SERVICE,
                serviceId,
                db,
            )
            if not has_access:
                raise Exception("Access denied")

        client = create_dbos_client()
        try:
            # message is passed as string. Applications can decide to JSON.parse on the receiver.
            client.send(destinationId, message, topic, idempotency_key=idempotencyKey)
            return True
        finally:
            client.destroy()
    
    @strawberry.mutation
    async def create_project(self, input: ProjectCreateInput, info: Any = None) -> Project:
        """Create a new project - any authenticated user can create projects"""
        context = info.context
        db = context.db
        current_user = context.current_user
        
        if not current_user:
            raise Exception("Authentication required")
        
        # Check if project with this name already exists (excluding soft-deleted projects)
        # Optimize: Use EXISTS subquery for faster check
        existing_check = await db.execute(
            select(exists().where(
                ProjectModel.name == input.name,
                ProjectModel.deleted_at.is_(None)
            ))
        )
        if existing_check.scalar():
            raise Exception(f"Project with name '{input.name}' already exists")
        
        # Any authenticated user can create a project
        # The creator is automatically assigned as owner
        owner_id = input.owner_id or current_user.get('id')
        
        try:
            # Create new project
            new_project = ProjectModel(
                name=input.name,
                description=input.description,
                owner_id=owner_id,
            )
            db.add(new_project)
            await db.commit()
            await db.refresh(new_project)
            
            # Automatically grant ADMIN permission to the project owner for their own project
            # This allows them to manage the project they created
            # Use enum value explicitly since PostgreSQL enum expects lowercase string "project"
            resource_perm = ResourcePermissionModel(
                user_id=owner_id,
                scope=PermissionScope.PROJECT.value,  # Use .value to get "project" string for PostgreSQL enum
                resource_id=new_project.id,
                actions=["read", "write", "delete", "admin"],  # Full access for project owner
                granted_by=current_user.get('id'),
            )
            db.add(resource_perm)
            await db.commit()
        except IntegrityError as e:
            await db.rollback()
            if "uq_project_name" in str(e.orig) or "unique constraint" in str(e.orig).lower():
                raise Exception(f"Project with name '{input.name}' already exists")
            raise Exception(f"Failed to create project: {str(e)}")
        
        # Load relationships
        result = await db.execute(
            select(ProjectModel)
            .options(
                selectinload(ProjectModel.environments).selectinload(EnvironmentModel.services),
                selectinload(ProjectModel.services)
            )
            .where(ProjectModel.id == new_project.id)
        )
        project = result.scalar_one()
        
        return model_to_project(project)
    
    @strawberry.mutation
    async def update_project(self, id: str, input: ProjectUpdateInput, info: Any = None) -> Project:
        """Update project"""
        context = info.context
        db = context.db
        current_user = context.current_user
        
        if not current_user:
            raise Exception("Authentication required")
        
        # Get existing project (excluding soft-deleted projects)
        result = await db.execute(
            select(ProjectModel)
            .options(
                selectinload(ProjectModel.environments).selectinload(EnvironmentModel.services),
                selectinload(ProjectModel.services)
            )
            .where(ProjectModel.id == id, ProjectModel.deleted_at.is_(None))
        )
        project = result.scalar_one_or_none()
        if not project:
            raise Exception("Project not found")
        
        # Check access - owners and users with WRITE permission can update
        # Optimize: Check ownership first (no DB query needed if owner)
        user_id = current_user.get('id')
        is_admin = current_user.get('is_admin', False)
        has_access = False
        
        if is_admin or project.owner_id == user_id:
            has_access = True
        else:
            # Only check resource permissions if not admin/owner
            # Optimize: Single query to check project write permission
            perm_result = await db.execute(
                select(ResourcePermissionModel).where(
                    ResourcePermissionModel.user_id == user_id,
                    ResourcePermissionModel.scope == PermissionScope.PROJECT.value,
                    ResourcePermissionModel.resource_id == id,
                )
            )
            resource_perm = perm_result.scalar_one_or_none()
            if resource_perm and resource_perm.actions and 'write' in resource_perm.actions:
                has_access = True
        
        if not has_access:
            raise Exception("Access denied")
        
        # Update project fields
        if input.name is not None:
            # Check if another project with this name already exists (excluding soft-deleted projects)
            # Optimize: Use EXISTS subquery for faster check
            existing_check = await db.execute(
                select(exists().where(
                    ProjectModel.name == input.name,
                    ProjectModel.id != id,
                    ProjectModel.deleted_at.is_(None)
                ))
            )
            if existing_check.scalar():
                raise Exception(f"Project with name '{input.name}' already exists")
            project.name = input.name
        if input.description is not None:
            project.description = input.description
        if input.owner_id is not None:
            project.owner_id = input.owner_id
        
        try:
            await db.commit()
            await db.refresh(project)
        except IntegrityError as e:
            await db.rollback()
            if "uq_project_name" in str(e.orig) or "unique constraint" in str(e.orig).lower():
                raise Exception(f"Project with name '{input.name or project.name}' already exists")
            raise Exception(f"Failed to update project: {str(e)}")
        
        return model_to_project(project)
    
    @strawberry.mutation
    async def delete_project(self, id: str, info: Any = None) -> bool:
        """Soft delete project (ADMIN permission required) - sets deleted_at timestamp"""
        context = info.context
        db = context.db
        current_user = context.current_user
        
        if not current_user:
            raise Exception("Authentication required")
        
        # Get project to check access
        result = await db.execute(select(ProjectModel).where(ProjectModel.id == id, ProjectModel.deleted_at.is_(None)))
        project = result.scalar_one_or_none()
        if not project:
            raise Exception("Project not found")
        
        # Only ADMIN can delete resources
        # Optimize: Check ownership first (no DB query needed if owner)
        user_id = current_user.get('id')
        is_admin = current_user.get('is_admin', False)
        has_access = False
        
        if is_admin or project.owner_id == user_id:
            has_access = True
        else:
            # Only check resource permissions if not admin/owner
            # Optimize: Single query to check project admin permission
            perm_result = await db.execute(
                select(ResourcePermissionModel).where(
                    ResourcePermissionModel.user_id == user_id,
                    ResourcePermissionModel.scope == PermissionScope.PROJECT.value,
                    ResourcePermissionModel.resource_id == id,
                )
            )
            resource_perm = perm_result.scalar_one_or_none()
            if resource_perm and resource_perm.actions and 'admin' in resource_perm.actions:
                has_access = True
        
        if not has_access:
            raise Exception("Access denied: ADMIN permission required to delete resources")
        
        # Soft delete: set deleted_at timestamp
        from datetime import datetime, timezone
        project.deleted_at = datetime.now(timezone.utc)
        await db.commit()
        return True
    
    @strawberry.mutation
    async def create_environment(self, input: EnvironmentCreateInput, info: Any = None) -> Environment:
        """Create a new environment"""
        context = info.context
        db = context.db
        current_user = context.current_user
        
        if not current_user:
            raise Exception("Authentication required")
        
        user_id = current_user.get('id')
        is_admin = current_user.get('is_admin', False)
        
        # Optimize: Load project with owner relationship in one query
        project_result = await db.execute(
            select(ProjectModel)
            .where(ProjectModel.id == input.project_id, ProjectModel.deleted_at.is_(None))
        )
        project = project_result.scalar_one_or_none()
        if not project:
            raise Exception("Project not found")
        
        # Check if user has write permission on the project
        # Optimize: Check ownership first (no DB query needed if owner)
        has_access = False
        if is_admin or project.owner_id == user_id:
            has_access = True
        else:
            # Only check resource permissions if not admin/owner
            # Optimize: Single query to check project write permission
            from app.models.permission import ResourcePermission as ResourcePermissionModel
            perm_result = await db.execute(
                select(ResourcePermissionModel).where(
                    ResourcePermissionModel.user_id == user_id,
                    ResourcePermissionModel.scope == PermissionScope.PROJECT.value,
                    ResourcePermissionModel.resource_id == input.project_id,
                )
            )
            resource_perm = perm_result.scalar_one_or_none()
            if resource_perm and resource_perm.actions and 'write' in resource_perm.actions:
                has_access = True
        
        if not has_access:
            raise Exception("Access denied: You need write permission on the project to create environments")
        
        # Check if environment with this name already exists in the project (excluding soft-deleted environments)
        # Optimize: Use EXISTS subquery for faster check
        existing_check = await db.execute(
            select(exists().where(
                EnvironmentModel.name == input.name,
                EnvironmentModel.project_id == input.project_id,
                EnvironmentModel.deleted_at.is_(None)
            ))
        )
        if existing_check.scalar():
            raise Exception(f"Environment with name '{input.name}' already exists in this project")
        
        # Create new environment
        from app.models.environment import EnvironmentType
        try:
            # Convert input type string to enum
            env_type_enum = EnvironmentType(input.type)
            new_env = EnvironmentModel(
                name=input.name,
                type=env_type_enum,
                url=input.url,
                project_id=input.project_id,
            )
            db.add(new_env)
            await db.commit()
            await db.refresh(new_env)
        except IntegrityError as e:
            await db.rollback()
            if "uq_environment_name_project" in str(e.orig) or "unique constraint" in str(e.orig).lower():
                raise Exception(f"Environment with name '{input.name}' already exists in this project")
            raise Exception(f"Failed to create environment: {str(e)}")
        
        # Reload environment with relationships to avoid lazy loading issues
        result = await db.execute(
            select(EnvironmentModel)
            .options(selectinload(EnvironmentModel.project), selectinload(EnvironmentModel.services))
            .where(EnvironmentModel.id == new_env.id)
        )
        env = result.scalar_one()
        
        return model_to_environment(env)
    
    @strawberry.mutation
    async def create_service(self, input: ServiceCreateInput, info: Any = None) -> Service:
        """Create a new service"""
        context = info.context
        db = context.db
        current_user = context.current_user
        
        if not current_user:
            raise Exception("Authentication required")
        
        # Check project access (excluding soft-deleted projects)
        project_result = await db.execute(select(ProjectModel).where(ProjectModel.id == input.project_id, ProjectModel.deleted_at.is_(None)))
        project = project_result.scalar_one_or_none()
        if not project:
            raise Exception("Project not found")
        
        # Check if user has write permission on the project
        # Optimize: Check ownership first (no DB query needed if owner)
        user_id = current_user.get('id')
        is_admin = current_user.get('is_admin', False)
        has_access = False
        
        if is_admin or project.owner_id == user_id:
            has_access = True
        else:
            # Only check resource permissions if not admin/owner
            # Optimize: Single query to check project write permission
            perm_result = await db.execute(
                select(ResourcePermissionModel).where(
                    ResourcePermissionModel.user_id == user_id,
                    ResourcePermissionModel.scope == PermissionScope.PROJECT.value,
                    ResourcePermissionModel.resource_id == input.project_id,
                )
            )
            resource_perm = perm_result.scalar_one_or_none()
            if resource_perm and resource_perm.actions and 'write' in resource_perm.actions:
                has_access = True
        
        if not has_access:
            raise Exception("Access denied")
        
        # Check if service with this name already exists in the project (excluding soft-deleted services)
        # Optimize: Use EXISTS subquery for faster check
        existing_check = await db.execute(
            select(exists().where(
                ServiceModel.name == input.name,
                ServiceModel.project_id == input.project_id,
                ServiceModel.deleted_at.is_(None)
            ))
        )
        if existing_check.scalar():
            raise Exception(f"Service with name '{input.name}' already exists in this project")
        
        # Create new service
        from app.models.service import ServiceType, ServiceStatus, service_environment_association
        try:
            new_service = ServiceModel(
                name=input.name,
                description=input.description,
                type=ServiceType(input.type),
                project_id=input.project_id,
                owner=input.owner,
                status=ServiceStatus(input.status),
            )
            db.add(new_service)
            await db.flush()  # Flush to get the service ID without committing
            
            # Link service to environments if provided
            if input.environment_ids:
                # Verify all environments exist and belong to the same project
                env_result = await db.execute(
                    select(EnvironmentModel).where(
                        EnvironmentModel.id.in_(input.environment_ids),
                        EnvironmentModel.project_id == input.project_id,
                        EnvironmentModel.deleted_at.is_(None)
                    )
                )
                environments = env_result.scalars().all()
                
                if len(environments) != len(input.environment_ids):
                    await db.rollback()
                    raise Exception("One or more environments not found or don't belong to this project")
                
                # Create associations
                for env in environments:
                    await db.execute(
                        service_environment_association.insert().values(
                            service_id=new_service.id,
                            environment_id=env.id
                        )
                    )
            
            await db.commit()
            await db.refresh(new_service)
        except IntegrityError as e:
            await db.rollback()
            if "uq_service_name_project" in str(e.orig) or "unique constraint" in str(e.orig).lower():
                raise Exception(f"Service with name '{input.name}' already exists in this project")
            raise Exception(f"Failed to create service: {str(e)}")
        
        # Reload service with relationships to avoid lazy loading issues
        result = await db.execute(
            select(ServiceModel)
            .options(selectinload(ServiceModel.project), selectinload(ServiceModel.environments))
            .where(ServiceModel.id == new_service.id)
        )
        service = result.scalar_one()
        
        return model_to_service(service)
    
    @strawberry.mutation
    async def update_environment(self, id: str, input: EnvironmentUpdateInput, info: Any = None) -> Environment:
        """Update environment"""
        context = info.context
        db = context.db
        current_user = context.current_user
        
        if not current_user:
            raise Exception("Authentication required")
        
        result = await db.execute(
            select(EnvironmentModel)
            .options(selectinload(EnvironmentModel.project))
            .where(EnvironmentModel.id == id, EnvironmentModel.deleted_at.is_(None))
        )
        env = result.scalar_one_or_none()
        if not env:
            raise Exception("Environment not found")
        
        # Check access
        # Optimize: Check ownership first (no DB query needed if owner)
        user_id = current_user.get('id')
        is_admin = current_user.get('is_admin', False)
        has_access = False
        
        # Check project ownership (environment inherits from project)
        project_result = await db.execute(
            select(ProjectModel).where(ProjectModel.id == env.project_id, ProjectModel.deleted_at.is_(None))
        )
        project = project_result.scalar_one_or_none()
        
        if is_admin or (project and project.owner_id == user_id):
            has_access = True
        else:
            # Check direct environment permission
            perm_result = await db.execute(
                select(ResourcePermissionModel).where(
                    ResourcePermissionModel.user_id == user_id,
                    ResourcePermissionModel.scope == PermissionScope.ENVIRONMENT.value,
                    ResourcePermissionModel.resource_id == id,
                )
            )
            env_perm = perm_result.scalar_one_or_none()
            if env_perm and env_perm.actions and 'write' in env_perm.actions:
                has_access = True
            else:
                # Check project-level permission inheritance
                if project:
                    proj_perm_result = await db.execute(
                        select(ResourcePermissionModel).where(
                            ResourcePermissionModel.user_id == user_id,
                            ResourcePermissionModel.scope == PermissionScope.PROJECT.value,
                            ResourcePermissionModel.resource_id == env.project_id,
                        )
                    )
                    proj_perm = proj_perm_result.scalar_one_or_none()
                    if proj_perm and proj_perm.actions and 'write' in proj_perm.actions:
                        has_access = True
        
        if not has_access:
            raise Exception("Access denied")
        
        # Update environment fields
        if input.name is not None:
            # Check if another environment with this name already exists in the project (excluding soft-deleted environments)
            # Optimize: Use EXISTS subquery for faster check
            existing_check = await db.execute(
                select(exists().where(
                    EnvironmentModel.name == input.name,
                    EnvironmentModel.project_id == env.project_id,
                    EnvironmentModel.id != id,
                    EnvironmentModel.deleted_at.is_(None)
                ))
            )
            if existing_check.scalar():
                raise Exception(f"Environment with name '{input.name}' already exists in this project")
            env.name = input.name
        if input.type is not None:
            from app.models.environment import EnvironmentType
            env.type = EnvironmentType(input.type)
        if input.url is not None:
            env.url = input.url
        if input.cluster_id is not None:
            # Empty string clears mapping
            cid = (input.cluster_id or "").strip()
            if cid == "":
                env.cluster_id = None
            else:
                # Validate cluster existence
                kc_result = await db.execute(select(KubernetesClusterModel).where(KubernetesClusterModel.id == cid))
                kc = kc_result.scalar_one_or_none()
                if not kc:
                    raise Exception("Cluster not found")
                env.cluster_id = cid
        if input.project_id is not None:
            # Verify the new project exists and user has write access to it
            new_project_result = await db.execute(
                select(ProjectModel).where(ProjectModel.id == input.project_id, ProjectModel.deleted_at.is_(None))
            )
            new_project = new_project_result.scalar_one_or_none()
            if not new_project:
                raise Exception(f"Project with id '{input.project_id}' not found")
            
            # Check if user has write access to the new project
            has_new_project_access = False
            if is_admin or new_project.owner_id == user_id:
                has_new_project_access = True
            else:
                new_proj_perm_result = await db.execute(
                    select(ResourcePermissionModel).where(
                        ResourcePermissionModel.user_id == user_id,
                        ResourcePermissionModel.scope == PermissionScope.PROJECT.value,
                        ResourcePermissionModel.resource_id == input.project_id,
                    )
                )
                new_proj_perm = new_proj_perm_result.scalar_one_or_none()
                if new_proj_perm and new_proj_perm.actions and 'write' in new_proj_perm.actions:
                    has_new_project_access = True
            
            if not has_new_project_access:
                raise Exception("Access denied: You don't have write permission to the target project")
            
            # Check if another environment with the same name already exists in the new project
            if env.name:
                existing_check = await db.execute(
                    select(exists().where(
                        EnvironmentModel.name == env.name,
                        EnvironmentModel.project_id == input.project_id,
                        EnvironmentModel.id != id,
                        EnvironmentModel.deleted_at.is_(None)
                    ))
                )
                if existing_check.scalar():
                    raise Exception(f"Environment with name '{env.name}' already exists in the target project")
            
            env.project_id = input.project_id
        
        try:
            await db.commit()
            await db.refresh(env)
        except IntegrityError as e:
            await db.rollback()
            if "uq_environment_name_project" in str(e.orig) or "unique constraint" in str(e.orig).lower():
                raise Exception(f"Environment with name '{input.name or env.name}' already exists in this project")
            raise Exception(f"Failed to update environment: {str(e)}")
        
        # Reload environment with relationships to avoid lazy loading issues
        result = await db.execute(
            select(EnvironmentModel)
            .options(selectinload(EnvironmentModel.project), selectinload(EnvironmentModel.services))
            .where(EnvironmentModel.id == env.id)
        )
        updated_env = result.scalar_one()
        
        return model_to_environment(updated_env)
    
    @strawberry.mutation
    async def delete_environment(self, id: str, info: Any = None) -> bool:
        """Soft delete environment (ADMIN permission required) - sets deleted_at timestamp"""
        context = info.context
        db = context.db
        current_user = context.current_user
        
        if not current_user:
            raise Exception("Authentication required")
        
        result = await db.execute(
            select(EnvironmentModel)
            .options(selectinload(EnvironmentModel.project))
            .where(EnvironmentModel.id == id, EnvironmentModel.deleted_at.is_(None))
        )
        env = result.scalar_one_or_none()
        if not env:
            raise Exception("Environment not found")
        
        # Only ADMIN can delete resources
        # Optimize: Check ownership first (no DB query needed if owner)
        user_id = current_user.get('id')
        is_admin = current_user.get('is_admin', False)
        has_access = False
        
        # Check project ownership (environment inherits from project)
        if is_admin or (env.project and env.project.owner_id == user_id):
            has_access = True
        else:
            # Check direct environment admin permission
            perm_result = await db.execute(
                select(ResourcePermissionModel).where(
                    ResourcePermissionModel.user_id == user_id,
                    ResourcePermissionModel.scope == PermissionScope.ENVIRONMENT.value,
                    ResourcePermissionModel.resource_id == id,
                )
            )
            env_perm = perm_result.scalar_one_or_none()
            if env_perm and env_perm.actions and 'admin' in env_perm.actions:
                has_access = True
            else:
                # Check project-level permission inheritance
                if env.project:
                    proj_perm_result = await db.execute(
                        select(ResourcePermissionModel).where(
                            ResourcePermissionModel.user_id == user_id,
                            ResourcePermissionModel.scope == PermissionScope.PROJECT.value,
                            ResourcePermissionModel.resource_id == env.project_id,
                        )
                    )
                    proj_perm = proj_perm_result.scalar_one_or_none()
                    if proj_perm and proj_perm.actions and 'admin' in proj_perm.actions:
                        has_access = True
        
        if not has_access:
            raise Exception("Access denied: ADMIN permission required to delete resources")
        
        # Soft delete: set deleted_at timestamp
        from datetime import datetime, timezone
        env.deleted_at = datetime.now(timezone.utc)
        await db.commit()
        return True
    
    @strawberry.mutation
    async def update_service(self, id: str, input: ServiceUpdateInput, info: Any = None) -> Service:
        """Update service"""
        context = info.context
        db = context.db
        current_user = context.current_user
        
        if not current_user:
            raise Exception("Authentication required")
        
        result = await db.execute(
            select(ServiceModel)
            .options(selectinload(ServiceModel.project), selectinload(ServiceModel.environments))
            .where(ServiceModel.id == id, ServiceModel.deleted_at.is_(None))
        )
        service = result.scalar_one_or_none()
        if not service:
            raise Exception("Service not found")
        
        # Check access
        # Optimize: Check ownership first (no DB query needed if owner)
        user_id = current_user.get('id')
        is_admin = current_user.get('is_admin', False)
        has_access = False
        
        # Check project ownership (service inherits from project)
        if is_admin or service.project.owner_id == user_id:
            has_access = True
        else:
            # Check direct service permission
            perm_result = await db.execute(
                select(ResourcePermissionModel).where(
                    ResourcePermissionModel.user_id == user_id,
                    ResourcePermissionModel.scope == PermissionScope.SERVICE.value,
                    ResourcePermissionModel.resource_id == id,
                )
            )
            service_perm = perm_result.scalar_one_or_none()
            if service_perm and service_perm.actions and 'write' in service_perm.actions:
                has_access = True
            else:
                # Check project-level permission inheritance
                proj_perm_result = await db.execute(
                    select(ResourcePermissionModel).where(
                        ResourcePermissionModel.user_id == user_id,
                        ResourcePermissionModel.scope == PermissionScope.PROJECT.value,
                        ResourcePermissionModel.resource_id == service.project_id,
                    )
                )
                proj_perm = proj_perm_result.scalar_one_or_none()
                if proj_perm and proj_perm.actions and 'write' in proj_perm.actions:
                    has_access = True
        
        if not has_access:
            raise Exception("Access denied")
        
        # Update service fields
        if input.name is not None:
            # Check if another service with this name already exists in the project (excluding soft-deleted services)
            # Optimize: Use EXISTS subquery for faster check
            existing_check = await db.execute(
                select(exists().where(
                    ServiceModel.name == input.name,
                    ServiceModel.project_id == service.project_id,
                    ServiceModel.id != id,
                    ServiceModel.deleted_at.is_(None)
                ))
            )
            if existing_check.scalar():
                raise Exception(f"Service with name '{input.name}' already exists in this project")
            service.name = input.name
        if input.description is not None:
            service.description = input.description
        if input.type is not None:
            from app.models.service import ServiceType
            service.type = ServiceType(input.type)
        if input.owner is not None:
            service.owner = input.owner
        if input.status is not None:
            from app.models.service import ServiceStatus
            service.status = ServiceStatus(input.status)
        if input.project_id is not None:
            # Verify the new project exists and user has write access to it
            new_project_result = await db.execute(
                select(ProjectModel).where(ProjectModel.id == input.project_id, ProjectModel.deleted_at.is_(None))
            )
            new_project = new_project_result.scalar_one_or_none()
            if not new_project:
                raise Exception(f"Project with id '{input.project_id}' not found")
            
            # Check if user has write access to the new project
            has_new_project_access = False
            if is_admin or new_project.owner_id == user_id:
                has_new_project_access = True
            else:
                new_proj_perm_result = await db.execute(
                    select(ResourcePermissionModel).where(
                        ResourcePermissionModel.user_id == user_id,
                        ResourcePermissionModel.scope == PermissionScope.PROJECT.value,
                        ResourcePermissionModel.resource_id == input.project_id,
                    )
                )
                new_proj_perm = new_proj_perm_result.scalar_one_or_none()
                if new_proj_perm and new_proj_perm.actions and 'write' in new_proj_perm.actions:
                    has_new_project_access = True
            
            if not has_new_project_access:
                raise Exception("Access denied: You don't have write permission to the target project")
            
            # Check if another service with the same name already exists in the new project
            if service.name:
                existing_check = await db.execute(
                    select(exists().where(
                        ServiceModel.name == service.name,
                        ServiceModel.project_id == input.project_id,
                        ServiceModel.id != id,
                        ServiceModel.deleted_at.is_(None)
                    ))
                )
                if existing_check.scalar():
                    raise Exception(f"Service with name '{service.name}' already exists in the target project")
            
            service.project_id = input.project_id
        # Note: environment_ids handled via many-to-many relationship, not directly on service
        
        try:
            await db.commit()
            await db.refresh(service)
        except IntegrityError as e:
            await db.rollback()
            if "uq_service_name_project" in str(e.orig) or "unique constraint" in str(e.orig).lower():
                raise Exception(f"Service with name '{input.name or service.name}' already exists in this project")
            raise Exception(f"Failed to update service: {str(e)}")
        
        # Reload service with relationships to avoid lazy loading issues
        result = await db.execute(
            select(ServiceModel)
            .options(selectinload(ServiceModel.project), selectinload(ServiceModel.environments))
            .where(ServiceModel.id == service.id)
        )
        updated_service = result.scalar_one()
        
        return model_to_service(updated_service)
    
    @strawberry.mutation
    async def delete_service(self, id: str, info: Any = None) -> bool:
        """Soft delete service (ADMIN permission required) - sets deleted_at timestamp"""
        context = info.context
        db = context.db
        current_user = context.current_user
        
        if not current_user:
            raise Exception("Authentication required")
        
        result = await db.execute(
            select(ServiceModel)
            .options(selectinload(ServiceModel.project))
            .where(ServiceModel.id == id, ServiceModel.deleted_at.is_(None))
        )
        service = result.scalar_one_or_none()
        if not service:
            raise Exception("Service not found")
        
        # Only ADMIN can delete resources
        # Optimize: Check ownership first (no DB query needed if owner)
        user_id = current_user.get('id')
        is_admin = current_user.get('is_admin', False)
        has_access = False
        
        # Check project ownership (service inherits from project)
        if is_admin or (service.project and service.project.owner_id == user_id):
            has_access = True
        else:
            # Check direct service admin permission
            perm_result = await db.execute(
                select(ResourcePermissionModel).where(
                    ResourcePermissionModel.user_id == user_id,
                    ResourcePermissionModel.scope == PermissionScope.SERVICE.value,
                    ResourcePermissionModel.resource_id == id,
                )
            )
            service_perm = perm_result.scalar_one_or_none()
            if service_perm and service_perm.actions and 'admin' in service_perm.actions:
                has_access = True
            else:
                # Check project-level permission inheritance
                if service.project:
                    proj_perm_result = await db.execute(
                        select(ResourcePermissionModel).where(
                            ResourcePermissionModel.user_id == user_id,
                            ResourcePermissionModel.scope == PermissionScope.PROJECT.value,
                            ResourcePermissionModel.resource_id == service.project_id,
                        )
                    )
                    proj_perm = proj_perm_result.scalar_one_or_none()
                    if proj_perm and proj_perm.actions and 'admin' in proj_perm.actions:
                        has_access = True
        
        if not has_access:
            raise Exception("Access denied: ADMIN permission required to delete resources")
        
        # Soft delete: set deleted_at timestamp
        from datetime import datetime, timezone
        service.deleted_at = datetime.now(timezone.utc)
        await db.commit()
        return True
    
    @strawberry.mutation
    async def create_project_config(self, input: ProjectConfigCreateInput, info: Any = None) -> ProjectConfig:
        """Create project configuration"""
        context = info.context
        db = context.db
        current_user = context.current_user
        
        if not current_user:
            raise Exception("Authentication required")
        
        # Check project access (excluding soft-deleted projects)
        project_result = await db.execute(select(ProjectModel).where(ProjectModel.id == input.project_id, ProjectModel.deleted_at.is_(None)))
        project = project_result.scalar_one_or_none()
        if not project:
            raise Exception("Project not found")
        
        if not current_user.get('is_admin', False):
            has_access = await check_resource_permission(
                current_user, PermissionAction.WRITE, PermissionScope.PROJECT, input.project_id, db
            )
            if not has_access:
                raise Exception("Access denied")
        
        # Check if config with this key already exists for the project
        existing_result = await db.execute(
            select(ProjectConfigModel).where(
                ProjectConfigModel.project_id == input.project_id,
                ProjectConfigModel.key == input.key
            )
        )
        existing = existing_result.scalar_one_or_none()
        if existing:
            raise Exception(f"Configuration key '{input.key}' already exists for this project")
        
        # Create new config
        try:
            new_config = ProjectConfigModel(
                project_id=input.project_id,
                key=input.key,
                value=input.value,
                config_data=json.loads(input.config_data) if input.config_data else None,
            )
            db.add(new_config)
            await db.commit()
            await db.refresh(new_config)
        except IntegrityError as e:
            await db.rollback()
            if "uq_project_config_key" in str(e.orig) or "unique constraint" in str(e.orig).lower():
                raise Exception(f"Configuration key '{input.key}' already exists for this project")
            raise Exception(f"Failed to create project configuration: {str(e)}")
        
        return ProjectConfig(
            id=new_config.id,
            project_id=new_config.project_id,
            key=new_config.key,
            value=new_config.value,
            config_data=json.dumps(new_config.config_data) if new_config.config_data else None,
            created_at=new_config.created_at,
            updated_at=new_config.updated_at,
        )
    
    @strawberry.mutation
    async def create_environment_config(self, input: EnvironmentConfigCreateInput, info: Any = None) -> EnvironmentConfig:
        """Create environment configuration"""
        context = info.context
        db = context.db
        current_user = context.current_user
        
        if not current_user:
            raise Exception("Authentication required")
        
        # Check environment and project access (excluding soft-deleted environments)
        env_result = await db.execute(
            select(EnvironmentModel)
            .options(selectinload(EnvironmentModel.project))
            .where(EnvironmentModel.id == input.environment_id, EnvironmentModel.deleted_at.is_(None))
        )
        env = env_result.scalar_one_or_none()
        if not env:
            raise Exception("Environment not found")
        
        if not current_user.get('is_admin', False):
            has_access = await check_resource_permission(
                current_user, PermissionAction.WRITE, PermissionScope.ENVIRONMENT, input.environment_id, db
            )
            if not has_access:
                raise Exception("Access denied")
        
        # Check if config with this key already exists for the environment
        existing_result = await db.execute(
            select(EnvironmentConfigModel).where(
                EnvironmentConfigModel.environment_id == input.environment_id,
                EnvironmentConfigModel.key == input.key
            )
        )
        existing = existing_result.scalar_one_or_none()
        if existing:
            raise Exception(f"Configuration key '{input.key}' already exists for this environment")
        
        # Create new config
        try:
            new_config = EnvironmentConfigModel(
                environment_id=input.environment_id,
                key=input.key,
                value=input.value,
                config_data=json.loads(input.config_data) if input.config_data else None,
            )
            db.add(new_config)
            await db.commit()
            await db.refresh(new_config)
        except IntegrityError as e:
            await db.rollback()
            if "uq_environment_config_key" in str(e.orig) or "unique constraint" in str(e.orig).lower():
                raise Exception(f"Configuration key '{input.key}' already exists for this environment")
            raise Exception(f"Failed to create environment configuration: {str(e)}")
        
        return EnvironmentConfig(
            id=new_config.id,
            environment_id=new_config.environment_id,
            key=new_config.key,
            value=new_config.value,
            config_data=json.dumps(new_config.config_data) if new_config.config_data else None,
            created_at=new_config.created_at,
            updated_at=new_config.updated_at,
        )
    
    @strawberry.mutation
    async def create_service_config(self, input: ServiceConfigCreateInput, info: Any = None) -> ServiceConfig:
        """Create service configuration"""
        context = info.context
        db = context.db
        current_user = context.current_user
        
        if not current_user:
            raise Exception("Authentication required")
        
        # Check service and project access (excluding soft-deleted services)
        service_result = await db.execute(
            select(ServiceModel)
            .options(selectinload(ServiceModel.project))
            .where(ServiceModel.id == input.service_id, ServiceModel.deleted_at.is_(None))
        )
        service = service_result.scalar_one_or_none()
        if not service:
            raise Exception("Service not found")
        
        if not current_user.get('is_admin', False):
            has_access = await check_resource_permission(
                current_user, PermissionAction.WRITE, PermissionScope.SERVICE, input.service_id, db
            )
            if not has_access:
                raise Exception("Access denied")
        
        # Check if config with this key already exists for the service
        existing_result = await db.execute(
            select(ServiceConfigModel).where(
                ServiceConfigModel.service_id == input.service_id,
                ServiceConfigModel.key == input.key
            )
        )
        existing = existing_result.scalar_one_or_none()
        if existing:
            raise Exception(f"Configuration key '{input.key}' already exists for this service")
        
        # Create new config
        try:
            new_config = ServiceConfigModel(
                service_id=input.service_id,
                key=input.key,
                value=input.value,
                config_data=json.loads(input.config_data) if input.config_data else None,
            )
            db.add(new_config)
            await db.commit()
            await db.refresh(new_config)
        except IntegrityError as e:
            await db.rollback()
            if "uq_service_config_key" in str(e.orig) or "unique constraint" in str(e.orig).lower():
                raise Exception(f"Configuration key '{input.key}' already exists for this service")
            raise Exception(f"Failed to create service configuration: {str(e)}")
        
        return ServiceConfig(
            id=new_config.id,
            service_id=new_config.service_id,
            key=new_config.key,
            value=new_config.value,
            config_data=json.dumps(new_config.config_data) if new_config.config_data else None,
            created_at=new_config.created_at,
            updated_at=new_config.updated_at,
        )
    
    @strawberry.mutation
    async def update_service_config(self, id: str, input: ServiceConfigUpdateInput, info: Any = None) -> ServiceConfig:
        """Update service configuration"""
        context = info.context
        db = context.db
        current_user = context.current_user
        
        if not current_user:
            raise Exception("Authentication required")
        
        # Fetch the config
        config_result = await db.execute(
            select(ServiceConfigModel)
            .options(selectinload(ServiceConfigModel.service).selectinload(ServiceModel.project))
            .where(ServiceConfigModel.id == id, ServiceConfigModel.deleted_at.is_(None))
        )
        config = config_result.scalar_one_or_none()
        if not config:
            raise Exception("Service configuration not found")
        
        # Check write permission
        if not current_user.get('is_admin', False):
            has_access = await check_resource_permission(
                current_user, PermissionAction.WRITE, PermissionScope.SERVICE, config.service_id, db
            )
            if not has_access:
                raise Exception("Access denied")
        
        # Update config
        if input.value is not None:
            config.value = input.value
        if input.config_data is not None:
            config.config_data = json.loads(input.config_data) if input.config_data else None
        
        config.updated_at = datetime.now()
        
        try:
            await db.commit()
            await db.refresh(config)
        except Exception as e:
            await db.rollback()
            raise Exception(f"Failed to update service configuration: {str(e)}")
        
        return ServiceConfig(
            id=config.id,
            service_id=config.service_id,
            key=config.key,
            value=config.value,
            config_data=json.dumps(config.config_data) if config.config_data else None,
            created_at=config.created_at,
            updated_at=config.updated_at,
        )
    
    # Versioning & Deployments
    @strawberry.mutation
    async def create_service_version_and_deployment(
        self,
        service_id: str,
        version_label: str,
        config_hash: str,
        spec_json: Optional[str] = None,
        info: Any = None
    ) -> Deployment:
        """Create a new ServiceVersion and a corresponding Deployment in pending status."""
        context = info.context
        db = context.db
        current_user = context.current_user
        if not current_user:
            raise Exception("Authentication required")
        
        # Verify service exists and permission
        service_result = await db.execute(select(ServiceModel).where(ServiceModel.id == service_id, ServiceModel.deleted_at.is_(None)))
        service = service_result.scalar_one_or_none()
        if not service:
            raise Exception("Service not found")
        if not current_user.get('is_admin', False):
            has_access = await check_resource_permission(current_user, PermissionAction.WRITE, PermissionScope.SERVICE, service_id, db)
            if not has_access:
                raise Exception("Access denied")
        
        # Ensure version label unique per service
        existing_ver_res = await db.execute(
            select(ServiceVersionModel).where(
                ServiceVersionModel.service_id == service_id,
                ServiceVersionModel.version_label == version_label
            )
        )
        existing_ver = existing_ver_res.scalar_one_or_none()
        if existing_ver:
            raise Exception(f"Version '{version_label}' already exists for this service")
        
        # Create version + deployment
        new_version = ServiceVersionModel(
            service_id=service_id,
            version_label=version_label,
            config_hash=config_hash,
            spec_json=spec_json,
        )
        db.add(new_version)
        await db.flush()
        
        new_deployment = DeploymentModel(
            service_id=service_id,
            version_id=new_version.id,
            status=DeploymentStatusModel.PENDING,
        )
        db.add(new_deployment)
        await db.commit()
        await db.refresh(new_deployment)
        
        return Deployment(
            id=new_deployment.id,
            service_id=new_deployment.service_id,
            version_id=new_deployment.version_id,
            status=new_deployment.status.value,
            created_at=new_deployment.created_at,
            completed_at=new_deployment.completed_at,
        )
    
    @strawberry.mutation
    async def deploy_service(
        self,
        version_id: str,
        environment_id: str,
        downstream_overrides: Optional[List[DownstreamOverrideInput]] = None,
        info: Any = None,
    ) -> bool:
        """Deploy a service to an environment: create pending deployment record and enqueue workflow."""
        print("Enqueueing deploy workflow for service version", version_id, flush=True)
        context = info.context
        db = context.db
        current_user = context.current_user        
        if not current_user:
            raise Exception("Authentication required")
        env_res = await db.execute(select(EnvironmentModel).where(EnvironmentModel.id == environment_id))
        env = env_res.scalar_one_or_none()
        if not env:
            raise Exception("Environment not found")
        # Get latest version
        ver_res = await db.execute(
            select(ServiceVersionModel)
            .where(ServiceVersionModel.id == version_id)
            .order_by(ServiceVersionModel.created_at.desc())
        )
        ver = ver_res.scalars().first()        
        if not ver:
            raise Exception("No service version found; create a version first")
        # Permission check against the service owning this version
        if not current_user.get('is_admin', False):
            has_access = await check_resource_permission(
                current_user, PermissionAction.WRITE, PermissionScope.SERVICE, ver.service_id, db
            )
            if not has_access:
                raise Exception("Access denied")
        svc_id = ver.service_id

        # Serialize downstream overrides for storage
        ds_overrides_json = None
        if downstream_overrides:
            ds_overrides_json = [
                {"serviceId": o.service_id, "serviceName": o.service_name, "version": o.version}
                for o in downstream_overrides
            ]

        # Insert pending deployment with step definitions
        from app.models.versioning import Deployment as DeploymentModel, DeploymentStatus as DeploymentStatusModel
        from app.workflows.dbos_deploy import DEPLOY_STEPS
        dep = DeploymentModel(
            service_id=svc_id,
            version_id=ver.id,
            environment_id=environment_id,
            steps=DEPLOY_STEPS,
            downstream_overrides=ds_overrides_json,
            status=DeploymentStatusModel.PENDING,
        )
        db.add(dep)
        await db.commit()
        # Enqueue workflow (best-effort)
        client = create_dbos_client()
        options = {
            "queue_name": settings.DBOS_WORKFLOW_QUEUE_NAME,
            "workflow_name": "deploy_workflow",            
        }
        # Enqueue asynchronously and await the workflow result
        handle = await client.enqueue_async(options, dep.id)
        workflow_id = handle.get_workflow_id()
        print(f"Workflow ID: {workflow_id}", flush=True)
        # persist workflow id on deployment
        try:
            dep.workflow_uuid = str(workflow_id)
            await db.commit()
        except Exception:
            await db.rollback()
        client.destroy()
        return True

    @strawberry.mutation
    async def setup_env_subdomain(
        self,
        environment_id: str,
        info: Any = None,
    ) -> bool:
        """Set up Certificate + Gateway for an environment by enqueueing the setup_env_subdomain workflow."""
        context = info.context
        db = context.db
        current_user = context.current_user
        if not current_user:
            raise Exception("Authentication required")
        # Verify environment exists
        env_res = await db.execute(select(EnvironmentModel).where(EnvironmentModel.id == environment_id))
        env = env_res.scalar_one_or_none()
        if not env:
            raise Exception("Environment not found")
        # Permission check
        if not current_user.get('is_admin', False):
            has_access = await check_resource_permission(
                current_user, PermissionAction.WRITE, PermissionScope.ENVIRONMENT, environment_id, db
            )
            if not has_access:
                raise Exception("Access denied")
        # Enqueue the setup_env_subdomain workflow
        client = create_dbos_client()
        options = {
            "queue_name": settings.DBOS_WORKFLOW_QUEUE_NAME,
            "workflow_name": "setup_env_subdomain",
        }
        handle = await client.enqueue_async(options, environment_id)
        workflow_id = handle.get_workflow_id()
        print(f"setup_env_subdomain workflow ID: {workflow_id}", flush=True)
        # Persist workflow_uuid on the domain_info environment config record
        try:
            from app.models.config import EnvironmentConfig as EnvironmentConfigModel
            cfg_res = await db.execute(
                select(EnvironmentConfigModel).where(
                    EnvironmentConfigModel.environment_id == environment_id,
                    EnvironmentConfigModel.key == "domain_info",
                )
            )
            cfg = cfg_res.scalar_one_or_none()
            if cfg:
                cfg.workflow_uuid = str(workflow_id)
            else:
                # Create a placeholder record if it doesn't exist yet
                db.add(EnvironmentConfigModel(
                    environment_id=environment_id,
                    key="domain_info",
                    workflow_uuid=str(workflow_id),
                ))
            await db.commit()
        except Exception:
            await db.rollback()
        client.destroy()
        return True

    @strawberry.mutation
    async def publish_service_version(self, service_id: str, info: Any = None) -> PublishVersionResult:
        """Publish a new service version if current spec differs from previous versions."""
        context = info.context
        db = context.db
        current_user = context.current_user
        if not current_user:
            raise Exception("Authentication required")
        # Permission check
        if not current_user.get('is_admin', False):
            has_access = await check_resource_permission(current_user, PermissionAction.WRITE, PermissionScope.SERVICE, service_id, db)
            if not has_access:
                raise Exception("Access denied")
        # Load service
        svc_res = await db.execute(select(ServiceModel).where(ServiceModel.id == service_id))
        service = svc_res.scalar_one_or_none()
        if not service:
            return PublishVersionResult(ok=False, message="Service not found")
        # Build full spec for storage (workflow needs all fields)
        svc_json = {
            "id": service.id,
            "name": service.name,
            "description": service.description,
            "type": service.type.value if service.type else None,
            "project_id": service.project_id,
            "owner": service.owner,
            "status": service.status.value if service.status else None,
            "created_at": service.created_at.isoformat() if service.created_at else None,
            "updated_at": service.updated_at.isoformat() if service.updated_at else None,
            "deleted_at": service.deleted_at.isoformat() if service.deleted_at else None,
        }
        cfg_res = await db.execute(select(ServiceConfigModel).where(ServiceConfigModel.service_id == service_id))
        cfg_rows = cfg_res.scalars().all()
        full_cfg_map = {c.key: c.value for c in cfg_rows}
        # Parse JSON-encoded config values (e.g. ports) into native types
        for _cfg_key in ("ports",):
            if _cfg_key in full_cfg_map and isinstance(full_cfg_map[_cfg_key], str):
                try:
                    full_cfg_map[_cfg_key] = json.loads(full_cfg_map[_cfg_key])
                except (json.JSONDecodeError, TypeError):
                    pass
        env_res = await db.execute(
            select(EnvironmentVariableModel).where(
                and_(EnvironmentVariableModel.scope == VariableScope.SERVICE,
                     EnvironmentVariableModel.resource_id == service_id)
            )
        )
        env_rows = env_res.scalars().all()
        env_map = {e.key: e.value for e in env_rows}
        sec_res = await db.execute(
            select(SecretModel).where(
                and_(SecretModel.scope == VariableScope.SERVICE,
                     SecretModel.resource_id == service_id)
            )
        )
        sec_rows = sec_res.scalars().all()
        sec_map = {s.key: s.value for s in sec_rows}
        proj_res = await db.execute(select(ProjectModel).where(ProjectModel.id == service.project_id))
        project = proj_res.scalar_one_or_none()
        proj_json = {
            "id": project.id,
            "name": project.name,
            "description": project.description,
            "owner_id": project.owner_id,
            "created_at": project.created_at.isoformat() if project.created_at else None,
            "updated_at": project.updated_at.isoformat() if project.updated_at else None,
            "deleted_at": project.deleted_at.isoformat() if project.deleted_at else None,
        } if project else None
        # Full spec stored in version record (workflow needs all fields)
        spec = {
            "service": svc_json,
            "config": full_cfg_map,
            "variables": env_map,
            "secrets": sec_map,
            "project": proj_json,
        }
        spec_json = json.dumps(spec, sort_keys=True, separators=(",", ":"))
        # Hash based only on versioned fields: docker_image, ports, variables, secrets
        VERSIONED_CONFIG_KEYS = ("docker_image", "ports")
        versioned_cfg = {k: full_cfg_map[k] for k in VERSIONED_CONFIG_KEYS if k in full_cfg_map}
        hash_spec = {
            "config": versioned_cfg,
            "variables": env_map,
            "secrets": sec_map,
        }
        hash_spec_str = json.dumps(hash_spec, sort_keys=True, separators=(",", ":"))
        cfg_hash = hashlib.sha256(hash_spec_str.encode("utf-8")).hexdigest()
        # Check latest
        latest_res = await db.execute(
            select(ServiceVersionModel)
            .where(ServiceVersionModel.service_id == service_id)
            .order_by(ServiceVersionModel.created_at.desc())
        )
        latest = latest_res.scalars().first()
        if latest and latest.config_hash == cfg_hash:
            return PublishVersionResult(ok=False, message=f"No new changes since {latest.version_label}")
        # Check any matching previous
        match_res = await db.execute(
            select(ServiceVersionModel)
            .where(ServiceVersionModel.service_id == service_id, ServiceVersionModel.config_hash == cfg_hash)
            .order_by(ServiceVersionModel.created_at.desc())
        )
        match = match_res.scalars().first()
        if match:
            return PublishVersionResult(ok=False, message=f"Current configuration matches existing version {match.version_label}")
        # Determine next label
        def parse_num(v: Optional[str]) -> int:
            if not v:
                return 0
            try:
                return int(str(v).lstrip('vV'))
            except Exception:
                return 0
        next_num = parse_num(getattr(latest, "version_label", None)) + 1
        next_label = f"v{max(1, next_num)}"
        # Create version
        new_ver = ServiceVersionModel(
            service_id=service_id,
            version_label=next_label,
            config_hash=cfg_hash,
            spec_json=spec_json,
        )
        db.add(new_ver)
        await db.commit()
        await db.refresh(new_ver)
        return PublishVersionResult(
            ok=True,
            message=f"Created {next_label}",
            version=ServiceVersion(
                id=str(new_ver.id),
                service_id=new_ver.service_id,
                version_label=new_ver.version_label,
                config_hash=new_ver.config_hash,
                spec_json=new_ver.spec_json,
                created_at=new_ver.created_at,
            ),
        )
    
    @strawberry.mutation
    async def create_permission(self, input: PermissionCreateInput, info: Any = None) -> Permission:
        """Create a new permission definition (admin only)"""
        context = info.context
        db = context.db
        current_user = context.current_user
        
        if not current_user or not current_user.get('is_admin', False):
            raise Exception("Admin access required")
        
        # Check if permission already exists
        result = await db.execute(select(PermissionModel).where(PermissionModel.name == input.name))
        existing = result.scalar_one_or_none()
        if existing:
            raise Exception("Permission with this name already exists")
        
        # Create new permission
        from app.models.permission import PermissionAction, PermissionResource
        new_perm = PermissionModel(
            name=input.name,
            action=PermissionAction(input.action),
            resource=PermissionResource(input.resource),
            description=input.description,
        )
        db.add(new_perm)
        await db.commit()
        await db.refresh(new_perm)
        
        return Permission(
            id=new_perm.id,
            name=new_perm.name,
            action=new_perm.action.value,
            resource=new_perm.resource.value,
            description=new_perm.description,
            created_at=new_perm.created_at,
        )
    
    @strawberry.mutation
    async def grant_user_permission(self, input: UserPermissionCreateInput, info: Any = None) -> UserPermission:
        """Grant a permission to a user (admin only)"""
        context = info.context
        db = context.db
        current_user = context.current_user
        
        if not current_user or not current_user.get('is_admin', False):
            raise Exception("Admin access required")
        
        # Check if user exists (excluding soft-deleted users)
        user_result = await db.execute(select(UserModel).where(UserModel.id == input.user_id, UserModel.deleted_at.is_(None)))
        user = user_result.scalar_one_or_none()
        if not user:
            raise Exception("User not found")
        
        # Check if permission exists
        perm_result = await db.execute(select(PermissionModel).where(PermissionModel.id == input.permission_id))
        permission = perm_result.scalar_one_or_none()
        if not permission:
            raise Exception("Permission not found")
        
        # Check if permission already granted
        existing_result = await db.execute(
            select(UserPermissionModel).where(
                UserPermission.user_id == input.user_id,
                UserPermission.permission_id == input.permission_id,
                UserPermission.resource_id == (input.resource_id or None),
            )
        )
        existing = existing_result.scalar_one_or_none()
        if existing:
            raise Exception("Permission already granted to this user")
        
        # Create new user permission
        new_user_perm = UserPermissionModel(
            user_id=input.user_id,
            permission_id=input.permission_id,
            resource_id=input.resource_id,
            granted_by=current_user.get('id'),
        )
        db.add(new_user_perm)
        await db.commit()
        await db.refresh(new_user_perm)
        
        return UserPermission(
            id=new_user_perm.id,
            user_id=new_user_perm.user_id,
            permission_id=new_user_perm.permission_id,
            resource_id=new_user_perm.resource_id,
            granted_at=new_user_perm.granted_at,
            granted_by=new_user_perm.granted_by,
        )
    
    @strawberry.mutation
    async def revoke_user_permission(self, id: str, info: Any = None) -> bool:
        """Revoke a permission from a user (admin only)"""
        context = info.context
        db = context.db
        current_user = context.current_user
        
        if not current_user or not current_user.get('is_admin', False):
            raise Exception("Admin access required")
        
        result = await db.execute(select(UserPermissionModel).where(UserPermissionModel.id == id))
        user_perm = result.scalar_one_or_none()
        if not user_perm:
            raise Exception("User permission not found")
        
        await db.delete(user_perm)
        await db.commit()
        return True
    
    @strawberry.mutation
    async def grant_resource_permission(self, input: ResourcePermissionCreateInput, info: Any = None) -> ResourcePermission:
        """Grant a resource permission to a user (project owner or admin only)"""
        context = info.context
        db = context.db
        current_user = context.current_user
        
        if not current_user:
            raise Exception("Authentication required")
        
        # Validate scope
        try:
            scope = PermissionScope(input.scope.lower())
        except ValueError:
            raise Exception(f"Invalid scope: {input.scope}. Must be 'project', 'environment', or 'service'")
        
        # Check if user can grant permissions for this resource
        can_grant = await can_grant_resource_permission(
            current_user, scope, input.resource_id, db
        )
        if not can_grant:
            raise Exception("Permission denied. Only project owners and admins can grant permissions")
        
        # Validate actions
        valid_actions = ["read", "write", "delete", "admin"]
        for action in input.actions:
            if action.lower() not in valid_actions:
                raise Exception(f"Invalid action: {action}. Must be one of {valid_actions}")
        
        # Check if permission already exists
        existing_result = await db.execute(
            select(ResourcePermissionModel).where(
                ResourcePermissionModel.user_id == input.user_id,
                ResourcePermissionModel.scope == scope,
                ResourcePermissionModel.resource_id == input.resource_id,
            )
        )
        existing = existing_result.scalar_one_or_none()
        
        if existing:
            # Update existing permission
            existing.actions = [a.lower() for a in input.actions]
            await db.commit()
            await db.refresh(existing)
            
            # Handle scope - it might be an enum or a string
            scope_value = existing.scope.value if hasattr(existing.scope, 'value') else existing.scope
            
            return ResourcePermission(
                id=existing.id,
                user_id=existing.user_id,
                scope=scope_value,
                resource_id=existing.resource_id,
                actions=existing.actions or [],
                granted_at=existing.granted_at,
                granted_by=existing.granted_by,
            )
        else:
            # Create new permission
            new_perm = ResourcePermissionModel(
                user_id=input.user_id,
                scope=scope,
                resource_id=input.resource_id,
                actions=[a.lower() for a in input.actions],
                granted_by=current_user.get('id'),
            )
            db.add(new_perm)
            await db.commit()
            await db.refresh(new_perm)
            
            # Handle scope - it might be an enum or a string
            scope_value = new_perm.scope.value if hasattr(new_perm.scope, 'value') else new_perm.scope
            
            return ResourcePermission(
                id=new_perm.id,
                user_id=new_perm.user_id,
                scope=scope_value,
                resource_id=new_perm.resource_id,
                actions=new_perm.actions or [],
                granted_at=new_perm.granted_at,
                granted_by=new_perm.granted_by,
            )
    
    @strawberry.mutation
    async def update_resource_permission(self, id: str, input: ResourcePermissionUpdateInput, info: Any = None) -> ResourcePermission:
        """Update a resource permission (project owner or admin only)"""
        context = info.context
        db = context.db
        current_user = context.current_user
        
        if not current_user:
            raise Exception("Authentication required")
        
        result = await db.execute(select(ResourcePermissionModel).where(ResourcePermissionModel.id == id))
        perm = result.scalar_one_or_none()
        
        if not perm:
            raise Exception("Resource permission not found")
        
        # Check if user can grant permissions for this resource
        # Handle scope - it might be an enum or a string
        perm_scope = perm.scope.value if hasattr(perm.scope, 'value') else perm.scope
        # Convert string to enum if needed
        from app.models.permission import PermissionScope
        if isinstance(perm_scope, str):
            perm_scope = PermissionScope(perm_scope)
        
        can_grant = await can_grant_resource_permission(
            current_user, perm_scope, perm.resource_id, db
        )
        if not can_grant:
            raise Exception("Permission denied. Only project owners and admins can update permissions")
        
        # Update actions if provided
        if input.actions is not None:
            valid_actions = ["read", "write", "delete", "admin"]
            for action in input.actions:
                if action.lower() not in valid_actions:
                    raise Exception(f"Invalid action: {action}. Must be one of {valid_actions}")
            perm.actions = [a.lower() for a in input.actions]
        
        await db.commit()
        await db.refresh(perm)
        
        # Handle scope - it might be an enum or a string
        scope_value = perm.scope.value if hasattr(perm.scope, 'value') else perm.scope
        
        return ResourcePermission(
            id=perm.id,
            user_id=perm.user_id,
            scope=scope_value,
            resource_id=perm.resource_id,
            actions=perm.actions or [],
            granted_at=perm.granted_at,
            granted_by=perm.granted_by,
        )
    
    @strawberry.mutation
    async def revoke_resource_permission(self, id: str, info: Any = None) -> bool:
        """Revoke a resource permission (project owner or admin only)"""
        context = info.context
        db = context.db
        current_user = context.current_user
        
        if not current_user:
            raise Exception("Authentication required")
        
        result = await db.execute(select(ResourcePermissionModel).where(ResourcePermissionModel.id == id))
        perm = result.scalar_one_or_none()
        
        if not perm:
            raise Exception("Resource permission not found")
        
        # Check if user can grant permissions for this resource
        # Handle scope - it might be an enum or a string
        perm_scope = perm.scope.value if hasattr(perm.scope, 'value') else perm.scope
        # Convert string to enum if needed
        from app.models.permission import PermissionScope
        if isinstance(perm_scope, str):
            perm_scope = PermissionScope(perm_scope)
        
        can_grant = await can_grant_resource_permission(
            current_user, perm_scope, perm.resource_id, db
        )
        if not can_grant:
            raise Exception("Permission denied. Only project owners and admins can revoke permissions")
        
        await db.delete(perm)
        await db.commit()
        return True
    
    @strawberry.mutation
    async def create_environment_variable(self, input: EnvironmentVariableCreateInput, info: Any = None) -> EnvironmentVariable:
        """Create an environment variable (requires write permission)"""
        context = info.context
        db = context.db
        current_user = context.current_user
        
        if not current_user:
            raise Exception("Authentication required")
        
        # Validate scope
        try:
            scope_enum = VariableScope(input.scope)
        except ValueError:
            raise Exception(f"Invalid scope: {input.scope}. Must be 'project', 'environment', or 'service'")
        
        # Check write permission based on scope (optimized)
        has_access = await check_scope_write_permission(scope_enum, input.resource_id, current_user, db)
        if not has_access:
            raise Exception(f"Permission denied. You don't have write access to this {scope_enum.value}.")
        
        # Check if variable with this key already exists
        # Optimize: Use EXISTS subquery for faster check
        existing_check = await db.execute(
            select(exists().where(
                EnvironmentVariableModel.scope == scope_enum,
                EnvironmentVariableModel.resource_id == input.resource_id,
                EnvironmentVariableModel.key == input.key,
                EnvironmentVariableModel.deleted_at.is_(None)
            ))
        )
        if existing_check.scalar():
            raise Exception(f"Environment variable with key '{input.key}' already exists")
        
        # Create new environment variable
        new_var = EnvironmentVariableModel(
            scope=scope_enum,
            resource_id=input.resource_id,
            key=input.key,
            value=input.value,
        )
        db.add(new_var)
        await db.commit()
        await db.refresh(new_var)
        
        return EnvironmentVariable(
            id=new_var.id,
            scope=new_var.scope.value,
            resource_id=new_var.resource_id,
            key=new_var.key,
            value=new_var.value,
            created_at=new_var.created_at,
            updated_at=new_var.updated_at,
        )
    
    @strawberry.mutation
    async def update_environment_variable(self, id: str, input: EnvironmentVariableUpdateInput, info: Any = None) -> EnvironmentVariable:
        """Update an environment variable (requires write permission)"""
        context = info.context
        db = context.db
        current_user = context.current_user
        
        if not current_user:
            raise Exception("Authentication required")
        
        result = await db.execute(
            select(EnvironmentVariableModel).where(
                EnvironmentVariableModel.id == id,
                EnvironmentVariableModel.deleted_at.is_(None)
            )
        )
        env_var = result.scalar_one_or_none()
        
        if not env_var:
            raise Exception("Environment variable not found")
        
        # Check write permission based on scope (optimized)
        has_access = await check_scope_write_permission(env_var.scope, env_var.resource_id, current_user, db)
        if not has_access:
            raise Exception(f"Permission denied. You don't have write access to this {env_var.scope.value}.")
        
        # Update value if provided
        if input.value is not None:
            env_var.value = input.value
        
        await db.commit()
        await db.refresh(env_var)
        
        return EnvironmentVariable(
            id=env_var.id,
            scope=env_var.scope.value,
            resource_id=env_var.resource_id,
            key=env_var.key,
            value=env_var.value,
            created_at=env_var.created_at,
            updated_at=env_var.updated_at,
        )
    
    @strawberry.mutation
    async def delete_environment_variable(self, id: str, info: Any = None) -> bool:
        """Delete an environment variable (soft delete, requires write permission)"""
        context = info.context
        db = context.db
        current_user = context.current_user
        
        if not current_user:
            raise Exception("Authentication required")
        
        result = await db.execute(
            select(EnvironmentVariableModel).where(
                EnvironmentVariableModel.id == id,
                EnvironmentVariableModel.deleted_at.is_(None)
            )
        )
        env_var = result.scalar_one_or_none()
        
        if not env_var:
            raise Exception("Environment variable not found")
        
        # Check write permission based on scope (optimized)
        has_access = await check_scope_write_permission(env_var.scope, env_var.resource_id, current_user, db)
        if not has_access:
            raise Exception(f"Permission denied. You don't have write access to this {env_var.scope.value}.")
        
        # Soft delete
        from datetime import datetime, timezone
        env_var.deleted_at = datetime.now(timezone.utc)
        await db.commit()
        return True
    
    @strawberry.mutation
    async def create_secret(self, input: SecretCreateInput, info: Any = None) -> Secret:
        """Create a secret (requires write permission)"""
        context = info.context
        db = context.db
        current_user = context.current_user
        
        if not current_user:
            raise Exception("Authentication required")
        
        # Validate scope
        try:
            scope_enum = VariableScope(input.scope)
        except ValueError:
            raise Exception(f"Invalid scope: {input.scope}. Must be 'project', 'environment', or 'service'")
        
        # Check write permission based on scope (optimized)
        has_access = await check_scope_write_permission(scope_enum, input.resource_id, current_user, db)
        if not has_access:
            raise Exception(f"Permission denied. You don't have write access to this {scope_enum.value}.")
        
        # Check if secret with this key already exists
        # Optimize: Use EXISTS subquery for faster check
        existing_check = await db.execute(
            select(exists().where(
                SecretModel.scope == scope_enum,
                SecretModel.resource_id == input.resource_id,
                SecretModel.key == input.key,
                SecretModel.deleted_at.is_(None)
            ))
        )
        if existing_check.scalar():
            raise Exception(f"Secret with key '{input.key}' already exists")
        
        # Create new secret (in production, encrypt the value)
        new_secret = SecretModel(
            scope=scope_enum,
            resource_id=input.resource_id,
            key=input.key,
            value=input.value,  # TODO: Encrypt in production
        )
        db.add(new_secret)
        await db.commit()
        await db.refresh(new_secret)
        
        return Secret(
            id=new_secret.id,
            scope=new_secret.scope.value,
            resource_id=new_secret.resource_id,
            key=new_secret.key,
            value_length=len(new_secret.value) if new_secret.value else 0,  # Only return length, never the actual value
            created_at=new_secret.created_at,
            updated_at=new_secret.updated_at,
        )
    
    @strawberry.mutation
    async def update_secret(self, id: str, input: SecretUpdateInput, info: Any = None) -> Secret:
        """Update a secret (requires write permission)"""
        context = info.context
        db = context.db
        current_user = context.current_user
        
        if not current_user:
            raise Exception("Authentication required")
        
        result = await db.execute(
            select(SecretModel).where(
                SecretModel.id == id,
                SecretModel.deleted_at.is_(None)
            )
        )
        secret = result.scalar_one_or_none()
        
        if not secret:
            raise Exception("Secret not found")
        
        # Check write permission based on scope (optimized)
        has_access = await check_scope_write_permission(secret.scope, secret.resource_id, current_user, db)
        if not has_access:
            raise Exception(f"Permission denied. You don't have write access to this {secret.scope.value}.")
        
        # Update value if provided (in production, encrypt before storing)
        if input.value is not None:
            secret.value = input.value  # TODO: Encrypt in production
        
        await db.commit()
        await db.refresh(secret)
        
        return Secret(
            id=secret.id,
            scope=secret.scope.value,
            resource_id=secret.resource_id,
            key=secret.key,
            value_length=len(secret.value) if secret.value else 0,  # Only return length, never the actual value
            created_at=secret.created_at,
            updated_at=secret.updated_at,
        )
    
    @strawberry.mutation
    async def delete_secret(self, id: str, info: Any = None) -> bool:
        """Delete a secret (soft delete, requires write permission)"""
        context = info.context
        db = context.db
        current_user = context.current_user
        
        if not current_user:
            raise Exception("Authentication required")
        
        result = await db.execute(
            select(SecretModel).where(
                SecretModel.id == id,
                SecretModel.deleted_at.is_(None)
            )
        )
        secret = result.scalar_one_or_none()
        
        if not secret:
            raise Exception("Secret not found")
        
        # Check write permission based on scope (optimized)
        has_access = await check_scope_write_permission(secret.scope, secret.resource_id, current_user, db)
        if not has_access:
            raise Exception(f"Permission denied. You don't have write access to this {secret.scope.value}.")
        
        # Soft delete
        from datetime import datetime, timezone
        secret.deleted_at = datetime.now(timezone.utc)
        await db.commit()
        return True


# Create the schema
schema = strawberry.Schema(query=Query, mutation=Mutation)
