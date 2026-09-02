from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def read(path: str) -> str:
    return (ROOT / path).read_text()


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content)


def replace_once(path: str, old: str, new: str) -> None:
    content = read(path)
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one match, found {count}: {old[:120]!r}")
    write(path, content.replace(old, new, 1))


# AWS: preserve known purchase details by avoiding optional label work when the
# Lambda is close to its execution deadline.
platform = "infra/aws/lambda/platform_integration_api.py"
replace_once(
    platform,
    "def stamps_production_postcard_proof(payload):\n",
    "def stamps_production_postcard_proof(payload, context=None):\n",
)
replace_once(
    platform,
    '''    if label_url:\n        try:\n            label_png_base64 = _stamps_download_label_png(label_url)\n        except Exception as exc:\n            warning = _stamps_clean(exc)\n            label_warning = warning if re.fullmatch(r"stamps_[a-z0-9_]+", warning) else "stamps_label_unavailable"\n    else:\n        label_warning = "stamps_label_url_missing"\n''',
    '''    if label_url:\n        remaining_ms = None\n        if context is not None and hasattr(context, "get_remaining_time_in_millis"):\n            try:\n                remaining_ms = int(context.get_remaining_time_in_millis())\n            except Exception:\n                remaining_ms = None\n        if remaining_ms is not None and remaining_ms < 15_000:\n            # The USPS indicium is already purchased. Return the known transaction\n            # immediately instead of risking a Lambda timeout during optional image IO.\n            label_warning = "stamps_label_download_deferred"\n        else:\n            try:\n                label_png_base64 = _stamps_download_label_png(label_url)\n            except Exception as exc:\n                warning = _stamps_clean(exc)\n                label_warning = warning if re.fullmatch(r"stamps_[a-z0-9_]+", warning) else "stamps_label_unavailable"\n    else:\n        label_warning = "stamps_label_url_missing"\n''',
)
replace_once(
    platform,
    "            return response(200, stamps_production_postcard_proof(parse_json(body)))\n",
    "            return response(200, stamps_production_postcard_proof(parse_json(body), context=context))\n",
)

# Give AWS enough total time for a cold WSDL + SOAP chain while keeping the
# Vercel caller's explicit duration above the AWS deadline.
replace_once("infra/aws/cloudformation/integration-api.yml", "      Timeout: 55\n", "      Timeout: 80\n")
replace_once("lib/aws/integration-api.ts", "    65_000,\n", "    90_000,\n")

route = "app/api/admin/mailing-batches/[id]/postage/production-proof/route.ts"
replace_once(
    route,
    'export const dynamic = "force-dynamic";\n',
    'export const dynamic = "force-dynamic";\nexport const maxDuration = 120;\n',
)
replace_once(
    route,
    '    stamps_label_not_png: "Live postage was purchased, but Stamps.com did not return the requested PNG image.",\n',
    '    stamps_label_not_png: "Live postage was purchased, but Stamps.com did not return the requested PNG image.",\n    stamps_label_download_deferred: "Live postage was purchased and recorded, but AWS skipped optional label download to return the known transaction before its execution deadline.",\n',
)
replace_once(
    route,
    '''    const { error: purchaseUpdateError } = await supabaseAdmin\n      .from("mailing_batch_items")\n      .update({\n        stamps_tx_id: proof.stampsTxId,\n        stamps_postage_status: "purchased",\n        stamps_postage_amount: proof.amount,\n        stamps_postage_ship_date: proof.shipDate,\n        stamps_postage_purchased_at: purchasedAt,\n        stamps_postage_error: null,\n      })\n      .eq("id", item.id)\n      .eq("stamps_integrator_tx_id", integratorTxId);\n    if (purchaseUpdateError) {\n      console.error("Live Stamps postage purchased in AWS but transaction persistence failed", {\n        itemId: item.id,\n        integratorTxId,\n        message: purchaseUpdateError.message,\n      });\n''',
    '''    const { data: purchaseUpdated, error: purchaseUpdateError } = await supabaseAdmin\n      .from("mailing_batch_items")\n      .update({\n        stamps_tx_id: proof.stampsTxId,\n        stamps_postage_status: "purchased",\n        stamps_postage_amount: proof.amount,\n        stamps_postage_ship_date: proof.shipDate,\n        stamps_postage_purchased_at: purchasedAt,\n        stamps_postage_error: null,\n      })\n      .eq("id", item.id)\n      .eq("stamps_integrator_tx_id", integratorTxId)\n      .select("id")\n      .maybeSingle();\n    if (purchaseUpdateError || !purchaseUpdated) {\n      console.error("Live Stamps postage purchased in AWS but transaction persistence failed", {\n        itemId: item.id,\n        integratorTxId,\n        message: purchaseUpdateError?.message || "reserved transaction row was not updated",\n      });\n''',
)

# Printing is only allowed when both provider transaction identifiers made it
# into the same persisted purchased row.
print_page = "app/admin/dashboard/operations/mailing-batches/[id]/print/page.tsx"
replace_once(
    print_page,
    '''    if (!purchaseRow || purchaseRow.stamps_postage_status !== "purchased" || !purchaseRow.stamps_postage_purchased_at) {\n''',
    '''    if (\n      !purchaseRow\n      || purchaseRow.stamps_postage_status !== "purchased"\n      || !purchaseRow.stamps_postage_purchased_at\n      || !purchaseRow.stamps_integrator_tx_id\n      || !purchaseRow.stamps_tx_id\n    ) {\n''',
)

# Keep the permanent verifier aligned with the stronger boundary.
verifier = "scripts/dev/verify_stamps_aws_boundary.py"
content = read(verifier)
content = content.replace(
    "assert 'stamps_live_purchases_disabled' in platform\n",
    "assert 'stamps_live_purchases_disabled' in platform\nassert 'stamps_label_download_deferred' in platform\nassert 'get_remaining_time_in_millis' in platform\n",
    1,
)
content = content.replace(
    "assert 'stamps_postage_status !== \"purchased\"' in print_page\n",
    "assert 'stamps_postage_status !== \"purchased\"' in print_page\nassert '!purchaseRow.stamps_integrator_tx_id' in print_page\nassert '!purchaseRow.stamps_tx_id' in print_page\n",
    1,
)
write(verifier, content)

safety_note = "docs/stamps-production-safety-note.md"
note = read(safety_note)
if "execution deadline" not in note:
    note = note.replace(
        "- A known purchase is persisted before indicium image processing.\n",
        "- A known purchase is persisted before indicium image processing.\n- If Lambda time is running low after purchase, AWS returns the known transaction and defers optional label download instead of risking an ambiguous function timeout.\n",
        1,
    )
write(safety_note, note)

# Final deterministic assertions.
platform_text = read(platform)
route_text = read(route)
print_text = read(print_page)
assert platform_text.count('"CreateMailingLabelIndicia"') == 1
assert "stamps_label_download_deferred" in platform_text
assert "context=context" in platform_text
assert "export const maxDuration = 120;" in route_text
assert ".select(\"id\")\n      .maybeSingle();" in route_text
assert "!purchaseRow.stamps_integrator_tx_id" in print_text
assert "!purchaseRow.stamps_tx_id" in print_text
print("Hardened Stamps post-purchase response and print transaction gate")
