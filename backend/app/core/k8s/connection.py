"""
Kubernetes API authenticated connection utilities.
"""
from __future__ import annotations
from typing import Tuple, List, Optional, Any
import tempfile
import yaml
import os
from app.core.security import decrypt_secret
from typing import Tuple, Optional

try:
    from kubernetes.client import Configuration as K8sConfiguration, ApiClient as K8sApiClient
    from kubernetes.client import AuthenticationApi as K8sAuthenticationApi
    from kubernetes import config as k8s_config
    from kubernetes.client.rest import ApiException as K8sApiException  # type: ignore
except Exception:
    K8sConfiguration = None  # type: ignore
    K8sApiClient = None  # type: ignore
    K8sAuthenticationApi = None  # type: ignore
    k8s_config = None  # type: ignore
    K8sApiException = Exception  # type: ignore


async def check_connection(
    *,
    api_url: Optional[str] = None,
    auth_method: Optional[str] = None,
    token: Optional[str] = None,
    kubeconfig_content: Optional[str] = None,
    client_key: Optional[str] = None,
    client_cert: Optional[str] = None,
    client_ca: Optional[str] = None,
    cluster: Optional[Any] = None,
) -> Tuple[bool, str]:
    """
    Attempt an authenticated call using AuthenticationApi.get_api_group with the provided credentials.
    Returns (ok, message).
    You may pass a cluster model instance via `cluster` (preferred), or individual args.
    """
    if cluster is not None:
        api_url = getattr(cluster, "api_url", None)
        raw_method = getattr(cluster, "auth_method", None)
        if raw_method is None:
            auth_method = None
        else:
            auth_method = raw_method.value if hasattr(raw_method, "value") else str(raw_method)
        token = decrypt_secret(getattr(cluster, "token", None))
        kubeconfig_content = decrypt_secret(getattr(cluster, "kubeconfig_content", None))
        client_key = decrypt_secret(getattr(cluster, "client_key", None))
        client_cert = decrypt_secret(getattr(cluster, "client_cert", None))
        client_ca = decrypt_secret(getattr(cluster, "client_ca_cert", None))

    if K8sConfiguration is None:
        return False, "kubernetes python client not installed on server."

    host = (api_url or "").strip()
    if not host:
        return False, "Cluster API URL is not configured."

    method = (auth_method or "").strip()
    cfg = K8sConfiguration()
    cfg.host = host
    temp_files: List[str] = []
    try:
        if method in ("token", "serviceAccount"):
            if not token:
                return False, "Token is not configured."
            cfg.api_key = {'authorization': token}
            cfg.api_key_prefix = {'authorization': 'Bearer'}
            with K8sApiClient(cfg) as api_client:  # type: ignore
                api = K8sAuthenticationApi(api_client)  # type: ignore
                api.get_api_group()
                return True, "Connected successfully (token)."

        if method == "kubeconfig":
            if not kubeconfig_content:
                return False, "Kubeconfig content is not configured."
            try:
                kc = yaml.safe_load(kubeconfig_content)
                k8s_config.load_kube_config_from_dict(kc, persist_config=False)  # type: ignore
                with K8sApiClient() as api_client:  # type: ignore
                    api = K8sAuthenticationApi(api_client)  # type: ignore
                    api.get_api_group()
                    return True, "Connected via kubeconfig."
            except Exception as e:
                return False, f"Kubeconfig load/call failed: {e}"

        if method == "clientCert":
            if not (client_key and client_cert and client_ca):
                return False, "Client key/cert/CA are required for clientCert."
            # Persist to temp files
            for content in (client_key, client_cert, client_ca):
                tf = tempfile.NamedTemporaryFile(mode="w", delete=False)
                tf.write(content)
                tf.flush()
                tf.close()
                temp_files.append(tf.name)
            cfg.cert_file = temp_files[1]
            cfg.key_file = temp_files[0]
            cfg.ssl_ca_cert = temp_files[2]
            cfg.verify_ssl = True
            with K8sApiClient(cfg) as api_client:  # type: ignore
                api = K8sAuthenticationApi(api_client)  # type: ignore
                api.get_api_group()
                return True, "Connected successfully (client certificate)."

        return False, f"Unsupported auth method: {method}"
    except K8sApiException as e:  # type: ignore
        return False, f"Kubernetes API error: {e}"
    except Exception as e:
        return False, str(e)
    finally:
        for p in temp_files:
            try:
                os.remove(p)
            except Exception:
                pass


def build_api_client(
    *,
    api_url: Optional[str] = None,
    auth_method: Optional[str] = None,
    token: Optional[str] = None,
    kubeconfig_content: Optional[str] = None,
    client_key: Optional[str] = None,
    client_cert: Optional[str] = None,
    client_ca: Optional[str] = None,
) -> Tuple[Optional["K8sApiClient"], Optional[str]]:
    """
    Build and return a configured Kubernetes ApiClient using the same credential logic
    as check_connection. Returns (api_client, error). On failure, api_client is None and
    error is a string.
    """
    if K8sConfiguration is None or K8sApiClient is None:
        return None, "kubernetes python client not installed on server."

    host = (api_url or "").strip()
    method = (auth_method or "").strip()
    temp_files: List[str] = []
    try:
        if method in ("token", "serviceAccount"):
            if not host:
                return None, "Cluster API URL is not configured."
            if not token:
                return None, "Token is not configured."
            cfg = K8sConfiguration()
            cfg.host = host
            cfg.api_key = {'authorization': token}
            cfg.api_key_prefix = {'authorization': 'Bearer'}
            return K8sApiClient(cfg), None

        if method == "kubeconfig":
            if not kubeconfig_content:
                return None, "Kubeconfig content is not configured."
            try:
                kc = yaml.safe_load(kubeconfig_content)
                k8s_config.load_kube_config_from_dict(kc, persist_config=False)  # type: ignore
                return K8sApiClient(), None  # type: ignore
            except Exception as e:
                return None, f"Kubeconfig load failed: {e}"

        if method == "clientCert":
            if not host:
                return None, "Cluster API URL is not configured."
            if not (client_key and client_cert and client_ca):
                return None, "Client key/cert/CA are required for clientCert."
            # Persist to temp files
            for content in (client_key, client_cert, client_ca):
                tf = tempfile.NamedTemporaryFile(mode="w", delete=False)
                tf.write(content)
                tf.flush()
                tf.close()
                temp_files.append(tf.name)
            cfg = K8sConfiguration()
            cfg.host = host
            cfg.cert_file = temp_files[1]
            cfg.key_file = temp_files[0]
            cfg.ssl_ca_cert = temp_files[2]
            cfg.verify_ssl = True
            return K8sApiClient(cfg), None  # type: ignore

        if not method:
            return None, "Authentication method is not configured."
        return None, f"Unsupported auth method: {method}"
    except Exception as e:
        return None, str(e)
    finally:
        for p in temp_files:
            try:
                os.remove(p)
            except Exception:
                pass


def build_api_client_from_cluster(cluster: Any) -> Tuple[Optional["K8sApiClient"], Optional[str]]:
    """
    Create an ApiClient from a cluster model instance with encrypted fields.
    """
    api_url = getattr(cluster, "api_url", None)
    raw_method = getattr(cluster, "auth_method", None)
    if raw_method is None:
        auth_method = None
    else:
        auth_method = raw_method.value if hasattr(raw_method, "value") else str(raw_method)
    token = decrypt_secret(getattr(cluster, "token", None))
    kubeconfig_content = decrypt_secret(getattr(cluster, "kubeconfig_content", None))
    client_key = decrypt_secret(getattr(cluster, "client_key", None))
    client_cert = decrypt_secret(getattr(cluster, "client_cert", None))
    client_ca = decrypt_secret(getattr(cluster, "client_ca_cert", None))
    return build_api_client(
        api_url=api_url,
        auth_method=auth_method,
        token=token,
        kubeconfig_content=kubeconfig_content,
        client_key=client_key,
        client_cert=client_cert,
        client_ca=client_ca,
    )

