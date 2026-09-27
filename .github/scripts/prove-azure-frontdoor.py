#!/usr/bin/env python3
import argparse
import http.client
import json
import ssl
import sys
import time
from urllib.parse import urlencode

def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--host", required=True)
    p.add_argument("--sha", required=True)
    p.add_argument("--roles", required=True, help="Comma-separated allowed regionRole values")
    p.add_argument("--attempts", type=int, default=30)
    p.add_argument("--interval", type=int, default=10)
    p.add_argument("--timeout", type=int, default=20)
    p.add_argument("--label", default="endpoint")
    return p.parse_args()

def attempt(host, sha, allowed_roles, timeout, attempt_no):
    query = urlencode({"proof_sha": sha, "proof_attempt": attempt_no, "proof_ts": int(time.time())})
    path = f"/api/health/azure?{query}"
    conn = http.client.HTTPSConnection(host, timeout=timeout, context=ssl.create_default_context())
    try:
        conn.request(
            "GET",
            path,
            headers={
                "Accept": "application/json",
                "Cache-Control": "no-cache, no-store, max-age=0",
                "Pragma": "no-cache",
                "User-Agent": "TheOutHaven-Azure-Production-Proof/1.0",
                "Connection": "close",
            },
        )
        resp = conn.getresponse()
        body_bytes = resp.read()
        headers = {k.lower(): v.strip() for k, v in resp.getheaders()}
    finally:
        conn.close()

    body_text = body_bytes.decode("utf-8", errors="replace")
    content_type = headers.get("content-type", "")
    header_revision = headers.get("x-theouthaven-health-revision", "")
    header_role = headers.get("x-theouthaven-region-role", "")

    diagnostics = {
        "status": resp.status,
        "content_type": content_type,
        "header_revision": header_revision,
        "header_role": header_role,
        "body": body_text[:1000],
    }

    if resp.status != 200:
        return False, f"HTTP {resp.status}", diagnostics
    if not content_type.lower().startswith("application/json"):
        return False, f"unexpected Content-Type {content_type!r}", diagnostics
    if header_revision != sha:
        return False, f"header revision {header_revision!r} != {sha!r}", diagnostics
    if header_role not in allowed_roles:
        return False, f"header role {header_role!r} not in {sorted(allowed_roles)!r}", diagnostics

    try:
        payload = json.loads(body_text)
    except json.JSONDecodeError as exc:
        return False, f"invalid JSON: {exc}", diagnostics

    if payload.get("ok") is not True:
        return False, "payload ok is not true", diagnostics
    if payload.get("revision") != sha:
        return False, f"payload revision {payload.get('revision')!r} != {sha!r}", diagnostics
    if payload.get("regionRole") not in allowed_roles:
        return False, f"payload regionRole {payload.get('regionRole')!r} not in {sorted(allowed_roles)!r}", diagnostics
    if payload.get("regionRole") != header_role:
        return False, "header/body regionRole mismatch", diagnostics

    return True, payload.get("regionRole"), diagnostics

def main():
    args = parse_args()
    allowed_roles = {r.strip() for r in args.roles.split(",") if r.strip()}
    if not allowed_roles:
        print("::error::No allowed region roles supplied.", file=sys.stderr)
        return 2

    last_reason = "no attempt completed"
    last_diag = {}
    for attempt_no in range(1, args.attempts + 1):
        try:
            ok, detail, diag = attempt(
                args.host,
                args.sha,
                allowed_roles,
                args.timeout,
                attempt_no,
            )
        except Exception as exc:
            ok = False
            detail = f"{type(exc).__name__}: {exc}"
            diag = {}

        if ok:
            print(
                f"{args.label} proof passed on attempt {attempt_no}: "
                f"HTTP 200, SHA {args.sha}, region {detail}"
            )
            return 0

        last_reason = detail
        last_diag = diag
        if attempt_no < args.attempts:
            time.sleep(args.interval)

    print(
        f"::error::{args.label} proof failed after {args.attempts} attempts: {last_reason}",
        file=sys.stderr,
    )
    if last_diag:
        print(json.dumps(last_diag, ensure_ascii=False, indent=2), file=sys.stderr)
    return 1

if __name__ == "__main__":
    raise SystemExit(main())
