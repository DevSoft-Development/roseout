import json
import os
import urllib.error
import urllib.request

import boto3

ENVIRONMENT = os.environ.get("ENVIRONMENT", "production")
GITHUB_SECRET_ID = os.environ.get(
    "GITHUB_SECRET_ID",
    f"/theouthaven/credential-vault/{ENVIRONMENT}/github",
)
GITHUB_REPOSITORY = os.environ.get("GITHUB_REPOSITORY", "DevSoft-Development/roseout")
EVENT_TYPE = os.environ.get("EVENT_TYPE", "platform-job-gateway-rotate")

secrets = boto3.client("secretsmanager")


def _github_token():
    raw = secrets.get_secret_value(SecretId=GITHUB_SECRET_ID).get("SecretString") or "{}"
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise RuntimeError("github_credential_vault_invalid")
    token = str(value.get("token") or "").strip()
    if not token:
        raise RuntimeError("github_runtime_token_missing")
    return token


def _dispatch(token):
    body = json.dumps({
        "event_type": EVENT_TYPE,
        "client_payload": {
            "environment": ENVIRONMENT,
            "source": "aws-eventbridge-scheduler",
        },
    }).encode("utf-8")
    request = urllib.request.Request(
        f"https://api.github.com/repos/{GITHUB_REPOSITORY}/dispatches",
        method="POST",
        data=body,
        headers={
            "authorization": f"Bearer {token}",
            "accept": "application/vnd.github+json",
            "content-type": "application/json",
            "user-agent": "TheOutHaven-Credential-Rotation-Scheduler/1.0",
            "x-github-api-version": "2022-11-28",
        },
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        status = int(response.status)
        if status not in (200, 201, 202, 204):
            raise RuntimeError(f"github_rotation_dispatch_http_{status}")
        return status


def handler(event, context):
    try:
        status = _dispatch(_github_token())
        print(json.dumps({
            "event": "platform_job_gateway_rotation_dispatched",
            "environment": ENVIRONMENT,
            "repository": GITHUB_REPOSITORY,
            "httpStatus": status,
            "requestId": getattr(context, "aws_request_id", None),
        }, separators=(",", ":")))
        return {
            "ok": True,
            "environment": ENVIRONMENT,
            "repository": GITHUB_REPOSITORY,
            "status": status,
        }
    except urllib.error.HTTPError as error:
        print(json.dumps({
            "event": "platform_job_gateway_rotation_dispatch_failed",
            "environment": ENVIRONMENT,
            "status": int(error.code),
            "requestId": getattr(context, "aws_request_id", None),
        }, separators=(",", ":")))
        raise
