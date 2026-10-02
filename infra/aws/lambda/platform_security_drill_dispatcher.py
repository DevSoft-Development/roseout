import json
import os
import urllib.request
import boto3

ENVIRONMENT = os.environ.get("ENVIRONMENT", "production")
GITHUB_SECRET_ID = os.environ.get("GITHUB_SECRET_ID", f"/theouthaven/credential-vault/{ENVIRONMENT}/github")
GITHUB_REPOSITORY = os.environ.get("GITHUB_REPOSITORY", "DevSoft-Development/roseout")
EVENT_TYPE = os.environ.get("EVENT_TYPE", "platform-security-drill-suite")
secrets = boto3.client("secretsmanager")

def _token():
    raw = secrets.get_secret_value(SecretId=GITHUB_SECRET_ID).get("SecretString") or "{}"
    value = json.loads(raw)
    token = str(value.get("token") or "").strip() if isinstance(value, dict) else ""
    if not token:
        raise RuntimeError("github_runtime_token_missing")
    return token

def handler(event, context):
    body = json.dumps({
        "event_type": EVENT_TYPE,
        "client_payload": {"environment": ENVIRONMENT, "source": "aws-eventbridge-scheduler"}
    }).encode("utf-8")
    req = urllib.request.Request(
        f"https://api.github.com/repos/{GITHUB_REPOSITORY}/dispatches",
        method="POST",
        data=body,
        headers={
            "authorization": f"Bearer {_token()}",
            "accept": "application/vnd.github+json",
            "content-type": "application/json",
            "user-agent": "TheOutHaven-Security-Drill-Scheduler/1.0",
            "x-github-api-version": "2022-11-28",
        },
    )
    with urllib.request.urlopen(req, timeout=15) as response:
        status = int(response.status)
        if status not in (200, 201, 202, 204):
            raise RuntimeError(f"github_dispatch_http_{status}")
    return {"ok": True, "status": status, "eventType": EVENT_TYPE}
