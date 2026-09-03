"""SES fallback overlay for the TheOutHaven Integration API email endpoint.

The Integration API keeps its existing /v1/resend/emails/send compatibility route.
When a valid Resend credential exists, the original provider path remains authoritative.
When Resend is not configured, this overlay sends through Amazon SES v2.

If SES is still in sandbox, the overlay fails closed for non-TheOutHaven recipients.
That lets internal operational reports use the verified TheOutHaven domain without
accidentally treating sandbox SES as a production-wide customer email provider.
"""

from __future__ import annotations

import os
import re

import boto3
from botocore.exceptions import ClientError

ALLOWED_FROM_DOMAIN = os.environ.get("SES_ALLOWED_FROM_DOMAIN", "theouthaven.com").strip().lower()
ALLOWED_SANDBOX_RECIPIENT_DOMAIN = os.environ.get(
    "SES_ALLOWED_SANDBOX_RECIPIENT_DOMAIN",
    "theouthaven.com",
).strip().lower()
SES_CONFIGURATION_SET = os.environ.get(
    "SES_CONFIGURATION_SET",
    f"toh-{os.environ.get('ENVIRONMENT', 'production')}",
).strip()
SES_REGION = os.environ.get("AWS_REGION", "us-east-1")
SES_SANDBOX_MODE = os.environ.get("SES_SANDBOX_MODE", "true").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}

_EMAIL_RE = re.compile(r"^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$")
_ses = boto3.client("sesv2", region_name=SES_REGION)


def _extract_email(value: object) -> str:
    text = str(value or "").strip()
    if "<" in text and text.endswith(">"):
        text = text.rsplit("<", 1)[1][:-1].strip()
    return text.lower()


def _valid_resend_key(value: object) -> bool:
    text = str(value or "").strip()
    if len(text) < 16:
        return False
    return text.lower() not in {"placeholder", "changeme", "not-configured", "resend_api_key"}


def _sandbox_recipient_allowed(value: str) -> bool:
    email = _extract_email(value)
    if "@" not in email:
        return False
    return email.rsplit("@", 1)[1] == ALLOWED_SANDBOX_RECIPIENT_DOMAIN


def install(namespace: dict) -> None:
    original_resend_send = namespace["resend_send"]
    runtime_value = namespace["runtime_value"]
    normalize_email_list = namespace["normalize_email_list"]
    email_re = namespace.get("EMAIL_RE", _EMAIL_RE)

    def ses_send(payload: dict):
        sender = str(payload.get("from") or "").strip()
        sender_email = _extract_email(sender)
        subject = str(payload.get("subject") or "").strip()
        html = payload.get("html")
        text = payload.get("text")

        if not sender or len(sender) > 500 or not email_re.fullmatch(sender_email):
            raise ValueError("email_from_invalid")
        if not sender_email.endswith(f"@{ALLOWED_FROM_DOMAIN}"):
            raise ValueError("email_from_domain_not_allowed")
        if not subject or len(subject) > 998:
            raise ValueError("email_subject_invalid")
        if html is None and text is None:
            raise ValueError("email_body_required")
        if isinstance(html, str) and len(html.encode("utf-8")) > 1_500_000:
            raise ValueError("email_html_too_large")
        if isinstance(text, str) and len(text.encode("utf-8")) > 500_000:
            raise ValueError("email_text_too_large")

        to = normalize_email_list(payload.get("to"), "to")
        cc = normalize_email_list(payload.get("cc") or [], "cc")
        bcc = normalize_email_list(payload.get("bcc") or [], "bcc")
        all_recipients = [*to, *cc, *bcc]
        if SES_SANDBOX_MODE and not all(
            _sandbox_recipient_allowed(value) for value in all_recipients
        ):
            raise ValueError("ses_sandbox_recipient_not_verified")

        destination = {"ToAddresses": to}
        if cc:
            destination["CcAddresses"] = cc
        if bcc:
            destination["BccAddresses"] = bcc

        body = {}
        if html is not None:
            body["Html"] = {"Data": str(html), "Charset": "UTF-8"}
        if text is not None:
            body["Text"] = {"Data": str(text), "Charset": "UTF-8"}

        reply_to = str(payload.get("replyTo") or payload.get("reply_to") or "").strip()
        reply_to_addresses = []
        if reply_to:
            if len(reply_to) > 320 or not email_re.fullmatch(reply_to):
                raise ValueError("email_reply_to_invalid")
            reply_to_addresses = [reply_to]

        request = {
            "FromEmailAddress": sender,
            "Destination": destination,
            "Content": {
                "Simple": {
                    "Subject": {"Data": subject, "Charset": "UTF-8"},
                    "Body": body,
                }
            },
        }
        if reply_to_addresses:
            request["ReplyToAddresses"] = reply_to_addresses
        if SES_CONFIGURATION_SET:
            request["ConfigurationSetName"] = SES_CONFIGURATION_SET

        try:
            result = _ses.send_email(**request)
        except ClientError as exc:
            code = str(exc.response.get("Error", {}).get("Code") or "ses_send_failed")
            raise RuntimeError(f"ses_send_failed:{code}") from exc
        except Exception as exc:
            raise RuntimeError("ses_unavailable") from exc

        return {"ok": True, "provider": "ses", "id": result.get("MessageId")}

    def provider_send(payload: dict):
        # Do not fall back after a valid Resend request is attempted: an upstream
        # timeout can be ambiguous and retrying through SES could duplicate mail.
        if _valid_resend_key(runtime_value("RESEND_API_KEY")):
            return original_resend_send(payload)
        return ses_send(payload)

    namespace["resend_send"] = provider_send
