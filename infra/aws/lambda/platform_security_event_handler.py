import json
import os

import boto3
import urllib.error
import urllib.request
from botocore.exceptions import ClientError

ENVIRONMENT = os.environ.get("ENVIRONMENT", "production")
ALERT_TOPIC_ARN = os.environ["ALERT_TOPIC_ARN"]
AUTO_CONTAIN_TAG_KEY = os.environ.get("AUTO_CONTAIN_TAG_KEY", "TheOutHavenAutoContain")
AUTO_CONTAIN_TAG_VALUE = os.environ.get("AUTO_CONTAIN_TAG_VALUE", "enabled")
GUARDDUTY_CONTAIN_SEVERITY = float(os.environ.get("GUARDDUTY_CONTAIN_SEVERITY", "7.0"))
SUPABASE_SECRET_ID = os.environ.get(
    "SUPABASE_SECRET_ID",
    f"/theouthaven/credential-vault/{ENVIRONMENT}/supabase",
)

sns = boto3.client("sns")
iam = boto3.client("iam")
secrets = boto3.client("secretsmanager")
_supabase_config = None


def _publish(subject, payload):
    message = {
        "AlarmName": subject,
        "NewStateValue": "ALARM",
        "NewStateReason": json.dumps(payload, separators=(",", ":"), default=str)[:3500],
    }
    sns.publish(
        TopicArn=ALERT_TOPIC_ARN,
        Subject=subject[:100],
        Message=json.dumps(message, separators=(",", ":"), default=str),
    )


def _supabase():
    global _supabase_config
    if _supabase_config:
        return _supabase_config
    raw = secrets.get_secret_value(SecretId=SUPABASE_SECRET_ID).get("SecretString") or "{}"
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise RuntimeError("supabase_credential_vault_invalid")
    url = str(value.get("url") or "").strip().rstrip("/")
    key = str(value.get("secretKey") or value.get("serviceRoleKey") or "").strip()
    if not url or not key:
        raise RuntimeError("supabase_server_credential_missing")
    _supabase_config = (url, key)
    return _supabase_config


def _persist_security_event(subject, payload):
    url, key = _supabase()
    containment = payload.get("containment") or {}
    level = "critical"
    body = json.dumps({
        "category": "security_incident",
        "level": level,
        "message": subject,
        "source": "aws-security-event-handler",
        "metadata": {
            **payload,
            "incident_key": payload.get("findingId") or ":".join([
                str(payload.get("source") or "aws"),
                str(payload.get("eventName") or payload.get("findingType") or "security_event"),
                str(payload.get("userIdentityArn") or payload.get("account") or "account"),
            ]),
            "state": "open",
            "containment_attempted": bool(containment.get("attempted")),
            "contained": bool(containment.get("contained")),
        },
    }, separators=(",", ":"), default=str).encode("utf-8")

    request = urllib.request.Request(
        f"{url}/rest/v1/admin_system_logs",
        method="POST",
        data=body,
        headers={
            "apikey": key,
            "authorization": f"Bearer {key}",
            "content-type": "application/json",
            "prefer": "return=minimal",
            "user-agent": "TheOutHaven-Security-Event-Handler/1.0",
        },
    )
    with urllib.request.urlopen(request, timeout=10) as response:
        if int(response.status) not in (200, 201, 204):
            raise RuntimeError(f"security_event_persist_http_{response.status}")


def _tags_for_user(user_name):
    tags = {}
    marker = None
    while True:
        kwargs = {"UserName": user_name}
        if marker:
            kwargs["Marker"] = marker
        result = iam.list_user_tags(**kwargs)
        for item in result.get("Tags") or []:
            tags[str(item.get("Key") or "")] = str(item.get("Value") or "")
        if not result.get("IsTruncated"):
            break
        marker = result.get("Marker")
        if not marker:
            break
    return tags


def _contain_guardduty_access_key(detail):
    severity = float(detail.get("severity") or 0)
    resource = detail.get("resource") or {}
    key = resource.get("accessKeyDetails") or {}
    access_key_id = str(key.get("accessKeyId") or "").strip()
    user_name = str(key.get("userName") or "").strip()
    if severity < GUARDDUTY_CONTAIN_SEVERITY or not access_key_id or not user_name:
        return {"attempted": False, "reason": "not_eligible"}

    tags = _tags_for_user(user_name)
    if tags.get(AUTO_CONTAIN_TAG_KEY) != AUTO_CONTAIN_TAG_VALUE:
        return {
            "attempted": False,
            "reason": "user_not_opted_in",
            "userName": user_name,
            "accessKeyIdSuffix": access_key_id[-4:],
        }

    iam.update_access_key(
        UserName=user_name,
        AccessKeyId=access_key_id,
        Status="Inactive",
    )
    return {
        "attempted": True,
        "contained": True,
        "action": "iam_access_key_inactivated",
        "userName": user_name,
        "accessKeyIdSuffix": access_key_id[-4:],
        "severity": severity,
    }


def _guardduty_event(event):
    detail = event.get("detail") or {}
    containment = {"attempted": False, "reason": "not_applicable"}
    try:
        containment = _contain_guardduty_access_key(detail)
    except ClientError as error:
        containment = {
            "attempted": True,
            "contained": False,
            "reason": error.response.get("Error", {}).get("Code", "iam_error"),
        }

    payload = {
        "source": "guardduty",
        "environment": ENVIRONMENT,
        "findingId": detail.get("id"),
        "findingType": detail.get("type"),
        "severity": detail.get("severity"),
        "title": detail.get("title"),
        "description": detail.get("description"),
        "region": event.get("region"),
        "account": event.get("account"),
        "containment": containment,
    }
    _publish("TheOutHaven AWS security finding", payload)
    try:
        _persist_security_event("TheOutHaven AWS security finding", payload)
    except Exception as error:
        payload["persistenceError"] = type(error).__name__
    return payload


def _cloudtrail_event(event):
    detail = event.get("detail") or {}
    event_name = str(detail.get("eventName") or "")
    user_identity = detail.get("userIdentity") or {}
    payload = {
        "source": "cloudtrail",
        "environment": ENVIRONMENT,
        "eventName": event_name,
        "eventSource": detail.get("eventSource"),
        "awsRegion": detail.get("awsRegion"),
        "sourceIPAddress": detail.get("sourceIPAddress"),
        "userAgent": detail.get("userAgent"),
        "userIdentityType": user_identity.get("type"),
        "userIdentityArn": user_identity.get("arn"),
        "principalId": user_identity.get("principalId"),
        "account": event.get("account"),
        "containment": {"attempted": False, "reason": "alert_only_event"},
    }
    subject = "TheOutHaven AWS security change"
    if user_identity.get("type") == "Root":
        subject = "TheOutHaven AWS ROOT activity"
    elif event_name in {"StopLogging", "DeleteTrail", "UpdateTrail"}:
        subject = "TheOutHaven AWS audit trail tampering"
    elif event_name in {"CreateAccessKey", "UpdateAccessKey", "DeleteAccessKey"}:
        subject = "TheOutHaven AWS access key change"
    elif event_name in {"AttachUserPolicy", "AttachRolePolicy", "PutUserPolicy", "PutRolePolicy", "CreatePolicyVersion", "SetDefaultPolicyVersion"}:
        subject = "TheOutHaven AWS privilege change"
    _publish(subject, payload)
    try:
        _persist_security_event(subject, payload)
    except Exception as error:
        payload["persistenceError"] = type(error).__name__
    return payload


def _azure_security_event(event):
    detail = event.get("detail") or {}
    payload = {
        "source": "azure_activity_log",
        "environment": ENVIRONMENT,
        "eventDataId": detail.get("eventDataId"),
        "eventName": detail.get("operationName"),
        "severity": detail.get("severity") or "high",
        "title": detail.get("title") or "Azure privileged control-plane change",
        "description": detail.get("description"),
        "resourceId": detail.get("resourceId"),
        "caller": detail.get("caller"),
        "status": detail.get("status"),
        "eventTimestamp": detail.get("eventTimestamp"),
        "correlationId": detail.get("correlationId"),
        "subscriptionId": detail.get("subscriptionId"),
        "containment": {"attempted": False, "reason": "alert_only_event"},
    }
    subject = "TheOutHaven Azure security change"
    if str(payload.get("severity") or "").lower() == "critical":
        subject = "TheOutHaven Azure CRITICAL security change"
    _publish(subject, payload)
    try:
        _persist_security_event(subject, payload)
    except Exception as error:
        payload["persistenceError"] = type(error).__name__
    return payload


def handler(event, context):
    source = str(event.get("source") or "")
    detail_type = str(event.get("detail-type") or "")
    if source == "aws.guardduty" and detail_type == "GuardDuty Finding":
        result = _guardduty_event(event)
    elif detail_type == "AWS API Call via CloudTrail":
        result = _cloudtrail_event(event)
    elif source == "toh.azure.security" and detail_type == "Azure Activity Log Security Signal":
        result = _azure_security_event(event)
    else:
        result = {
            "source": source,
            "detailType": detail_type,
            "ignored": True,
        }
    print(json.dumps(result, separators=(",", ":"), default=str))
    return {"ok": True, **result}
