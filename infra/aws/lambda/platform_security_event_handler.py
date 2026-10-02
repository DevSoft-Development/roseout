import json
import os

import boto3
from botocore.exceptions import ClientError

ENVIRONMENT = os.environ.get("ENVIRONMENT", "production")
ALERT_TOPIC_ARN = os.environ["ALERT_TOPIC_ARN"]
AUTO_CONTAIN_TAG_KEY = os.environ.get("AUTO_CONTAIN_TAG_KEY", "TheOutHavenAutoContain")
AUTO_CONTAIN_TAG_VALUE = os.environ.get("AUTO_CONTAIN_TAG_VALUE", "enabled")
GUARDDUTY_CONTAIN_SEVERITY = float(os.environ.get("GUARDDUTY_CONTAIN_SEVERITY", "7.0"))

sns = boto3.client("sns")
iam = boto3.client("iam")


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
    return payload


def handler(event, context):
    source = str(event.get("source") or "")
    detail_type = str(event.get("detail-type") or "")
    if source == "aws.guardduty" and detail_type == "GuardDuty Finding":
        result = _guardduty_event(event)
    elif detail_type == "AWS API Call via CloudTrail":
        result = _cloudtrail_event(event)
    else:
        result = {
            "source": source,
            "detailType": detail_type,
            "ignored": True,
        }
    print(json.dumps(result, separators=(",", ":"), default=str))
    return {"ok": True, **result}
