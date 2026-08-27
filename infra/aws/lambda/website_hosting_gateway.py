import base64
import hashlib
import hmac
import json
import mimetypes
import os
import re
import time
from datetime import datetime, timezone

import boto3
from botocore.exceptions import ClientError

SITES_BUCKET = os.environ["SITES_BUCKET"]
DISTRIBUTION_ID = os.environ["DISTRIBUTION_ID"]
CONNECTION_GROUP_ID = os.environ["CONNECTION_GROUP_ID"]
CONNECTION_GROUP_ROUTING_ENDPOINT = os.environ["CONNECTION_GROUP_ROUTING_ENDPOINT"]
SHARED_SECRET_ARN = os.environ["SHARED_SECRET_ARN"]
ENVIRONMENT = os.environ.get("ENVIRONMENT", "production")

MAX_CLOCK_SKEW_MS = 5 * 60 * 1000
MAX_FILES = 50
MAX_FILE_BYTES = 4 * 1024 * 1024
MAX_TOTAL_BYTES = 5 * 1024 * 1024
SAFE_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,128}$")
DOMAIN_RE = re.compile(r"^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$")

s3 = boto3.client("s3")
cloudfront = boto3.client("cloudfront")
secrets = boto3.client("secretsmanager")
_secret_cache = None


def _json_response(status_code, payload):
    return {
        "statusCode": status_code,
        "headers": {"content-type": "application/json", "cache-control": "no-store"},
        "body": json.dumps(payload, separators=(",", ":"), default=str),
    }


def _header_map(event):
    return {str(key).lower(): str(value) for key, value in (event.get("headers") or {}).items()}


def _raw_body(event):
    body = event.get("body") or ""
    if event.get("isBase64Encoded"):
        return base64.b64decode(body).decode("utf-8")
    return body


def _shared_secret():
    global _secret_cache
    if _secret_cache:
        return _secret_cache
    result = secrets.get_secret_value(SecretId=SHARED_SECRET_ARN)
    value = result.get("SecretString")
    if not value:
        raise RuntimeError("website_hosting_gateway_secret_missing")
    _secret_cache = value
    return value


def _authorized(event, body):
    headers = _header_map(event)
    timestamp = headers.get("x-toh-timestamp", "")
    signature = headers.get("x-toh-signature", "")
    if not timestamp or not signature:
        return False
    try:
        timestamp_ms = int(timestamp)
    except ValueError:
        return False
    if abs(int(time.time() * 1000) - timestamp_ms) > MAX_CLOCK_SKEW_MS:
        return False
    method = str(((event.get("requestContext") or {}).get("http") or {}).get("method") or "GET").upper()
    path = str(event.get("rawPath") or "/")
    signed_payload = "\n".join([timestamp, method, path, body])
    expected = hmac.new(_shared_secret().encode("utf-8"), signed_payload.encode("utf-8"), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def _safe_id(value, field):
    text = str(value or "").strip()
    if not SAFE_ID_RE.match(text):
        raise ValueError(f"invalid_{field}")
    return text


def _domain(value):
    text = str(value or "").strip().lower().rstrip(".")
    if not DOMAIN_RE.match(text):
        raise ValueError("invalid_domain")
    return text


def _safe_path(value):
    path = str(value or "").strip()
    if not path or path.startswith("/") or ".." in path or "\\" in path:
        raise ValueError("invalid_artifact_path")
    return path


def _content_type(path, explicit=None):
    if explicit:
        return str(explicit)
    guessed, _ = mimetypes.guess_type(path)
    return guessed or "application/octet-stream"


def _cache_control(path):
    lowered = path.lower()
    if lowered.endswith(".html") or lowered.endswith(".json"):
        return "public,max-age=60,s-maxage=60,must-revalidate"
    return "public,max-age=31536000,immutable"


def _release_prefix(website_id, version):
    return f"websites/{website_id}/releases/{version}"


def _tenant_name(website_id):
    compact = re.sub(r"[^A-Za-z0-9-]", "", website_id)[:48]
    return f"toh-{ENVIRONMENT[:12]}-{compact}"[:64]


def _get_tenant(identifier):
    try:
        result = cloudfront.get_distribution_tenant(Identifier=identifier)
        return result.get("DistributionTenant"), result.get("ETag")
    except ClientError as error:
        if error.response.get("Error", {}).get("Code") == "EntityNotFound":
            return None, None
        raise


def _tenant_payload(domain, release_prefix):
    return {
        "DistributionId": DISTRIBUTION_ID,
        "Domains": [{"Domain": domain}],
        "ConnectionGroupId": CONNECTION_GROUP_ID,
        "Enabled": True,
        "ManagedCertificateRequest": {
            "ValidationTokenHost": "cloudfront",
            "PrimaryDomainName": domain,
            "CertificateTransparencyLoggingPreference": "enabled",
        },
        "Parameters": [{"Name": "tenantPath", "Value": release_prefix}],
    }


def _ensure_tenant(website_id, domain, release_prefix):
    name = _tenant_name(website_id)
    tenant, etag = _get_tenant(name)
    request = _tenant_payload(domain, release_prefix)
    if tenant is None:
        try:
            created = cloudfront.create_distribution_tenant(Name=name, Tags={"Items": [
                {"Key": "Project", "Value": "TheOutHaven"},
                {"Key": "Environment", "Value": ENVIRONMENT},
                {"Key": "WebsiteId", "Value": website_id},
            ]}, **request)
            tenant = created.get("DistributionTenant") or {}
            etag = created.get("ETag")
        except ClientError as error:
            if error.response.get("Error", {}).get("Code") != "EntityAlreadyExists":
                raise
            tenant, etag = _get_tenant(name)
    else:
        updated = cloudfront.update_distribution_tenant(
            Id=tenant["Id"],
            IfMatch=etag,
            **request,
        )
        tenant = updated.get("DistributionTenant") or tenant
        etag = updated.get("ETag")
    return tenant, etag


def _invalidate_tenant(tenant_id, version):
    try:
        result = cloudfront.create_invalidation_for_distribution_tenant(
            Id=tenant_id,
            InvalidationBatch={
                "Paths": {"Quantity": 1, "Items": ["/*"]},
                "CallerReference": f"publish-{version}-{int(time.time() * 1000)}",
            },
        )
        invalidation = result.get("Invalidation") or {}
        return {"id": invalidation.get("Id"), "status": invalidation.get("Status")}
    except AttributeError:
        return {"id": None, "status": "unsupported_sdk"}


def _manifest_entry(path, body):
    return {
        "path": path,
        "bytes": len(body),
        "sha256": hashlib.sha256(body).hexdigest(),
    }


def _upload_release(payload):
    website_id = _safe_id(payload.get("websiteId"), "website_id")
    location_id = _safe_id(payload.get("locationId"), "location_id")
    try:
        version = int(payload.get("version"))
    except (TypeError, ValueError):
        raise ValueError("invalid_version")
    if version < 1:
        raise ValueError("invalid_version")
    domain = _domain(payload.get("domain"))
    files = payload.get("files")
    if not isinstance(files, list) or not files or len(files) > MAX_FILES:
        raise ValueError("invalid_artifact_files")

    prefix = _release_prefix(website_id, version)
    manifest = []
    total_bytes = 0
    for item in files:
        if not isinstance(item, dict):
            raise ValueError("invalid_artifact_file")
        path = _safe_path(item.get("path"))
        content = str(item.get("content") or "")
        body = content.encode("utf-8")
        if len(body) > MAX_FILE_BYTES:
            raise ValueError("artifact_file_too_large")
        total_bytes += len(body)
        if total_bytes > MAX_TOTAL_BYTES:
            raise ValueError("artifact_release_too_large")
        key = f"{prefix}/{path}"
        s3.put_object(
            Bucket=SITES_BUCKET,
            Key=key,
            Body=body,
            ContentType=_content_type(path, item.get("contentType")),
            CacheControl=_cache_control(path),
            ServerSideEncryption="AES256",
            Metadata={
                "website-id": website_id,
                "location-id": location_id,
                "release-version": str(version),
            },
        )
        manifest.append(_manifest_entry(path, body))

    manifest_body = json.dumps({
        "websiteId": website_id,
        "locationId": location_id,
        "version": version,
        "domain": domain,
        "releasePrefix": prefix,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "files": manifest,
    }, separators=(",", ":")).encode("utf-8")
    s3.put_object(
        Bucket=SITES_BUCKET,
        Key=f"{prefix}/_manifest.json",
        Body=manifest_body,
        ContentType="application/json",
        CacheControl="no-store",
        ServerSideEncryption="AES256",
    )
    return website_id, location_id, version, domain, prefix, manifest


def _publish(payload):
    website_id, location_id, version, domain, prefix, manifest = _upload_release(payload)
    provision_tenant = payload.get("provisionTenant") is not False
    tenant_result = None
    invalidation = None
    if provision_tenant:
        tenant, _ = _ensure_tenant(website_id, domain, prefix)
        tenant_id = tenant.get("Id")
        if tenant_id:
            invalidation = _invalidate_tenant(tenant_id, version)
        tenant_result = {
            "id": tenant_id,
            "name": tenant.get("Name"),
            "status": tenant.get("Status"),
            "enabled": tenant.get("Enabled"),
            "domains": tenant.get("Domains") or [],
            "parameters": tenant.get("Parameters") or [],
        }
    return {
        "ok": True,
        "provider": "aws-cloudfront-s3",
        "websiteId": website_id,
        "locationId": location_id,
        "version": version,
        "bucket": SITES_BUCKET,
        "releasePrefix": prefix,
        "files": len(manifest),
        "routingEndpoint": CONNECTION_GROUP_ROUTING_ENDPOINT,
        "tenant": tenant_result,
        "invalidation": invalidation,
    }


def _rollback(payload):
    website_id = _safe_id(payload.get("websiteId"), "website_id")
    domain = _domain(payload.get("domain"))
    try:
        version = int(payload.get("version"))
    except (TypeError, ValueError):
        raise ValueError("invalid_version")
    if version < 1:
        raise ValueError("invalid_version")
    prefix = _release_prefix(website_id, version)
    manifest_key = f"{prefix}/_manifest.json"
    try:
        s3.head_object(Bucket=SITES_BUCKET, Key=manifest_key)
    except ClientError as error:
        if error.response.get("ResponseMetadata", {}).get("HTTPStatusCode") == 404 or error.response.get("Error", {}).get("Code") in {"404", "NoSuchKey", "NotFound"}:
            raise ValueError("release_not_found")
        raise
    tenant, etag = _get_tenant(_tenant_name(website_id))
    if not tenant or not etag:
        raise ValueError("tenant_not_found")
    request = _tenant_payload(domain, prefix)
    updated = cloudfront.update_distribution_tenant(Id=tenant["Id"], IfMatch=etag, **request)
    tenant = updated.get("DistributionTenant") or tenant
    invalidation = _invalidate_tenant(tenant["Id"], version)
    return {
        "ok": True,
        "provider": "aws-cloudfront-s3",
        "websiteId": website_id,
        "version": version,
        "releasePrefix": prefix,
        "routingEndpoint": CONNECTION_GROUP_ROUTING_ENDPOINT,
        "tenant": {"id": tenant.get("Id"), "status": tenant.get("Status")},
        "invalidation": invalidation,
    }


def handler(event, context):
    try:
        body = _raw_body(event)
        if not _authorized(event, body):
            return _json_response(401, {"ok": False, "error": "unauthorized"})
        method = str(((event.get("requestContext") or {}).get("http") or {}).get("method") or "GET").upper()
        path = str(event.get("rawPath") or "/")

        if method == "GET" and path == "/v1/status":
            return _json_response(200, {
                "ok": True,
                "authenticated": True,
                "environment": ENVIRONMENT,
                "provider": "aws-cloudfront-s3",
                "sitesBucket": SITES_BUCKET,
                "distributionId": DISTRIBUTION_ID,
                "connectionGroupId": CONNECTION_GROUP_ID,
                "routingEndpoint": CONNECTION_GROUP_ROUTING_ENDPOINT,
            })

        payload = json.loads(body or "{}")
        if method == "POST" and path == "/v1/sites/publish":
            return _json_response(200, _publish(payload))
        if method == "POST" and path == "/v1/sites/rollback":
            return _json_response(200, _rollback(payload))
        return _json_response(404, {"ok": False, "error": "not_found"})
    except ValueError as error:
        return _json_response(400, {"ok": False, "error": str(error)})
    except ClientError as error:
        code = error.response.get("Error", {}).get("Code") or "aws_error"
        print(json.dumps({"event": "website_hosting_gateway_aws_error", "code": code, "requestId": getattr(context, "aws_request_id", None)}))
        return _json_response(502, {"ok": False, "error": "aws_provider_error", "code": code})
    except Exception as error:
        print(json.dumps({"event": "website_hosting_gateway_error", "error": type(error).__name__, "requestId": getattr(context, "aws_request_id", None)}))
        return _json_response(500, {"ok": False, "error": "internal_error"})
