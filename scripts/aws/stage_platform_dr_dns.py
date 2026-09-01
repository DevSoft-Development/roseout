#!/usr/bin/env python3
"""Build an exact, fail-closed Route53 staging batch from the current Vercel DNS zone.

This script deliberately stages only simple records. It never creates failover routing
policies and refuses to overwrite a Route53 zone that already contains SetIdentifier
records. The final PRIMARY/SECONDARY conversion remains owned by aws-platform-dr.yml.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

SUPPORTED_TYPES = {"A", "AAAA", "CNAME", "MX", "TXT", "CAA"}


def fqdn(name: str, domain: str) -> str:
    name = (name or "").strip()
    domain = domain.rstrip(".")
    if name in ("", "@"):
        return f"{domain}."
    if name.endswith("."):
        return name
    if name == domain or name.endswith(f".{domain}"):
        return f"{name}."
    return f"{name}.{domain}."


def dns_target(value: str) -> str:
    value = value.strip()
    if not value or value.endswith("."):
        return value
    return f"{value}."


def txt_value(value: str) -> str:
    # Route53 TXT strings are limited to 255 characters per quoted segment.
    chunks = [value[i : i + 255] for i in range(0, len(value), 255)] or [""]
    escaped = []
    for chunk in chunks:
        chunk = chunk.replace("\\", "\\\\").replace('"', '\\"')
        escaped.append(f'"{chunk}"')
    return " ".join(escaped)


def mx_value(record: dict[str, Any]) -> str:
    raw = str(record.get("value") or "").strip()
    if re.match(r"^\d+\s+", raw):
        priority, target = raw.split(None, 1)
        return f"{priority} {dns_target(target)}"
    priority = record.get("mxPriority", record.get("priority"))
    if priority is None:
        raise ValueError(f"MX record {record.get('name')!r} is missing priority")
    return f"{int(priority)} {dns_target(raw)}"


def route53_value(record: dict[str, Any]) -> str:
    typ = str(record.get("type") or "").upper()
    raw = str(record.get("value") or "")
    if typ == "TXT":
        return txt_value(raw)
    if typ == "MX":
        return mx_value(record)
    if typ == "CNAME":
        return dns_target(raw)
    return raw.strip()


def recommended_apex_ipv4(apex_config: dict[str, Any]) -> list[str]:
    candidates = apex_config.get("recommendedIPv4") or []
    ranked = sorted(candidates, key=lambda item: int(item.get("rank", 999)))
    for item in ranked:
        values = [str(v).strip() for v in item.get("value") or [] if str(v).strip()]
        if values:
            return values
    raise ValueError("Vercel did not provide a recommended apex IPv4 target")


def build_expected(
    vercel_records: dict[str, Any], apex_config: dict[str, Any], domain: str
) -> list[dict[str, Any]]:
    grouped: dict[tuple[str, str], dict[str, Any]] = {}
    aliases: list[dict[str, Any]] = []

    for record in vercel_records.get("records") or []:
        typ = str(record.get("type") or "").upper()
        name = str(record.get("name") or "")
        if typ == "ALIAS":
            aliases.append(record)
            continue
        if typ not in SUPPORTED_TYPES:
            raise ValueError(f"Unsupported Vercel DNS type {typ!r} for {name!r}")

        key = (fqdn(name, domain), typ)
        ttl = max(1, int(record.get("ttl") or 60))
        value = route53_value(record)
        if not value:
            raise ValueError(f"Empty {typ} value for {name!r}")
        bucket = grouped.setdefault(key, {"ttls": [], "values": []})
        bucket["ttls"].append(ttl)
        if value not in bucket["values"]:
            bucket["values"].append(value)

    apex_alias = [r for r in aliases if str(r.get("name") or "") in ("", "@")]
    wildcard_alias = [r for r in aliases if str(r.get("name") or "") == "*"]
    unexpected_aliases = [
        r
        for r in aliases
        if str(r.get("name") or "") not in ("", "@", "*")
    ]
    if unexpected_aliases:
        names = ", ".join(sorted({str(r.get("name") or "") for r in unexpected_aliases}))
        raise ValueError(f"Unsupported Vercel ALIAS record(s): {names}")
    if len(apex_alias) != 1:
        raise ValueError(f"Expected exactly one apex Vercel ALIAS record; found {len(apex_alias)}")

    apex_key = (fqdn("", domain), "A")
    if apex_key in grouped:
        raise ValueError("Apex has both explicit A and Vercel ALIAS records; refusing ambiguous conversion")
    grouped[apex_key] = {
        "ttls": [60],
        "values": recommended_apex_ipv4(apex_config),
    }

    if wildcard_alias and (fqdn("*", domain), "A") not in grouped:
        raise ValueError("Wildcard Vercel ALIAS exists without an explicit wildcard A record")

    www_key = (fqdn("www", domain), "CNAME")
    if www_key not in grouped:
        raise ValueError("Missing required www CNAME record")

    expected: list[dict[str, Any]] = []
    for (name, typ), bucket in sorted(grouped.items()):
        values = sorted(bucket["values"])
        if typ == "CNAME" and len(values) != 1:
            raise ValueError(f"CNAME {name} has {len(values)} values")
        expected.append(
            {
                "Name": name,
                "Type": typ,
                # Route53 has one TTL per RRset. When Vercel stores values with
                # different TTLs, use the shortest source TTL to avoid extending cache life.
                "TTL": min(bucket["ttls"]),
                "ResourceRecords": [{"Value": value} for value in values],
            }
        )
    return expected


def canonical(record: dict[str, Any]) -> tuple[str, str, int, tuple[str, ...]]:
    return (
        str(record["Name"]).lower(),
        str(record["Type"]).upper(),
        int(record.get("TTL") or 0),
        tuple(sorted(str(v["Value"]) for v in record.get("ResourceRecords") or [])),
    )


def build_change_batch(
    expected: list[dict[str, Any]], current: dict[str, Any] | None
) -> dict[str, Any]:
    expected_by_key = {(r["Name"].lower(), r["Type"]): r for r in expected}
    changes: list[dict[str, Any]] = []

    if current:
        current_rows = current.get("ResourceRecordSets") or []
        managed = [r for r in current_rows if r.get("Type") not in ("NS", "SOA")]
        routed = [r for r in managed if r.get("SetIdentifier")]
        if routed:
            raise ValueError(
                "Route53 zone already contains routing-policy records; DNS staging refuses to overwrite live failover state"
            )
        for row in managed:
            key = (str(row.get("Name") or "").lower(), str(row.get("Type") or ""))
            if key not in expected_by_key:
                changes.append({"Action": "DELETE", "ResourceRecordSet": row})

    for row in expected:
        changes.append({"Action": "UPSERT", "ResourceRecordSet": row})

    return {
        "Comment": "Stage TheOutHaven Vercel DNS zone in Route53 before authoritative delegation",
        "Changes": changes,
    }


def load(path: str | None) -> dict[str, Any] | None:
    if not path:
        return None
    return json.loads(Path(path).read_text())


def self_test() -> None:
    source = {
        "records": [
            {"name": "", "type": "ALIAS", "value": "internal.vercel", "ttl": 60},
            {"name": "www", "type": "CNAME", "value": "cname.vercel-dns-016.com.", "ttl": 60},
            {"name": "*", "type": "A", "value": "34.205.242.37", "ttl": 60},
            {"name": "*", "type": "ALIAS", "value": "internal.vercel", "ttl": 60},
            {"name": "send", "type": "MX", "value": "smtp.example.com", "mxPriority": 10, "ttl": 3600},
            {"name": "", "type": "TXT", "value": "one", "ttl": 3600},
            {"name": "", "type": "TXT", "value": "two", "ttl": 60},
            {"name": "", "type": "CAA", "value": '0 issue "letsencrypt.org"', "ttl": 60},
        ]
    }
    config = {
        "recommendedIPv4": [
            {"rank": 2, "value": ["76.76.21.21"]},
            {"rank": 1, "value": ["216.150.1.1", "216.150.16.1"]},
        ]
    }
    current = {
        "ResourceRecordSets": [
            {"Name": "theouthaven.com.", "Type": "NS", "TTL": 172800, "ResourceRecords": [{"Value": "ns.example."}]},
            {"Name": "stale.theouthaven.com.", "Type": "A", "TTL": 60, "ResourceRecords": [{"Value": "192.0.2.1"}]},
        ]
    }
    expected = build_expected(source, config, "theouthaven.com")
    by_key = {(r["Name"], r["Type"]): r for r in expected}
    assert [v["Value"] for v in by_key[("theouthaven.com.", "A")]["ResourceRecords"]] == ["216.150.1.1", "216.150.16.1"]
    assert by_key[("*.theouthaven.com.", "A")]["ResourceRecords"] == [{"Value": "34.205.242.37"}]
    assert by_key[("theouthaven.com.", "TXT")]["TTL"] == 60
    assert by_key[("send.theouthaven.com.", "MX")]["ResourceRecords"] == [{"Value": "10 smtp.example.com."}]
    batch = build_change_batch(expected, current)
    assert any(c["Action"] == "DELETE" and c["ResourceRecordSet"]["Name"] == "stale.theouthaven.com." for c in batch["Changes"])
    print("stage_platform_dr_dns self-test: ok")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--vercel-records")
    parser.add_argument("--apex-config")
    parser.add_argument("--current-route53")
    parser.add_argument("--domain")
    parser.add_argument("--out-batch")
    parser.add_argument("--out-expected")
    args = parser.parse_args()

    if args.self_test:
        self_test()
        return 0

    required = [args.vercel_records, args.apex_config, args.domain, args.out_batch, args.out_expected]
    if any(not item for item in required):
        parser.error("--vercel-records, --apex-config, --domain, --out-batch, and --out-expected are required")

    try:
        source = load(args.vercel_records) or {}
        apex = load(args.apex_config) or {}
        current = load(args.current_route53)
        expected = build_expected(source, apex, args.domain)
        batch = build_change_batch(expected, current)
    except (ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
        print(f"DNS staging refused: {exc}", file=sys.stderr)
        return 2

    Path(args.out_batch).write_text(json.dumps(batch, separators=(",", ":")))
    Path(args.out_expected).write_text(json.dumps({"ResourceRecordSets": expected}, separators=(",", ":")))
    print(f"Prepared {len(expected)} Route53 RRsets and {len(batch['Changes'])} changes.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
