import datetime

import boto3
from botocore.exceptions import ClientError


def _iso(value):
    if value is None:
        return None
    if isinstance(value, (datetime.datetime, datetime.date)):
        return value.isoformat()
    return str(value)


def _latest(resources):
    values = [item.get("lastUpdatedAt") for item in resources if item.get("lastUpdatedAt")]
    return max(values) if values else None


def _health_from_statuses(statuses, bad_words=None, warn_words=None):
    bad_words = bad_words or ["failed", "error", "alarm", "offline", "expired", "unhealthy"]
    warn_words = warn_words or ["pending", "warning", "degraded"]
    lowered = [str(value or "").lower() for value in statuses]
    if any(any(word in value for word in bad_words) for value in lowered):
        return "unhealthy"
    if any(any(word in value for word in warn_words) for value in lowered):
        return "degraded"
    return "healthy"


def _service(service_id, name, checked_at, resources=None, health="healthy", detail=None, region=None):
    resources = resources or []
    return {
        "provider": "aws",
        "id": service_id,
        "name": name,
        "health": health,
        "resourceCount": len(resources),
        "region": region,
        "lastUpdatedAt": _latest(resources),
        "lastCheckedAt": checked_at,
        "detail": detail,
        "resources": resources[:50],
    }


def _error_service(service_id, name, checked_at, error, region=None):
    code = "aws_error"
    if isinstance(error, ClientError):
        code = error.response.get("Error", {}).get("Code") or code
    else:
        code = type(error).__name__
    return _service(service_id, name, checked_at, [], "degraded", f"Inventory call failed: {code}.", region)


def _collect_lambda(region, checked_at):
    try:
        client = boto3.client("lambda", region_name=region)
        rows = []
        marker = None
        while True:
            args = {"MaxItems": 50}
            if marker:
                args["Marker"] = marker
            result = client.list_functions(**args)
            for item in result.get("Functions") or []:
                rows.append({
                    "name": item.get("FunctionName") or "lambda",
                    "type": "Lambda function",
                    "status": "active",
                    "region": region,
                    "lastUpdatedAt": item.get("LastModified"),
                    "detail": f"{item.get('Runtime', 'runtime unknown')} · {item.get('MemorySize', 0)} MB · timeout {item.get('Timeout', 0)}s",
                })
            marker = result.get("NextMarker")
            if not marker or len(rows) >= 100:
                break
        return _service("lambda", "Lambda", checked_at, rows, "healthy", "Serverless workers, gateways, and background functions.", region)
    except Exception as error:
        return _error_service("lambda", "Lambda", checked_at, error, region)


def _collect_sqs(region, checked_at):
    try:
        client = boto3.client("sqs", region_name=region)
        urls = client.list_queues(MaxResults=1000).get("QueueUrls") or []
        rows = []
        dlq_messages = 0
        for url in urls[:50]:
            attrs = client.get_queue_attributes(
                QueueUrl=url,
                AttributeNames=["ApproximateNumberOfMessages", "ApproximateNumberOfMessagesNotVisible", "ApproximateNumberOfMessagesDelayed", "CreatedTimestamp", "LastModifiedTimestamp"],
            ).get("Attributes") or {}
            name = url.rstrip("/").split("/")[-1]
            visible = int(attrs.get("ApproximateNumberOfMessages") or 0)
            in_flight = int(attrs.get("ApproximateNumberOfMessagesNotVisible") or 0)
            delayed = int(attrs.get("ApproximateNumberOfMessagesDelayed") or 0)
            if "dlq" in name.lower():
                dlq_messages += visible
            rows.append({
                "name": name,
                "type": "SQS queue",
                "status": "attention" if "dlq" in name.lower() and visible > 0 else "available",
                "region": region,
                "lastUpdatedAt": datetime.datetime.fromtimestamp(int(attrs.get("LastModifiedTimestamp") or attrs.get("CreatedTimestamp") or 0), tz=datetime.timezone.utc).isoformat() if (attrs.get("LastModifiedTimestamp") or attrs.get("CreatedTimestamp")) else None,
                "detail": f"{visible} visible · {in_flight} in flight · {delayed} delayed",
            })
        health = "degraded" if dlq_messages else "healthy"
        return _service("sqs", "SQS & DLQs", checked_at, rows, health, f"Durable job queues. DLQ visible messages: {dlq_messages}.", region)
    except Exception as error:
        return _error_service("sqs", "SQS & DLQs", checked_at, error, region)


def _collect_scheduler(region, checked_at):
    try:
        client = boto3.client("scheduler", region_name=region)
        rows = []
        token = None
        while True:
            args = {"MaxResults": 100}
            if token:
                args["NextToken"] = token
            result = client.list_schedules(**args)
            for item in result.get("Schedules") or []:
                rows.append({
                    "name": item.get("Name") or "schedule",
                    "type": "EventBridge Scheduler",
                    "status": item.get("State") or "UNKNOWN",
                    "region": region,
                    "lastUpdatedAt": _iso(item.get("LastModificationDate") or item.get("CreationDate")),
                    "detail": item.get("Target", {}).get("Arn") if isinstance(item.get("Target"), dict) else None,
                })
            token = result.get("NextToken")
            if not token or len(rows) >= 200:
                break
        enabled = sum(1 for item in rows if str(item.get("status")).upper() == "ENABLED")
        disabled = len(rows) - enabled
        return _service("eventbridge-scheduler", "EventBridge Scheduler", checked_at, rows, "healthy", f"{enabled} enabled · {disabled} disabled schedules.", region)
    except Exception as error:
        return _error_service("eventbridge-scheduler", "EventBridge Scheduler", checked_at, error, region)


def _collect_s3(region, checked_at):
    try:
        client = boto3.client("s3", region_name=region)
        result = client.list_buckets()
        rows = [{
            "name": item.get("Name") or "bucket",
            "type": "S3 bucket",
            "status": "available",
            "region": None,
            "lastUpdatedAt": _iso(item.get("CreationDate")),
            "detail": None,
        } for item in result.get("Buckets") or []]
        return _service("s3", "S3", checked_at, rows, "healthy", "Object storage for websites, media, backups, artifacts, and platform data.", "global")
    except Exception as error:
        return _error_service("s3", "S3", checked_at, error, "global")


def _collect_cloudfront(checked_at):
    try:
        client = boto3.client("cloudfront")
        result = client.list_distributions(MaxItems="100")
        rows = []
        for item in (result.get("DistributionList") or {}).get("Items") or []:
            rows.append({
                "name": item.get("DomainName") or item.get("Id") or "distribution",
                "type": "CloudFront distribution",
                "status": "enabled" if item.get("Enabled") else "disabled",
                "region": "global",
                "lastUpdatedAt": _iso(item.get("LastModifiedTime")),
                "detail": f"ID {item.get('Id', 'unknown')} · status {item.get('Status', 'unknown')}",
            })
        return _service("cloudfront", "CloudFront", checked_at, rows, "healthy", "CDN, customer-site delivery, caching, TLS, and SaaS tenant routing.", "global")
    except Exception as error:
        return _error_service("cloudfront", "CloudFront", checked_at, error, "global")


def _collect_ses(region, checked_at):
    try:
        client = boto3.client("sesv2", region_name=region)
        account = client.get_account()
        status = "enabled" if account.get("SendingEnabled") else "disabled"
        health = "healthy" if account.get("SendingEnabled") else "degraded"
        rows = [{
            "name": "SES account",
            "type": "SES",
            "status": status,
            "region": region,
            "lastUpdatedAt": None,
            "detail": f"Production access: {bool(account.get('ProductionAccessEnabled'))} · enforcement: {account.get('EnforcementStatus', 'unknown')}",
        }]
        return _service("ses", "SES", checked_at, rows, health, "Bulk/background outbound email delivery.", region)
    except Exception as error:
        return _error_service("ses", "SES", checked_at, error, region)


def _collect_cloudwatch(region, checked_at):
    try:
        client = boto3.client("cloudwatch", region_name=region)
        result = client.describe_alarms(MaxRecords=100)
        rows = []
        alarm_count = 0
        for alarm in result.get("MetricAlarms") or []:
            state = alarm.get("StateValue") or "UNKNOWN"
            if state == "ALARM":
                alarm_count += 1
            rows.append({
                "name": alarm.get("AlarmName") or "alarm",
                "type": "CloudWatch alarm",
                "status": state,
                "region": region,
                "lastUpdatedAt": _iso(alarm.get("StateUpdatedTimestamp") or alarm.get("AlarmConfigurationUpdatedTimestamp")),
                "detail": alarm.get("StateReason"),
            })
        health = "degraded" if alarm_count else "healthy"
        return _service("cloudwatch", "CloudWatch", checked_at, rows, health, f"{alarm_count} alarm(s) currently in ALARM state.", region)
    except Exception as error:
        return _error_service("cloudwatch", "CloudWatch", checked_at, error, region)


def _collect_secrets(region, checked_at):
    try:
        client = boto3.client("secretsmanager", region_name=region)
        rows = []
        token = None
        while True:
            args = {"MaxResults": 100, "IncludePlannedDeletion": False}
            if token:
                args["NextToken"] = token
            result = client.list_secrets(**args)
            for item in result.get("SecretList") or []:
                rows.append({
                    "name": item.get("Name") or "secret",
                    "type": "Secrets Manager secret",
                    "status": "configured",
                    "region": region,
                    "lastUpdatedAt": _iso(item.get("LastChangedDate") or item.get("CreatedDate")),
                    "detail": "Secret value is intentionally not returned.",
                })
            token = result.get("NextToken")
            if not token or len(rows) >= 200:
                break
        return _service("secrets-manager", "Secrets Manager", checked_at, rows, "healthy", "Secret metadata only; values are never exposed by infrastructure telemetry.", region)
    except Exception as error:
        return _error_service("secrets-manager", "Secrets Manager", checked_at, error, region)


def _collect_route53(checked_at):
    try:
        client = boto3.client("route53")
        result = client.list_hosted_zones(MaxItems="100")
        rows = [{
            "name": item.get("Name") or item.get("Id") or "hosted zone",
            "type": "Route 53 hosted zone",
            "status": "private" if (item.get("Config") or {}).get("PrivateZone") else "public",
            "region": "global",
            "lastUpdatedAt": None,
            "detail": f"{item.get('ResourceRecordSetCount', 0)} record sets",
        } for item in result.get("HostedZones") or []]
        return _service("route53", "Route 53", checked_at, rows, "healthy", "TheOutHaven-controlled DNS zones where Route 53 is authoritative.", "global")
    except Exception as error:
        return _error_service("route53", "Route 53", checked_at, error, "global")


def _collect_acm(region, checked_at):
    try:
        client = boto3.client("acm", region_name=region)
        result = client.list_certificates(MaxItems=100, CertificateStatuses=["PENDING_VALIDATION", "ISSUED", "INACTIVE", "EXPIRED", "VALIDATION_TIMED_OUT", "REVOKED", "FAILED"])
        rows = []
        attention = 0
        now = datetime.datetime.now(datetime.timezone.utc)
        for item in result.get("CertificateSummaryList") or []:
            status = item.get("Status") or "UNKNOWN"
            not_after = item.get("NotAfter")
            expiring = isinstance(not_after, datetime.datetime) and (not_after - now).days <= 30
            if status != "ISSUED" or expiring:
                attention += 1
            rows.append({
                "name": item.get("DomainName") or item.get("CertificateArn") or "certificate",
                "type": "ACM certificate",
                "status": "expiring" if expiring and status == "ISSUED" else status,
                "region": region,
                "lastUpdatedAt": _iso(item.get("CreatedAt") or item.get("IssuedAt")),
                "detail": f"Expires {_iso(not_after) or 'unknown'}",
            })
        return _service("acm", "ACM Certificates", checked_at, rows, "degraded" if attention else "healthy", f"{attention} certificate(s) require attention.", region)
    except Exception as error:
        return _error_service("acm", "ACM Certificates", checked_at, error, region)


def _collect_lightsail(region, checked_at):
    try:
        client = boto3.client("lightsail", region_name=region)
        result = client.get_instances()
        rows = []
        bad = 0
        for item in result.get("instances") or []:
            state = (item.get("state") or {}).get("name") or "unknown"
            if state != "running":
                bad += 1
            rows.append({
                "name": item.get("name") or "instance",
                "type": "Lightsail instance",
                "status": state,
                "region": item.get("location", {}).get("regionName") or region,
                "lastUpdatedAt": _iso(item.get("createdAt")),
                "detail": f"{item.get('blueprintName', 'blueprint unknown')} · {item.get('bundleId', 'bundle unknown')} · {item.get('publicIpAddress', 'no public IP')}",
            })
        return _service("lightsail", "Lightsail", checked_at, rows, "degraded" if bad else "healthy", "Legacy/current customer-site hosting and failover capacity.", region)
    except Exception as error:
        return _error_service("lightsail", "Lightsail", checked_at, error, region)


def _collect_dynamodb(region, checked_at):
    try:
        client = boto3.client("dynamodb", region_name=region)
        names = client.list_tables(Limit=100).get("TableNames") or []
        rows = [{"name": name, "type": "DynamoDB table", "status": "available", "region": region, "lastUpdatedAt": None, "detail": None} for name in names]
        return _service("dynamodb", "DynamoDB", checked_at, rows, "healthy", "Idempotency and operational ledgers.", region)
    except Exception as error:
        return _error_service("dynamodb", "DynamoDB", checked_at, error, region)


def _collect_ecs(region, checked_at):
    try:
        client = boto3.client("ecs", region_name=region)
        arns = client.list_clusters(maxResults=100).get("clusterArns") or []
        details = client.describe_clusters(clusters=arns, include=["STATISTICS", "TAGS"]).get("clusters") if arns else []
        rows = []
        bad = 0
        for item in details or []:
            status = item.get("status") or "UNKNOWN"
            if status != "ACTIVE":
                bad += 1
            rows.append({
                "name": item.get("clusterName") or item.get("clusterArn") or "cluster",
                "type": "ECS cluster",
                "status": status,
                "region": region,
                "lastUpdatedAt": None,
                "detail": f"{item.get('runningTasksCount', 0)} running · {item.get('pendingTasksCount', 0)} pending tasks",
            })
        return _service("ecs-fargate", "ECS / Fargate", checked_at, rows, "degraded" if bad else "healthy", "Long-running/heavy workers when Lambda is not appropriate.", region)
    except Exception as error:
        return _error_service("ecs-fargate", "ECS / Fargate", checked_at, error, region)


def _collect_cloudformation(region, checked_at):
    try:
        client = boto3.client("cloudformation", region_name=region)
        result = client.describe_stacks()
        rows = []
        bad = 0
        for item in result.get("Stacks") or []:
            name = item.get("StackName") or "stack"
            if "toh" not in name.lower() and "theouthaven" not in name.lower():
                continue
            status = item.get("StackStatus") or "UNKNOWN"
            if "FAILED" in status or "ROLLBACK" in status and "COMPLETE" not in status:
                bad += 1
            rows.append({
                "name": name,
                "type": "CloudFormation stack",
                "status": status,
                "region": region,
                "lastUpdatedAt": _iso(item.get("LastUpdatedTime") or item.get("CreationTime")),
                "detail": item.get("Description"),
            })
        return _service("cloudformation", "CloudFormation", checked_at, rows, "degraded" if bad else "healthy", "Infrastructure-as-code deployment stacks for TheOutHaven AWS resources.", region)
    except Exception as error:
        return _error_service("cloudformation", "CloudFormation", checked_at, error, region)


def _collect_api_gateway(region, checked_at):
    try:
        client = boto3.client("apigatewayv2", region_name=region)
        result = client.get_apis(MaxResults="100")
        rows = [{
            "name": item.get("Name") or item.get("ApiId") or "api",
            "type": "API Gateway v2",
            "status": "available",
            "region": region,
            "lastUpdatedAt": _iso(item.get("CreatedDate")),
            "detail": f"{item.get('ProtocolType', 'protocol unknown')} · {item.get('ApiEndpoint', 'endpoint unavailable')}",
        } for item in result.get("Items") or []]
        return _service("api-gateway", "API Gateway", checked_at, rows, "healthy", "Managed HTTP/WebSocket APIs present in the AWS account.", region)
    except Exception as error:
        return _error_service("api-gateway", "API Gateway", checked_at, error, region)


def _collect_ecr(region, checked_at):
    try:
        client = boto3.client("ecr", region_name=region)
        result = client.describe_repositories(maxResults=100)
        rows = [{
            "name": item.get("repositoryName") or "repository",
            "type": "ECR repository",
            "status": "available",
            "region": region,
            "lastUpdatedAt": _iso(item.get("createdAt")),
            "detail": item.get("repositoryUri"),
        } for item in result.get("repositories") or []]
        return _service("ecr", "ECR", checked_at, rows, "healthy", "Container image repositories used by AWS workloads.", region)
    except Exception as error:
        return _error_service("ecr", "ECR", checked_at, error, region)


def build_aws_infrastructure_overview(region="us-east-1"):
    checked_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
    identity = boto3.client("sts", region_name=region).get_caller_identity()
    services = [
        _collect_lambda(region, checked_at),
        _collect_sqs(region, checked_at),
        _collect_scheduler(region, checked_at),
        _collect_s3(region, checked_at),
        _collect_cloudfront(checked_at),
        _collect_ses(region, checked_at),
        _collect_cloudwatch(region, checked_at),
        _collect_secrets(region, checked_at),
        _collect_route53(checked_at),
        _collect_acm(region, checked_at),
        _collect_lightsail(region, checked_at),
        _collect_dynamodb(region, checked_at),
        _collect_ecs(region, checked_at),
        _collect_cloudformation(region, checked_at),
        _collect_api_gateway(region, checked_at),
        _collect_ecr(region, checked_at),
    ]
    health = "unhealthy" if any(item.get("health") == "unhealthy" for item in services) else "degraded" if any(item.get("health") == "degraded" for item in services) else "healthy"
    return {
        "ok": True,
        "checkedAt": checked_at,
        "accountId": identity.get("Account"),
        "region": region,
        "health": health,
        "detail": "Live read-only inventory from the TheOutHaven AWS platform gateway. No secret values are returned.",
        "services": services,
    }
