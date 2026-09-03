#!/usr/bin/env python3
"""Resolve a safe production mail configuration without printing credential values."""

from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import time
import urllib.request
from pathlib import Path
from typing import Any

MAIL_KEYS = (
    "RESEND_API_KEY",
    "RESEND_FROM_EMAIL",
    "ADMIN_EMAIL",
    "SUPERADMIN_EMAIL",
    "ADMIN_ALERT_EMAIL",
    "ADMIN_DIGEST_EMAIL",
    "ADMIN_CRON_DIGEST_EMAIL",
    "ADMIN_RESERVATION_DIGEST_EMAIL",
    "SEARCH_HEALTH_DIGEST_TO",
    "MARKETING_PULSE_TO",
    "PLATFORM_ERROR_DIGEST_TO",
    "THEOUTHAVEN_ADMIN_EMAIL",
)

GATEWAY_KEYS = ("AWS_PLATFORM_JOB_GATEWAY_URL", "AWS_PLATFORM_JOB_GATEWAY_SECRET")


def parse_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, raw = line.split("=", 1)
        key = key.strip()
        if key not in set(MAIL_KEYS) | set(GATEWAY_KEYS):
            continue
        raw = raw.strip()
        try:
            value: Any = json.loads(raw) if raw.startswith('"') else raw.strip("'")
        except json.JSONDecodeError:
            value = raw.strip('"').strip("'")
        if isinstance(value, str) and value:
            values[key] = value
    return values


def read_json(path: Path) -> dict[str, str]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise SystemExit(f"{path.name} must contain a JSON object")
    return {str(k): v for k, v in value.items() if isinstance(v, str) and v}


def valid_resend_key(value: str | None) -> bool:
    if not isinstance(value, str) or len(value.strip()) < 16:
        return False
    lowered = value.strip().lower()
    return lowered not in {"placeholder", "changeme", "not-configured", "resend_api_key"}


def credential_vault_resend(configs: list[dict[str, str]]) -> str:
    gateway_url = ""
    gateway_secret = ""
    for values in configs:
        gateway_url = gateway_url or values.get("AWS_PLATFORM_JOB_GATEWAY_URL", "")
        gateway_secret = gateway_secret or values.get("AWS_PLATFORM_JOB_GATEWAY_SECRET", "")
    if not gateway_url or not gateway_secret or not gateway_url.lower().startswith("https://"):
        return ""

    path = "/v1/credentials/runtime?environment=production"
    timestamp = str(int(time.time() * 1000))
    canonical = "\n".join((timestamp, "GET", path, ""))
    signature = hmac.new(gateway_secret.encode(), canonical.encode(), hashlib.sha256).hexdigest()
    request = urllib.request.Request(
        gateway_url.rstrip("/") + path,
        method="GET",
        headers={"x-toh-timestamp": timestamp, "x-toh-signature": signature},
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except Exception as exc:  # noqa: BLE001 - do not expose remote error contents
        print(f"credential_vault_resend=unavailable:{type(exc).__name__}")
        return ""

    providers = payload.get("providers", {}) if isinstance(payload, dict) else {}
    resend = providers.get("resend", {}) if isinstance(providers, dict) else {}
    api_key = resend.get("apiKey", "") if isinstance(resend, dict) else ""
    return api_key if isinstance(api_key, str) else ""


def first_value(key: str, sources: list[dict[str, str]]) -> str:
    for values in sources:
        value = values.get(key, "")
        if isinstance(value, str) and value:
            return value
    return ""


def require_recipient(values: dict[str, str], keys: tuple[str, ...], label: str) -> None:
    if not any(values.get(key) for key in keys):
        raise SystemExit(f"{label} mail environment is missing an admin digest recipient")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--vercel-env", required=True, type=Path)
    parser.add_argument("--edge-current", required=True, type=Path)
    parser.add_argument("--shared-current", required=True, type=Path)
    parser.add_argument("--edge-output", required=True, type=Path)
    parser.add_argument("--shared-output", required=True, type=Path)
    parser.add_argument("--source-output", required=True, type=Path)
    args = parser.parse_args()

    vercel = parse_env(args.vercel_env)
    edge = read_json(args.edge_current)
    shared = read_json(args.shared_current)

    vault_key = credential_vault_resend([shared, edge, vercel])
    candidates = (
        ("credential_vault", vault_key),
        ("vercel", vercel.get("RESEND_API_KEY", "")),
        ("shared_app_env", shared.get("RESEND_API_KEY", "")),
        ("edge_runtime", edge.get("RESEND_API_KEY", "")),
    )
    source = ""
    resend_key = ""
    for candidate_source, candidate_key in candidates:
        if valid_resend_key(candidate_key):
            source = candidate_source
            resend_key = candidate_key.strip()
            break
    if not resend_key:
        raise SystemExit("No valid Resend API key is available from Credential Vault, Vercel, or existing AWS runtime secrets")

    authoritative_mail: dict[str, str] = {}
    for key in MAIL_KEYS:
        value = first_value(key, [vercel, shared, edge])
        if value:
            authoritative_mail[key] = value
    authoritative_mail["RESEND_API_KEY"] = resend_key

    edge_merged = dict(edge)
    edge_merged.update(authoritative_mail)
    shared_merged = dict(shared)
    shared_merged.update(authoritative_mail)

    if not valid_resend_key(edge_merged.get("RESEND_API_KEY")) or not valid_resend_key(shared_merged.get("RESEND_API_KEY")):
        raise SystemExit("Merged AWS mail configuration does not contain a valid Resend key")

    require_recipient(
        edge_merged,
        ("ADMIN_CRON_DIGEST_EMAIL", "ADMIN_EMAIL", "SUPERADMIN_EMAIL", "ADMIN_ALERT_EMAIL"),
        "Edge runtime",
    )
    require_recipient(
        shared_merged,
        ("ADMIN_DIGEST_EMAIL", "THEOUTHAVEN_ADMIN_EMAIL", "SUPERADMIN_EMAIL"),
        "Shared app environment",
    )

    args.edge_output.write_text(json.dumps(edge_merged, separators=(",", ":"), sort_keys=True), encoding="utf-8")
    args.shared_output.write_text(json.dumps(shared_merged, separators=(",", ":"), sort_keys=True), encoding="utf-8")
    args.source_output.write_text(source, encoding="utf-8")
    print(f"authoritative_resend_source={source}")


if __name__ == "__main__":
    main()
