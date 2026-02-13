"""
Kubernetes manifest apply helpers.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple, Union
import asyncio
import json
import time
import yaml
from app.core.k8s.connection import build_api_client, build_api_client_from_cluster, K8sApiClient, K8sApiException
try:
    from kubernetes.dynamic import DynamicClient  # type: ignore
except Exception:  # pragma: no cover - handled at runtime if client not installed
    DynamicClient = None  # type: ignore


# Client construction is provided by core.k8s.connection; reuse it here.


def _ensure_list_of_dicts(manifest: Union[str, Dict[str, Any], List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    """
    Normalize input to a list of manifest dicts. Supports:
    - YAML string (multi-document supported)
    - Single dict
    - List of dicts
    """
    if isinstance(manifest, str):
        docs: List[Dict[str, Any]] = []
        for doc in yaml.safe_load_all(manifest):
            if not doc:
                continue
            if not isinstance(doc, dict):
                raise ValueError("Each YAML document must be a mapping/object")
            docs.append(doc)
        return docs
    if isinstance(manifest, list):
        return manifest
    if isinstance(manifest, dict):
        return [manifest]
    raise ValueError("Unsupported manifest type")


async def apply_manifest(
    manifest: Union[str, Dict[str, Any], List[Dict[str, Any]]],
    *,
    cluster: Optional[Any] = None,
    api_url: Optional[str] = None,
    auth_method: Optional[str] = None,
    token: Optional[str] = None,
    kubeconfig_content: Optional[str] = None,
    client_key: Optional[str] = None,
    client_cert: Optional[str] = None,
    client_ca: Optional[str] = None,
    field_manager: str = "env360",
) -> Tuple[bool, str]:
    """
    Apply a Kubernetes manifest (server-side: create or patch) using the python client.
    - `manifest` can be YAML string, a dict, or list of dicts.
    - Credentials can be passed directly or via a `cluster` model instance.
    Returns (ok, message).
    """
    if DynamicClient is None or K8sApiClient is None:
        return False, "kubernetes python client not installed on server."

    if cluster is not None:
        api_client, err = build_api_client_from_cluster(cluster)
    else:
        api_client, err = build_api_client(
            api_url=api_url,
            auth_method=auth_method,
            token=token,
            kubeconfig_content=kubeconfig_content,
            client_key=client_key,
            client_cert=client_cert,
            client_ca=client_ca,
        )
    if err:
        return False, err
    if api_client is None:
        return False, "Failed to create Kubernetes client."

    dyn = DynamicClient(api_client)  # type: ignore
    docs = _ensure_list_of_dicts(manifest)
    applied: List[str] = []
    try:
        for doc in docs:
            # Basic validations
            api_version = doc.get("apiVersion")
            kind = doc.get("kind")
            metadata = doc.get("metadata", {}) or {}
            name = metadata.get("name")
            namespace = metadata.get("namespace")
            if not api_version or not kind or not name:
                raise ValueError(f"Manifest missing apiVersion/kind/metadata.name: {json.dumps(doc)[:200]}")

            resource = dyn.resources.get(api_version=api_version, kind=kind)  # type: ignore
            body = doc
            namespaced = getattr(resource, "namespaced", False) and namespace

            # Try server-side apply first; fall back to strategic-merge-patch on 409
            try:
                patch_kwargs: Dict[str, Any] = dict(
                    name=name,
                    body=body,
                    content_type="application/apply-patch+yaml",
                    field_manager=field_manager,
                    force=True,
                )
                if namespaced:
                    patch_kwargs["namespace"] = namespace
                resource.patch(**patch_kwargs)  # type: ignore
                applied.append(f"applied {kind}/{name}{' in ' + namespace if namespace else ''}")
            except K8sApiException as ssa_err:
                if getattr(ssa_err, "status", None) == 409:
                    # Field-manager conflict – fall back to strategic-merge-patch
                    merge_kwargs: Dict[str, Any] = dict(
                        name=name,
                        body=body,
                        content_type="application/strategic-merge-patch+json",
                    )
                    if namespaced:
                        merge_kwargs["namespace"] = namespace
                    resource.patch(**merge_kwargs)  # type: ignore
                    applied.append(f"patched {kind}/{name}{' in ' + namespace if namespace else ''}")
                else:
                    raise
        return True, "; ".join(applied) if applied else "No resources to apply."
    except Exception as e:
        return False, str(e)
    finally:
        try:
            api_client.close()  # type: ignore[attr-defined]
        except Exception:
            pass


async def apply_namespace(manifest: Dict[str, Any], **kwargs: Any) -> Tuple[bool, str]:
    """Apply a Namespace manifest dict."""
    return await apply_manifest(manifest, **kwargs)


async def apply_service_account(manifest: Dict[str, Any], **kwargs: Any) -> Tuple[bool, str]:
    """Apply a ServiceAccount manifest dict."""
    return await apply_manifest(manifest, **kwargs)


async def apply_deployment(manifest: Dict[str, Any], **kwargs: Any) -> Tuple[bool, str]:
    """Apply a Deployment manifest dict."""
    return await apply_manifest(manifest, **kwargs)


async def apply_manifest_from_string(yaml_text: str, **kwargs: Any) -> Tuple[bool, str]:
    """Apply one or more manifests provided as a YAML string (supports multi-doc)."""
    return await apply_manifest(yaml_text, **kwargs)



# ---------------------------------------------------------------------------
# Resource readiness polling
# ---------------------------------------------------------------------------

def _check_namespace_ready(resource: Any, name: str) -> Tuple[bool, str]:
    """Return (ready, message) for a Namespace."""
    try:
        obj = resource.get(name=name)  # type: ignore
        phase = (obj.status or {}).get("phase", "Unknown") if hasattr(obj, "status") else "Unknown"
        if str(phase).lower() == "active":
            return True, f"Namespace {name} is Active"
        return False, f"Namespace {name} phase={phase}"
    except Exception as e:
        return False, str(e)


def _check_service_account_ready(resource: Any, name: str, namespace: str) -> Tuple[bool, str]:
    """Return (ready, message) for a ServiceAccount (exists = ready)."""
    try:
        resource.get(name=name, namespace=namespace)  # type: ignore
        return True, f"ServiceAccount {name} exists in {namespace}"
    except Exception as e:
        return False, str(e)


def _check_deployment_ready(resource: Any, name: str, namespace: str) -> Tuple[bool, str]:
    """Return (ready, message) for a Deployment (all replicas available)."""
    try:
        obj = resource.get(name=name, namespace=namespace)  # type: ignore
        status = obj.status if hasattr(obj, "status") else {}
        replicas = (obj.spec or {}).get("replicas", 1) if hasattr(obj, "spec") else 1
        available = int((status or {}).get("availableReplicas") or 0)
        updated = int((status or {}).get("updatedReplicas") or 0)
        ready = int((status or {}).get("readyReplicas") or 0)
        if available >= replicas and updated >= replicas and ready >= replicas:
            return True, f"Deployment {name} ready ({available}/{replicas} available)"
        return False, f"Deployment {name}: {available}/{replicas} available, {ready}/{replicas} ready"
    except Exception as e:
        return False, str(e)


def _check_service_ready(resource: Any, name: str, namespace: str) -> Tuple[bool, str]:
    """Return (ready, message) for a Service (exists and has a clusterIP or endpoints)."""
    try:
        obj = resource.get(name=name, namespace=namespace)  # type: ignore
        spec = obj.spec if hasattr(obj, "spec") else {}
        cluster_ip = (spec or {}).get("clusterIP", "")
        svc_type = (spec or {}).get("type", "ClusterIP")
        if svc_type == "LoadBalancer":
            status = obj.status if hasattr(obj, "status") else {}
            ingress = ((status or {}).get("loadBalancer") or {}).get("ingress") or []
            if ingress:
                return True, f"Service {name} LoadBalancer ready (ingress assigned)"
            return False, f"Service {name} LoadBalancer pending (no ingress yet)"
        if cluster_ip and cluster_ip != "None":
            return True, f"Service {name} ready (clusterIP={cluster_ip})"
        return False, f"Service {name} exists but no clusterIP assigned yet"
    except Exception as e:
        return False, str(e)


def _check_virtual_service_ready(resource: Any, name: str, namespace: str) -> Tuple[bool, str]:
    """Return (ready, message) for a VirtualService / Ingress route (exists = ready)."""
    try:
        resource.get(name=name, namespace=namespace)  # type: ignore
        return True, f"Route {name} exists in {namespace}"
    except Exception as e:
        return False, str(e)


# Map of (kind) -> (apiVersion, checker_fn, is_namespaced)
_READINESS_CHECKERS: Dict[str, Any] = {
    "Namespace": ("v1", _check_namespace_ready, False),
    "ServiceAccount": ("v1", _check_service_account_ready, True),
    "Deployment": ("apps/v1", _check_deployment_ready, True),
    "Service": ("v1", _check_service_ready, True),
    "VirtualService": ("networking.istio.io/v1beta1", _check_virtual_service_ready, True),
    "Ingress": ("networking.k8s.io/v1", _check_virtual_service_ready, True),
    "Gateway": ("networking.istio.io/v1beta1", _check_virtual_service_ready, True),
    "HTTPRoute": ("gateway.networking.k8s.io/v1", _check_virtual_service_ready, True),
}


async def poll_resource_ready(
    manifest: Dict[str, Any],
    *,
    cluster: Optional[Any] = None,
    timeout_seconds: int = 300,
    poll_interval: int = 10,
    **kwargs: Any,
) -> Tuple[bool, str]:
    """
    Poll a Kubernetes resource until it is ready or timeout is reached.
    `manifest` must be a dict with apiVersion, kind, and metadata.name (+ namespace if applicable).
    Returns (ok, message).
    """
    if DynamicClient is None or K8sApiClient is None:
        return False, "kubernetes python client not installed on server."

    kind = manifest.get("kind", "")
    metadata = manifest.get("metadata", {}) or {}
    name = metadata.get("name", "")
    namespace = metadata.get("namespace")

    checker_entry = _READINESS_CHECKERS.get(kind)
    if not checker_entry:
        # No readiness checker; assume ready immediately
        return True, f"No readiness check defined for kind={kind}; assuming ready."

    api_version, checker_fn, is_namespaced = checker_entry

    if cluster is not None:
        api_client, err = build_api_client_from_cluster(cluster)
    else:
        api_client, err = build_api_client(**kwargs)
    if err:
        return False, err
    if api_client is None:
        return False, "Failed to create Kubernetes client."

    dyn = DynamicClient(api_client)  # type: ignore
    resource = dyn.resources.get(api_version=api_version, kind=kind)  # type: ignore
    start = time.monotonic()
    last_msg = ""
    try:
        while True:
            elapsed = time.monotonic() - start
            if elapsed >= timeout_seconds:
                return False, f"Timeout ({timeout_seconds}s) waiting for {kind}/{name}: {last_msg}"
            if is_namespaced:
                ok, last_msg = checker_fn(resource, name, namespace)
            else:
                ok, last_msg = checker_fn(resource, name)
            if ok:
                return True, last_msg
            await asyncio.sleep(poll_interval)
    except Exception as e:
        return False, str(e)
    finally:
        try:
            api_client.close()  # type: ignore[attr-defined]
        except Exception:
            pass
