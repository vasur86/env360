from __future__ import annotations
from typing import Any, Dict, List, Mapping, Optional, Literal
from app.core.config import settings


def _normalize_name(name: str) -> str:
    """
    Normalize a resource name to be close to DNS‑1123 compliant by replacing
    common invalid characters.
    """
    return name.lower().replace("/", "-").replace("_", "-").replace(" ", "-")

def _get_namespace_name(service_details: dict) -> str:
    project_id = _normalize_name(service_details["project"]["id"])
    return f"proj-{project_id}"

def render_namespace_manifest(service_details: dict) -> dict:
    project_id = _normalize_name(service_details["project"]["id"])
    project_name = _normalize_name(service_details["project"]["name"])
    ns_name = _get_namespace_name(service_details)
    return {
        "apiVersion": "v1",
        "kind": "Namespace",
        "metadata": {
            "name": ns_name,
            "labels": {
                "project-id": project_id,
                "project-name": project_name or "",
            },
        },
    }

def _build_labels(scope: Literal["namespace", "deployment", "pod", "service", "service_account"], service_details: dict, version_label: Optional[str] = None, deployment_id: Optional[str] = None, extra: Optional[Mapping[str, str]] = None) -> Dict[str, str]:
    """
    Standardized set of labels for Namespaces/Deployments/Pods/Services.
    """
    labels: Dict[str, str] = {
          # Kubernetes standard        
        "app.kubernetes.io/part-of": "env360",
        "app.kubernetes.io/managed-by": "env360",
        "project-id": service_details["project"]["id"],
        "project-name": service_details["project"]["name"],
        "deployment-id": deployment_id,
    }
    
    # Deployment labels
    if scope in ["deployment", "pod", "service", "service_account"]:
        labels.update({
            "app.kubernetes.io/name": f'{service_details["service"]["name"]}-{version_label}',
            "app.kubernetes.io/instance": f"{service_details['service']['id']}-{version_label}",
            "app.kubernetes.io/version": version_label,
            "app": f'{service_details["service"]["name"]}-{version_label}',
            "version": version_label,
            "service-id": service_details["service"]["id"],
            "service-name": service_details["service"]["name"],
        })
        # Lane label for Istio source-based routing
        lane_id = service_details.get("lane_id") or service_details.get("config", {}).get("lane_id")
        if lane_id:
            labels["lane"] = str(lane_id)
    
    # if scope == "pod":
    #     labels.update({
    #         "app.kubernetes.io/name": f'{service_details["service"]["name"]}-{version_label}',
    #         "app.kubernetes.io/instance": f"{service_details['service']['id']}-{version_label}",
    #         "app.kubernetes.io/version": version_label,
    #         "app": f'{service_details["service"]["name"]}-{version_label}',
    #         "version": version_label,
    #         "service-id": service_details["service"]["id"],
    #         "service-name": service_details["service"]["name"],
    #     })
    
    # if scope == "service":
    #     labels.update({
    #         "app.kubernetes.io/name": f'{service_details["service"]["name"]}-{version_label}',
    #         "app.kubernetes.io/instance": f"{service_details['service']['id']}-{version_label}",
    #         "app.kubernetes.io/version": version_label,
    #         "app": f'{service_details["service"]["name"]}-{version_label}',
    #         "version": version_label,
    #         "service-id": service_details["service"]["id"],
    #         "service-name": service_details["service"]["name"],
    #     })

    
    if extra:
        labels.update(dict(extra))
    return labels


def _build_deployment_metadata(service_details: dict, version_label: str, deployment_id: str) -> Dict[str, Any]:
    """
    Build Kubernetes object metadata.
    """
    return {
        "name": f"{_normalize_name(service_details['service']['name'])}-{version_label}",
        "namespace": _get_namespace_name(service_details),
        "labels": _build_labels("deployment", service_details, version_label, deployment_id),
        # "annotations": service_details.get("config", {}).get("annotations", {}),
    }

def _build_container_spec(service_details: dict, version_label: str) -> Dict[str, Any]:
    """
    Build a container spec with sensible defaults suitable for production.
    """
    config = service_details.get("config", {})
    service_name = _normalize_name(service_details.get("service", {}).get("name", "app"))
    image = config.get("docker_image") or config.get("image") or ""

    spec: Dict[str, Any] = {
        "name": f"{service_name}",
        "image": image,
        "imagePullPolicy": config.get("imagePullPolicy", "IfNotPresent"),
    }

    # Only include optional fields when explicitly configured
    command = config.get("command")
    if command:
        spec["command"] = command if isinstance(command, list) else [command]

    ports = config.get("ports")
    if ports:
        spec["ports"] = ports

    env = config.get("env")
    if env:
        spec["env"] = env

    liveness = config.get("livenessProbe")
    if liveness and isinstance(liveness, dict) and liveness:
        spec["livenessProbe"] = liveness

    readiness = config.get("readinessProbe")
    if readiness and isinstance(readiness, dict) and readiness:
        spec["readinessProbe"] = readiness

    volume_mounts = config.get("volumeMounts")
    if volume_mounts:
        spec["volumeMounts"] = volume_mounts

    security_ctx = config.get("securityContext")
    if security_ctx and isinstance(security_ctx, dict) and security_ctx:
        spec["securityContext"] = security_ctx

    resources = config.get("resources")
    if resources and isinstance(resources, dict) and resources:
        spec["resources"] = resources

    return spec


def _build_pod_spec(service_details: dict, version_label: str) -> Dict[str, Any]:
    """
    Build a Pod spec with common production fields.
    """
    config = service_details.get("config", {})
    spec: Dict[str, Any] = {
        "containers": [_build_container_spec(service_details, version_label)],
        "dnsPolicy": config.get("dnsPolicy", "ClusterFirst"),
        "restartPolicy": config.get("restartPolicy", "Always"),
        "serviceAccount": f"{_normalize_name(service_details['service']['name'])}-{version_label}-account",
        "serviceAccountName": f"{_normalize_name(service_details['service']['name'])}-{version_label}-account",
        "terminationGracePeriodSeconds": config.get("terminationGracePeriodSeconds", 30),
        "securityContext": {}, # TODO: Add security context
        "volumes": [] # TODO: Add volumes
    }    
    return spec


def _build_deployment_spec(service_details: dict, version_label: str, deployment_id: str) -> Dict[str, Any]:
    """
    Build a Deployment spec with rolling update strategy.
    """
    config = service_details.get("config", {})
    spec: Dict[str, Any] = {
        "replicas": config.get("replicas", 1),
        "revisionHistoryLimit": config.get("revisionHistoryLimit", 10),
        "progressDeadlineSeconds": config.get("progressDeadlineSeconds", 600),
        "strategy": {
            "type": config.get("strategy", "RollingUpdate"),
            "rollingUpdate": {
                "maxUnavailable": config.get("rollingUpdate_maxUnavailable", 0),
                "maxSurge": config.get("rollingUpdate_maxSurge", 1),
            },
        },
        "selector": {
            "matchLabels": {
                "service-id": service_details["service"]["id"],
                "service-name": service_details["service"]["name"],
                "version": version_label,
                "project-id": service_details["project"]["id"],
                "project-name": service_details["project"]["name"],
            }
        },
        "template": {
            "metadata": _build_deployment_metadata(service_details, version_label, deployment_id),
            "spec": _build_pod_spec(service_details, version_label),
        },
    }
    return spec


def render_deployment_yaml(
    service_details: dict,    
    version_label: str,        
    deployment_id: str,
) -> Dict[str, Any]:
    """
    Build a production‑grade Kubernetes Deployment manifest (as a dict) in a modular way.
    """
    manifest: Dict[str, Any] = {
        "apiVersion": "apps/v1",
        "kind": "Deployment",
        "metadata": _build_deployment_metadata(service_details, version_label, deployment_id),
        "spec": _build_deployment_spec(service_details, version_label, deployment_id),
    }
    return manifest


def render_service_yaml(service_details: dict, version_label: str, deployment_id: str) -> Dict[str, Any]:
    """
    Build a Kubernetes Service manifest that routes traffic to the matching pods.
    """
    config = service_details.get("config", {})
    svc_name = _normalize_name(service_details["service"]["name"])
    namespace = _get_namespace_name(service_details)

    # Derive ports from config; default to port 80 -> targetPort 80
    configured_ports = config.get("ports", [])
    svc_ports: List[Dict[str, Any]] = []
    for p in configured_ports:
        if isinstance(p, dict):
            svc_ports.append({
                "name": p.get("name", f"port-{p.get('containerPort', 80)}"),
                "port": p.get("containerPort", 80),
                "targetPort": p.get("containerPort", 80),
                "protocol": p.get("protocol", "TCP"),
            })
    if not svc_ports:
        svc_ports = [{"name": "http", "port": 80, "targetPort": 80, "protocol": "TCP"}]

    selector_labels = {
        "service-id": service_details["service"]["id"],
        "service-name": service_details["service"]["name"],
        "version": version_label,
        "project-id": service_details["project"]["id"],
        "project-name": service_details["project"]["name"],
    }

    manifest: Dict[str, Any] = {
        "apiVersion": "v1",
        "kind": "Service",
        "metadata": {
            "name": f"{svc_name}-{version_label}",
            "namespace": namespace,
            "labels": _build_labels("service", service_details, version_label, deployment_id),
        },
        "spec": {
            "type": config.get("serviceType", "ClusterIP"),
            "selector": selector_labels,
            "ports": svc_ports,
        },
    }
    return manifest


def render_route_yaml(service_details: dict, version_label: str, deployment_id: str, env_name: str = "") -> Dict[str, Any]:
    """
    Build a Gateway API HTTPRoute manifest that routes traffic to the
    Kubernetes Service created for this service version.
    """
    config = service_details.get("config", {})
    svc_name = _normalize_name(service_details["service"]["name"])
    namespace = _get_namespace_name(service_details)
    project_name = _normalize_name(service_details["project"]["name"])
    env_segment = _normalize_name(env_name) if env_name else ""

    # Path-based routing: <base_domain>/<project>/<env>/<service>/<version>
    base_domain = config.get("base_domain") or settings.BASE_DOMAIN
    route_prefix = f"/{project_name}/{env_segment}/{svc_name}/{version_label}" if env_segment else f"/{project_name}/{svc_name}/{version_label}"

    # Backend service name matches the Service manifest name
    backend_svc_name = f"{svc_name}-{version_label}"

    # Derive first port from config; default to 80
    configured_ports = config.get("ports", [])
    backend_port = 80
    if configured_ports and isinstance(configured_ports[0], dict):
        backend_port = configured_ports[0].get("containerPort", 80)

    manifest: Dict[str, Any] = {
        "apiVersion": "gateway.networking.k8s.io/v1",
        "kind": "HTTPRoute",
        "metadata": {
            "name": f"{svc_name}-{version_label}-route",
            "namespace": namespace,
            "labels": _build_labels("service", service_details, version_label, deployment_id),
        },
        "spec": {
            "hostnames": [base_domain],
            "parentRefs": [
                {
                    "name": config.get("gateway_name", "env360-ingress"),
                    "namespace": config.get("gateway_namespace", "istio-ingress"),
                }
            ],
            "rules": [
                {
                    "matches": [
                        {
                            "path": {
                                "type": "PathPrefix",
                                "value": route_prefix,
                            }
                        }
                    ],
                    "backendRefs": [
                        {
                            "name": backend_svc_name,
                            "port": backend_port,
                        }
                    ],
                }
            ],
        },
    }
    return manifest


def render_service_account_yaml(service_details: dict, version_label: str, deployment_id: str) -> Dict[str, Any]:
    """
    Build a Service Account manifest.
    """
    manifest: Dict[str, Any] = {
        "apiVersion": "v1",
        "kind": "ServiceAccount",
        "metadata":  {
            "name": f"{_normalize_name(service_details['service']['name'])}-{version_label}-account",
            "namespace": _get_namespace_name(service_details),
            "labels": _build_labels("service_account", service_details, version_label, deployment_id),
        }        
    }
    return manifest


# ---------------------------------------------------------------------------
# Istio lane-based routing manifests
# ---------------------------------------------------------------------------


def render_destination_rule(
    service_details: dict,
    version_label: str,
    deployment_id: str,
    downstream_overrides: Optional[List[Dict[str, str]]] = None,
) -> List[Dict[str, Any]]:
    """
    Build DestinationRule manifests that declare subsets for this service
    *and* for every downstream service that has a version override.

    Each DestinationRule groups traffic subsets by the ``version`` pod label
    so that VirtualService rules can route to specific versions.

    Returns a **list** of DestinationRule manifests (one per unique host).
    """
    namespace = _get_namespace_name(service_details)
    svc_name = _normalize_name(service_details["service"]["name"])

    # Collect host → set-of-versions mapping
    host_versions: Dict[str, set] = {}

    # The current service itself
    host_versions.setdefault(svc_name, set()).add(version_label)

    # Downstream services
    for ds in (downstream_overrides or []):
        ds_host = _normalize_name(ds.get("serviceName", ""))
        ds_ver = ds.get("version", "")
        if ds_host and ds_ver:
            host_versions.setdefault(ds_host, set()).add(ds_ver)

    manifests: List[Dict[str, Any]] = []
    for host, versions in host_versions.items():
        subsets = [
            {"name": v, "labels": {"version": v}}
            for v in sorted(versions)
        ]
        manifests.append({
            "apiVersion": "networking.istio.io/v1beta1",
            "kind": "DestinationRule",
            "metadata": {
                "name": f"{host}-dest-rule",
                "namespace": namespace,
                "labels": _build_labels("service", service_details, version_label, deployment_id),
            },
            "spec": {
                "host": host,
                "subsets": subsets,
            },
        })
    return manifests


def render_virtual_service_source_dest(
    service_details: dict,
    version_label: str,
    deployment_id: str,
    lane_id: str = "",
    downstream_overrides: Optional[List[Dict[str, str]]] = None,
) -> List[Dict[str, Any]]:
    """
    Build VirtualService manifests for **source → dest** (mesh-internal) routing.

    For each downstream service override we create a VirtualService that
    matches traffic **from** this service's pods (using ``sourceLabels``)
    and routes it to the specified downstream version subset.

    Returns a **list** of VirtualService manifests (one per downstream).
    """
    if not downstream_overrides:
        return []

    namespace = _get_namespace_name(service_details)
    svc_name = _normalize_name(service_details["service"]["name"])

    source_labels: Dict[str, str] = {
        "app": f"{svc_name}-{version_label}",
        "version": version_label,
    }
    if lane_id:
        source_labels["lane"] = lane_id

    manifests: List[Dict[str, Any]] = []
    for ds in downstream_overrides:
        ds_host = _normalize_name(ds.get("serviceName", ""))
        ds_ver = ds.get("version", "")
        if not ds_host or not ds_ver:
            continue

        manifests.append({
            "apiVersion": "networking.istio.io/v1beta1",
            "kind": "VirtualService",
            "metadata": {
                "name": f"{svc_name}-to-{ds_host}-{version_label}",
                "namespace": namespace,
                "labels": _build_labels("service", service_details, version_label, deployment_id),
            },
            "spec": {
                "hosts": [ds_host],
                "http": [
                    {
                        "match": [
                            {"sourceLabels": source_labels}
                        ],
                        "route": [
                            {
                                "destination": {
                                    "host": ds_host,
                                    "subset": ds_ver,
                                }
                            }
                        ],
                    }
                ],
            },
        })
    return manifests


def render_virtual_service_external(
    service_details: dict,
    version_label: str,
    deployment_id: str,
    env_name: str = "",
) -> Dict[str, Any]:
    """
    Build a VirtualService manifest for **external / gateway** ingress traffic.

    This replaces the previous ``render_route_yaml`` (HTTPRoute) for Istio
    environments.  External traffic arriving at the gateway is routed to the
    correct service version via a URI prefix match.

    Route pattern: ``/<project>/<env>/<service>/<version>``
    """
    config = service_details.get("config", {})
    svc_name = _normalize_name(service_details["service"]["name"])
    namespace = _get_namespace_name(service_details)
    project_name = _normalize_name(service_details["project"]["name"])
    env_segment = _normalize_name(env_name) if env_name else ""

    base_domain = config.get("base_domain") or settings.BASE_DOMAIN
    route_prefix = (
        f"/{project_name}/{env_segment}/{svc_name}/{version_label}"
        if env_segment
        else f"/{project_name}/{svc_name}/{version_label}"
    )

    # Backend service name matches the K8s Service manifest name
    backend_svc_name = f"{svc_name}-{version_label}"

    # Derive first port from config; default to 80
    configured_ports = config.get("ports", [])
    backend_port = 80
    if configured_ports and isinstance(configured_ports[0], dict):
        backend_port = configured_ports[0].get("containerPort", 80)

    gateway_name = config.get("gateway_name", "env360-ingress")
    gateway_namespace = config.get("gateway_namespace", "istio-ingress")

    manifest: Dict[str, Any] = {
        "apiVersion": "networking.istio.io/v1beta1",
        "kind": "VirtualService",
        "metadata": {
            "name": f"{svc_name}-{version_label}-ext-vs",
            "namespace": namespace,
            "labels": _build_labels("service", service_details, version_label, deployment_id),
        },
        "spec": {
            "hosts": [base_domain],
            "gateways": [f"{gateway_namespace}/{gateway_name}"],
            "http": [
                {
                    "match": [
                        {
                            "uri": {
                                "prefix": route_prefix,
                            }
                        }
                    ],
                    "route": [
                        {
                            "destination": {
                                "host": backend_svc_name,
                                "port": {"number": backend_port},
                            }
                        }
                    ],
                }
            ],
        },
    }
    return manifest


# ---------------------------------------------------------------------------
# Environment-level manifests (Certificate + Gateway)
# ---------------------------------------------------------------------------


def render_certificate_manifest(
    env_name: str,
    project_name: str,
) -> Dict[str, Any]:
    """
    Build a cert-manager Certificate manifest for an environment.

    The certificate covers ``<base_domain>`` and ``*.<base_domain>`` so every
    service route under this environment can reuse the same wildcard cert.
    All values are read from ``settings.DOMAIN_*``.
    """
    domain = f'{env_name}.{project_name}.{settings.BASE_DOMAIN}'
    cert_namespace = settings.DOMAIN_CERT_NAMESPACE
    issuer_name = settings.DOMAIN_ISSUER_NAME
    duration_hours = settings.DOMAIN_CERT_DURATION_HOURS
    renew_before_hours = settings.DOMAIN_CERT_RENEW_BEFORE_HOURS
    env_seg = _normalize_name(env_name)
    proj_seg = _normalize_name(project_name)
    cert_name = f"{env_seg}-{proj_seg}-cert"

    return {
        "apiVersion": "cert-manager.io/v1",
        "kind": "Certificate",
        "metadata": {
            "name": cert_name,
            "namespace": cert_namespace,
            "labels": {
                "app.kubernetes.io/part-of": "env360",
                "app.kubernetes.io/managed-by": "env360",
                "environment-name": env_seg,
                "project-name": proj_seg,
            },
        },
        "spec": {
            "secretName": cert_name,
            "issuerRef": {
                "name": issuer_name,
                "kind": "ClusterIssuer",
            },
            "dnsNames": [
                domain,
                f"*.{domain}",
            ],
            "duration": f"{duration_hours}h",
            "renewBefore": f"{renew_before_hours}h",
        },
    }


def render_gateway_manifest(
    env_name: str,
    project_name: str,
    listeners: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Build a Gateway API Gateway (listener) manifest for an environment.

    Creates two HTTPS listeners:
    * **https-domain** – wildcard ``*.<base_domain>`` for subdomain routing
    * **https-path** – exact ``<base_domain>`` for path-based routing

    Both terminate TLS using the certificate produced by the Certificate manifest.
    All values are read from ``settings.DOMAIN_*``.
    """    
    gateway_name = settings.DOMAIN_GATEWAY_NAME
    gateway_namespace = settings.DOMAIN_GATEWAY_NAMESPACE
    gateway_class_name = settings.DOMAIN_GATEWAY_CLASS_NAME
    cert_namespace = settings.DOMAIN_CERT_NAMESPACE    
    listeners_spec = []
    for listener in listeners:
        val = listener.get('value', '{}')
        if isinstance(val, str):
            import json
            val = json.loads(val)
        env_seg = _normalize_name(val.get('environment_name', ''))
        proj_seg = _normalize_name(val.get('project_name', ''))
        domain = f'{env_name}.{project_name}.{settings.BASE_DOMAIN}'        
        cert_name = f"{env_seg}-{proj_seg}-cert"
        listeners_spec.append({
            "name": f"http-{proj_seg}-{env_seg}-domain",
            "port": 443,
            "protocol": "HTTPS",
            "hostname": f"*.{domain}",
            "allowedRoutes": {
                "namespaces": {"from": "All"},
            },
            "tls": {
                "mode": "Terminate",
                "certificateRefs": [
                    {
                        "name": cert_name,
                        "namespace": cert_namespace,
                    }
                ],
            },
        })
        listeners_spec.append({
            "name": f"http-{proj_seg}-{env_seg}-path",
            "port": 443,
            "protocol": "HTTPS",
            "hostname": domain,
            "allowedRoutes": {
                "namespaces": {"from": "All"},
            },
            "tls": {
                "mode": "Terminate",
                "certificateRefs": [
                    {
                        "name": cert_name,
                        "namespace": cert_namespace,
                    }
                ],
            },
        })

    return {
        "apiVersion": "gateway.networking.k8s.io/v1",
        "kind": "Gateway",
        "metadata": {
            "name": gateway_name,
            "namespace": gateway_namespace,
            "labels": {
                "app.kubernetes.io/part-of": "env360",
                "app.kubernetes.io/managed-by": "env360",                
            },
            "annotations": {
                "tailscale.com/expose": "true",
            },
        },
        "spec": {
            "gatewayClassName": gateway_class_name,
            "listeners": listeners_spec,
        },
    }
    return manifest 
