"""
GraphQL type definitions
"""
from typing import Optional, List, Any
from datetime import datetime
import strawberry
from strawberry.scalars import JSON
import base64
import io
import pickle
import pickletools
import json as _json_mod
import enum as _enum_mod
from app.models.environment import EnvironmentType
from app.models.service import ServiceType, ServiceStatus
from app.models.permission import PermissionAction, PermissionResource, PermissionScope
from app.models.versioning import DeploymentStatus
from app.models.cluster import KubeAuthMethod
from sqlalchemy import select
from app.models.versioning import ServiceVersion as ServiceVersionModel
from app.models.environment import Environment as EnvironmentModel
from app.models.versioning import Deployment as DeploymentModel
from sqlalchemy import text
from app.core.dependencies import check_resource_permission


def _to_jsonable(obj: Any) -> Any:
    """Recursively convert a Python object to a JSON-serializable form."""
    if obj is None or isinstance(obj, (str, int, float, bool)):
        return obj
    if isinstance(obj, (datetime,)):
        return obj.isoformat()
    if isinstance(obj, _enum_mod.Enum):
        return obj.value
    if isinstance(obj, dict):
        return {str(k): _to_jsonable(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, set, frozenset)):
        return [_to_jsonable(i) for i in obj]
    if isinstance(obj, bytes):
        try:
            return obj.decode("utf-8")
        except Exception:
            return repr(obj)
    # SQLAlchemy model or other object – extract __dict__ minus internal keys
    d = getattr(obj, "__dict__", None)
    if d is not None:
        return {str(k): _to_jsonable(v) for k, v in d.items() if not k.startswith("_")}
    return str(obj)


def _decode_pickle_bytes(b: bytes) -> Any:
    """Attempt to unpickle bytes and convert to JSON-serializable form.
    Falls back to pickletools disassembly on failure."""
    try:
        obj = pickle.loads(b)
        return _to_jsonable(obj)
    except Exception:
        # Fallback to disassembly
        buf = io.StringIO()
        try:
            pickletools.dis(b, out=buf)
            return buf.getvalue()
        except Exception:
            return repr(b)
        finally:
            buf.close()


@strawberry.type
class User:
    id: str
    email: str
    name: str
    is_active: bool
    is_admin: bool
    created_at: datetime
    updated_at: Optional[datetime] = None


@strawberry.type
class Project:
    id: str
    name: str
    description: Optional[str] = None
    owner_id: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    environments: List["Environment"] = strawberry.field(default_factory=list)
    services: List["Service"] = strawberry.field(default_factory=list)


@strawberry.type
class PaginatedProjects:
    """Paginated projects result"""
    items: List[Project]
    total: int


@strawberry.type
class PaginatedProjects:
    """Paginated projects result"""
    items: List[Project]
    total: int


@strawberry.type
class PaginatedEnvironments:
    """Paginated environments result"""
    items: List["Environment"]
    total: int


@strawberry.type
class PaginatedServices:
    """Paginated services result"""
    items: List["Service"]
    total: int


@strawberry.type
class PaginatedUsers:
    """Paginated users result"""
    items: List[User]
    total: int


@strawberry.type
class Environment:
    id: str
    name: str
    type: str
    url: Optional[str] = None
    cluster_id: Optional[str] = None
    cluster: Optional["KubernetesCluster"] = None
    project_id: str
    project: Optional["Project"] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    services: List["Service"] = strawberry.field(default_factory=list)


@strawberry.type
class Service:
    id: str
    name: str
    description: Optional[str] = None
    type: str
    project_id: str
    project: Optional["Project"] = None
    environments: List["Environment"] = strawberry.field(default_factory=list)
    owner: Optional[str] = None
    status: str
    created_at: datetime
    updated_at: Optional[datetime] = None


@strawberry.type
class ProjectConfig:
    id: str
    project_id: str
    key: str
    value: Optional[str] = None
    config_data: Optional[str] = None  # JSON string
    created_at: datetime
    updated_at: Optional[datetime] = None


@strawberry.type
class EnvironmentConfig:
    id: str
    environment_id: str
    key: str
    value: Optional[str] = None
    config_data: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


@strawberry.type
class ServiceConfig:
    id: str
    service_id: str
    key: str
    value: Optional[str] = None
    config_data: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


@strawberry.type
class AdminConfig:
    id: str
    key: str
    value: Optional[str] = None
    config_data: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


@strawberry.input
class AdminConfigCreateInput:
    key: str
    value: Optional[str] = None
    config_data: Optional[str] = None


@strawberry.input
class AdminConfigUpdateInput:
    value: Optional[str] = None
    config_data: Optional[str] = None


import enum

@strawberry.enum
class VariableScope(enum.Enum):
    PROJECT = "project"
    ENVIRONMENT = "environment"
    SERVICE = "service"


@strawberry.type
class EnvironmentVariable:
    id: str
    scope: str
    resource_id: str
    key: str
    value: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


@strawberry.type
class Secret:
    id: str
    scope: str
    resource_id: str
    key: str
    value_length: Optional[int] = None  # Length of the secret value (for masking display)
    created_at: datetime
    updated_at: Optional[datetime] = None


@strawberry.type
class ProjectDetails:
    """Consolidated project details including permissions, env vars, and secrets"""
    project: Project
    permissions: Optional["ComputedUserPermission"] = None
    environmentVariables: List[EnvironmentVariable] = strawberry.field(default_factory=list)
    secrets: List[Secret] = strawberry.field(default_factory=list)
    resourcePermissions: List["ResourcePermission"] = strawberry.field(default_factory=list)


@strawberry.type
class EnvironmentDetails:
    """Consolidated environment details including permissions, env vars, and secrets"""
    environment: Environment
    permissions: Optional["ComputedUserPermission"] = None
    environmentVariables: List[EnvironmentVariable] = strawberry.field(default_factory=list)
    secrets: List[Secret] = strawberry.field(default_factory=list)
    resourcePermissions: List["ResourcePermission"] = strawberry.field(default_factory=list)


@strawberry.type
class ServiceDetails:
    """Consolidated service details including permissions, env vars, and secrets"""
    service: Service
    permissions: Optional["ComputedUserPermission"] = None
    environmentVariables: List[EnvironmentVariable] = strawberry.field(default_factory=list)
    secrets: List[Secret] = strawberry.field(default_factory=list)
    serviceConfigs: List[ServiceConfig] = strawberry.field(default_factory=list)
    resourcePermissions: List["ResourcePermission"] = strawberry.field(default_factory=list)


@strawberry.type
class ServiceVersion:
    id: str
    service_id: str
    version_label: str
    config_hash: str
    spec_json: Optional[str] = None
    created_at: datetime


@strawberry.type
class DeployStep:
    label: str
    fn: str
    desc: Optional[str] = None


@strawberry.type
class Deployment:
    id: str
    service_id: str
    version_id: str
    environment_id: Optional[str] = None
    workflow_uuid: Optional[str] = None
    steps: Optional[List[DeployStep]] = None
    downstream_overrides: Optional[str] = None  # JSON string of [{serviceId, serviceName, version}]
    status: str
    created_at: datetime
    completed_at: Optional[datetime] = None
    subversion_index: int = 1

    @strawberry.field
    async def version(self, info: Any) -> Optional["ServiceVersion"]:
        """Resolve the version for this deployment via version_id."""
        try:
            db = info.context.db
        except Exception:
            return None
        res = await db.execute(select(ServiceVersionModel).where(ServiceVersionModel.id == self.version_id))
        v = res.scalar_one_or_none()
        if not v:
            return None
        return ServiceVersion(
            id=v.id,
            service_id=v.service_id,
            version_label=v.version_label,
            config_hash=v.config_hash,
            spec_json=v.spec_json,
            created_at=v.created_at,
        )

    @strawberry.field
    async def environment(self, info: Any) -> Optional["Environment"]:
        """Resolve the environment for this deployment via environment_id."""
        if not self.environment_id:
            return None
        try:
            db = info.context.db
        except Exception:
            return None
        res = await db.execute(select(EnvironmentModel).where(EnvironmentModel.id == self.environment_id))
        e = res.scalar_one_or_none()
        if not e:
            return None
        return Environment(
            id=e.id,
            name=e.name,
            type=str(e.type) if hasattr(e.type, "value") else str(e.type),
            url=e.url,
            cluster_id=getattr(e, "cluster_id", None),
            cluster=None,
            project_id=e.project_id,
            project=None,
            created_at=e.created_at,
            updated_at=e.updated_at,
            services=[],
        )


@strawberry.type
class WorkflowStatus:
    """DBOS workflow status with optional progress metadata"""
    workflow_id: str
    workflow_status: str
    steps_completed: Optional[int] = None
    num_steps: Optional[int] = None
    # Private fields for permission routing (not exposed via GraphQL)
    _source: strawberry.Private[Optional[str]] = None
    _environment_id: strawberry.Private[Optional[str]] = None

    @strawberry.field
    async def steps(self, info: Any) -> List["WorkflowStepInfo"]:
        """
        Resolve workflow steps by reading dbos.operation_outputs for this workflow_id.
        Non-admins must have READ permission on the mapped service (via deployments)
        or the mapped environment (via environment_configs).
        """
        context = info.context
        current_user = getattr(context, "current_user", None)
        db = getattr(context, "db", None)
        if db is None:
            return []
        if not (current_user and (current_user.get("is_admin", False))):
            # If this workflow comes from an environment config, check environment permission
            if self._source == "environment" and self._environment_id:
                ok = await check_resource_permission(
                    current_user,
                    PermissionAction.READ,
                    PermissionScope.ENVIRONMENT,
                    self._environment_id,
                    db,
                )
                if not ok:
                    return []
            else:
                # Default: check via deployments mapping
                dep_row = await db.execute(
                    select(DeploymentModel.service_id).where(DeploymentModel.workflow_uuid == self.workflow_id)
                )
                dep = dep_row.first()
                service_id = dep[0] if dep else None
                if not service_id:
                    return []
                ok = await check_resource_permission(
                    current_user,
                    PermissionAction.READ,
                    PermissionScope.SERVICE,
                    service_id,
                    db,
                )
                if not ok:
                    return []

        rs = await db.execute(
            text(
                "select function_id, function_name, output, error, child_workflow_id, started_at_epoch_ms, completed_at_epoch_ms "
                "from dbos.operation_outputs where workflow_uuid = :wid order by function_id asc"
            ),
            {"wid": self.workflow_id},
        )
        rows = rs.fetchall()
        out: List[WorkflowStepInfo] = []
        for r in rows:
            # Row is ordered as selected above
            fn_id = r[0]
            fn_name = r[1]
            raw_output = r[2]
            raw_error = r[3]
            child_wf = r[4]
            started_ms = r[5]
            completed_ms = r[6]
            # Convert function output to JSON when possible, else string
            converted_output: Optional[JSON]
            if raw_output is None:
                converted_output = None
            else:
                try:
                    if isinstance(raw_output, (dict, list, int, float, bool)):
                        converted_output = _to_jsonable(raw_output)
                    elif isinstance(raw_output, (bytes, bytearray)):
                        if len(raw_output) > 0 and raw_output[:1] == b"\x80":
                            converted_output = _decode_pickle_bytes(bytes(raw_output))
                        else:
                            s = raw_output.decode("utf-8", errors="replace")
                            try:
                                converted_output = _json_mod.loads(s)
                            except Exception:
                                converted_output = s
                    elif isinstance(raw_output, str):
                        try:
                            converted_output = _json_mod.loads(raw_output)
                        except Exception:
                            try:
                                b = base64.b64decode(raw_output, validate=True)
                                if len(b) > 0 and b[:1] == b"\x80":
                                    converted_output = _decode_pickle_bytes(b)
                                else:
                                    try:
                                        converted_output = b.decode("utf-8")
                                    except Exception:
                                        converted_output = raw_output
                            except Exception:
                                converted_output = raw_output
                    else:
                        converted_output = str(raw_output)
                except Exception:
                    converted_output = str(raw_output)
            # Convert error similarly
            converted_error: Optional[JSON]
            if raw_error is None:
                converted_error = None
            else:
                try:
                    if isinstance(raw_error, (dict, list, int, float, bool)):
                        converted_error = _to_jsonable(raw_error)
                    elif isinstance(raw_error, (bytes, bytearray)):
                        if len(raw_error) > 0 and raw_error[:1] == b"\x80":
                            converted_error = _decode_pickle_bytes(bytes(raw_error))
                        else:
                            s = raw_error.decode("utf-8", errors="replace")
                            try:
                                converted_error = _json_mod.loads(s)
                            except Exception:
                                converted_error = s
                    elif isinstance(raw_error, str):
                        try:
                            converted_error = _json_mod.loads(raw_error)
                        except Exception:
                            try:
                                b = base64.b64decode(raw_error, validate=True)
                                if len(b) > 0 and b[:1] == b"\x80":
                                    converted_error = _decode_pickle_bytes(b)
                                else:
                                    try:
                                        converted_error = b.decode("utf-8")
                                    except Exception:
                                        converted_error = raw_error
                            except Exception:
                                converted_error = raw_error
                    else:
                        converted_error = str(raw_error)
                except Exception:
                    converted_error = str(raw_error)
            out.append(
                WorkflowStepInfo(
                    function_id=int(fn_id) if fn_id is not None else 0,
                    function_name=str(fn_name) if fn_name is not None else "",
                    output=converted_output,
                    error=converted_error,
                    child_workflow_id=(str(child_wf) if child_wf is not None else None),
                    started_at_epoch_ms=(str(int(started_ms)) if started_ms is not None else None),
                    completed_at_epoch_ms=(str(int(completed_ms)) if completed_ms is not None else None),
                    status=("NOT_STARTED" if (converted_output is None and converted_error is None) else ("FAILURE" if converted_error is not None else "SUCCESS")),
                )
            )
        return out


@strawberry.type
class WorkflowStepInfo:
    """DBOS workflow step information"""
    function_id: int
    function_name: str
    output: Optional[JSON] = None
    error: Optional[JSON] = None
    child_workflow_id: Optional[str] = None
    started_at_epoch_ms: Optional[str] = None
    completed_at_epoch_ms: Optional[str] = None
    status: str = "NOT_STARTED"


@strawberry.type
class Permission:
    id: str
    name: str
    action: str
    resource: str
    description: Optional[str] = None
    created_at: datetime


@strawberry.type
class UserPermission:
    id: str
    user_id: str
    permission_id: str
    resource_id: Optional[str] = None
    granted_at: datetime
    granted_by: Optional[str] = None


@strawberry.type
class ComputedUserPermission:
    """Computed user permissions for a resource (read, write, delete, admin, owner flags)"""
    can_read: bool
    can_write: bool
    can_delete: bool
    is_admin: bool
    is_owner: bool


# Input types
@strawberry.input
class UserCreateInput:
    email: str
    name: str
    is_active: bool = True
    is_admin: bool = False


@strawberry.input
class UserUpdateInput:
    email: Optional[str] = None
    name: Optional[str] = None
    is_active: Optional[bool] = None
    is_admin: Optional[bool] = None


@strawberry.input
class ProjectCreateInput:
    name: str
    description: Optional[str] = None
    owner_id: Optional[str] = None


@strawberry.input
class ProjectUpdateInput:
    name: Optional[str] = None
    description: Optional[str] = None
    owner_id: Optional[str] = None


@strawberry.input
class EnvironmentCreateInput:
    name: str
    type: str
    url: Optional[str] = None
    project_id: str


@strawberry.input
class EnvironmentUpdateInput:
    name: Optional[str] = None
    type: Optional[str] = None
    url: Optional[str] = None
    project_id: Optional[str] = None
    cluster_id: Optional[str] = None


@strawberry.input
class ServiceCreateInput:
    name: str
    description: Optional[str] = None
    type: str
    project_id: str
    environment_ids: Optional[List[str]] = None  # List of environment IDs to link
    owner: Optional[str] = None
    status: str = "unknown"


@strawberry.input
class ServiceUpdateInput:
    name: Optional[str] = None
    description: Optional[str] = None
    type: Optional[str] = None
    project_id: Optional[str] = None
    environment_ids: Optional[List[str]] = None  # List of environment IDs to link
    owner: Optional[str] = None
    status: Optional[str] = None


@strawberry.input
class ProjectConfigCreateInput:
    project_id: str
    key: str
    value: Optional[str] = None
    config_data: Optional[str] = None


@strawberry.input
class ProjectConfigUpdateInput:
    value: Optional[str] = None
    config_data: Optional[str] = None


@strawberry.input
class EnvironmentConfigCreateInput:
    environment_id: str
    key: str
    value: Optional[str] = None
    config_data: Optional[str] = None


@strawberry.input
class ServiceConfigCreateInput:
    service_id: str
    key: str
    value: Optional[str] = None
    config_data: Optional[str] = None


@strawberry.input
class ServiceConfigUpdateInput:
    value: Optional[str] = None
    config_data: Optional[str] = None


@strawberry.type
class GitOrganization:
    """Git organization/workspace"""
    name: str
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None


@strawberry.type
class GitRepository:
    """Git repository"""
    name: str
    full_name: Optional[str] = None
    description: Optional[str] = None
    private: bool = False
    default_branch: Optional[str] = None


@strawberry.input
class EnvironmentVariableCreateInput:
    scope: str
    resource_id: str
    key: str
    value: Optional[str] = None


@strawberry.input
class EnvironmentVariableUpdateInput:
    value: Optional[str] = None


@strawberry.input
class SecretCreateInput:
    scope: str
    resource_id: str
    key: str
    value: Optional[str] = None


@strawberry.input
class SecretUpdateInput:
    value: Optional[str] = None


@strawberry.input
class PermissionCreateInput:
    name: str
    action: str
    resource: str
    description: Optional[str] = None


@strawberry.input
class UserPermissionCreateInput:
    user_id: str
    permission_id: str
    resource_id: Optional[str] = None


@strawberry.type
class ResourcePermission:
    id: str
    user_id: str
    scope: str  # "project", "environment", or "service"
    resource_id: str
    actions: List[str]  # ["read", "write", "delete", "admin"]
    granted_at: datetime
    granted_by: str


@strawberry.input
class ResourcePermissionCreateInput:
    user_id: str
    scope: str  # "project", "environment", or "service"
    resource_id: str
    actions: List[str]  # ["read", "write", "delete", "admin"]


@strawberry.input
class ResourcePermissionUpdateInput:
    actions: Optional[List[str]] = None


# Cluster types
@strawberry.type
class KubernetesCluster:
    id: str
    name: str
    description: Optional[str] = None
    api_url: str
    auth_method: str
    environment_type: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    api_health: Optional["ConnectionTestResult"] = None
    cluster_connection: Optional["ConnectionTestResult"] = None


@strawberry.input
class ClusterCreateInput:
    name: str
    api_url: str
    auth_method: str
    environment_type: Optional[str] = None
    description: Optional[str] = None
    kubeconfig_content: Optional[str] = None
    token: Optional[str] = None
    client_key: Optional[str] = None
    client_cert: Optional[str] = None
    client_ca_cert: Optional[str] = None


@strawberry.input
class ClusterUpdateInput:
    id: str
    name: Optional[str] = None
    api_url: Optional[str] = None
    auth_method: Optional[str] = None
    environment_type: Optional[str] = None
    description: Optional[str] = None
    kubeconfig_content: Optional[str] = None
    token: Optional[str] = None
    client_key: Optional[str] = None
    client_cert: Optional[str] = None
    client_ca_cert: Optional[str] = None


@strawberry.type
class ConnectionTestResult:
    ok: bool
    message: Optional[str] = None


@strawberry.input
class DownstreamOverrideInput:
    """Version override for a downstream service during deployment."""
    service_id: str
    service_name: str
    version: str
