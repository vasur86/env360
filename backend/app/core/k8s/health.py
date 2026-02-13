"""
Kubernetes API health utilities.
"""
from __future__ import annotations
from typing import Tuple
import httpx


async def check_readyz(api_url: str, *, timeout_seconds: float = 5.0, verify_ssl: bool = False) -> Tuple[bool, str]:
    """
    Check the unauthenticated /readyz endpoint and return (ok, message).
    - ok: True when HTTP 200 and body contains 'ok' (case-insensitive)
    - message: 'ok' on success, or '<status>: <body>' / exception string on failure
    """
    if not api_url:
        return False, "API URL is empty"

    url = api_url.rstrip("/") + "/readyz"
    try:
        async with httpx.AsyncClient(verify=verify_ssl, timeout=timeout_seconds) as client:
            resp = await client.get(url)
            text = (resp.text or "").strip()
            if resp.status_code == 200 and "ok" in text.lower():
                return True, "ok"
            return False, f"{resp.status_code}: {text}"
    except Exception as e:
        return False, str(e)

