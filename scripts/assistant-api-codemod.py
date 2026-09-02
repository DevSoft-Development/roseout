from pathlib import Path
import re


def read(path):
    return Path(path).read_text()


def write(path, value):
    Path(path).write_text(value)


def must_replace(text, old, new, label):
    if old not in text:
        raise SystemExit(f"missing expected source for {label}")
    return text.replace(old, new, 1)


def must_sub(text, pattern, replacement, label, flags=0):
    value, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f"expected one replacement for {label}, got {count}")
    return value

# Edge create-search
path = "supabase/functions/create-search/index.ts"
s = read(path)
s = must_replace(
    s,
    '} from "../_shared/logger.ts";\n',
    '} from "../_shared/logger.ts";\nimport { openAiViaAssistantApi, platformAssistantApiConfigured } from "../_shared/aws-assistant.ts";\n',
    "create-search import",
)
s = must_replace(s, '  const apiKey = Deno.env.get("OPENAI_API_KEY");\n', '', "create-search provider key")
s = must_replace(s, '  if (!apiKey)\n', '  if (!platformAssistantApiConfigured())\n', "create-search availability")
pattern = r'''    const res = await fetch\("https://api\.openai\.com/v1/chat/completions", \{\n      method: "POST",\n      headers: \{\n        Authorization: `Bearer \$\{apiKey\}`,\n        "Content-Type": "application/json",\n      \},\n      body: JSON\.stringify\(\{\n        model,\n        response_format: \{ type: "json_object" \},\n        temperature: 0\.1,\n        messages: \[\n          \{\n            role: "system",\n            content: "Return compact JSON TheOutHaven search intent\.",\n          \},\n          \{ role: "user", content: JSON\.stringify\(\{ rawQuery, fast \}\) \},\n        \],\n      \}\),\n    \}\);\n    perf\.llm_ms = Date\.now\(\) - started;\n    if \(!res\.ok\) throw new Error\(await res\.text\(\)\);\n    const data = await res\.json\(\);'''
replacement = '''    const data = await openAiViaAssistantApi<any>("chat/completions", {\n      model,\n      response_format: { type: "json_object" },\n      temperature: 0.1,\n      messages: [\n        { role: "system", content: "Return compact JSON TheOutHaven search intent." },\n        { role: "user", content: JSON.stringify({ rawQuery, fast }) },\n      ],\n    });\n    perf.llm_ms = Date.now() - started;'''
s = must_sub(s, pattern, replacement, "create-search OpenAI request")
write(path, s)

# Edge operations-worker
path = "supabase/functions/operations-worker/index.ts"
s = read(path)
s = must_replace(
    s,
    'import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";\n',
    'import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";\nimport { openAiViaAssistantApi, platformAssistantApiConfigured } from "../_shared/aws-assistant.ts";\n',
    "operations-worker import",
)
s = must_replace(s, 'const openAiKey = Deno.env.get("OPENAI_API_KEY") ?? "";\n', '', "operations-worker provider key")
s = s.replace('if (!openAiKey) throw new Error("OPENAI_API_KEY is required for AI profile enrichment");', 'if (!platformAssistantApiConfigured()) throw new Error("AWS Assistant API is required for AI profile enrichment");')
s = s.replace('if (!openAiKey) throw new Error("OPENAI_API_KEY is required for AI menu extraction");', 'if (!platformAssistantApiConfigured()) throw new Error("AWS Assistant API is required for AI menu extraction");')
s = s.replace('if (!openAiKey) throw new Error("OPENAI_API_KEY is required for embedding generation");', 'if (!platformAssistantApiConfigured()) throw new Error("AWS Assistant API is required for embedding generation");')
old = '    const response = await fetch("https://api.openai.com/v1/embeddings", { method: "POST", headers: { Authorization: `Bearer ${openAiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, input: String(row.search_document).slice(0, 8000) }) });\n    if (!response.ok) throw new Error(`OpenAI embeddings returned ${response.status}: ${await response.text()}`);\n    const body = await response.json();\n    const embedding = body?.data?.[0]?.embedding;'
new = '    const body = await openAiViaAssistantApi<any>("embeddings", { model, input: String(row.search_document).slice(0, 8000) });\n    const embedding = body?.data?.[0]?.embedding;'
s = must_replace(s, old, new, "operations-worker embedding")
pattern = r'''async function openAiJson\(prompt: string\): Promise<Row> \{\n  const response = await fetch\("https://api\.openai\.com/v1/chat/completions", \{ method: "POST", headers: \{ Authorization: `Bearer \$\{openAiKey\}`, "Content-Type": "application/json" \}, body: JSON\.stringify\(\{ model: Deno\.env\.get\("OPENAI_WORKER_MODEL"\) \|\| "gpt-4\.1-mini", response_format: \{ type: "json_object" \}, temperature: 0\.2, messages: \[\{ role: "system", content: "Return valid JSON only\. Preserve facts and never invent unsupported details\." \}, \{ role: "user", content: prompt \}\] \}\) \}\);\n  if \(!response\.ok\) throw new Error\(`OpenAI returned \$\{response\.status\}: \$\{await response\.text\(\)\}`\);\n  const body = await response\.json\(\);\n  const content = body\?\.choices\?\.\[0\]\?\.message\?\.content;'''
replacement = '''async function openAiJson(prompt: string): Promise<Row> {\n  const body = await openAiViaAssistantApi<any>("chat/completions", { model: Deno.env.get("OPENAI_WORKER_MODEL") || "gpt-4.1-mini", response_format: { type: "json_object" }, temperature: 0.2, messages: [{ role: "system", content: "Return valid JSON only. Preserve facts and never invent unsupported details." }, { role: "user", content: prompt }] });\n  const content = body?.choices?.[0]?.message?.content;'''
s = must_sub(s, pattern, replacement, "operations-worker chat")
write(path, s)

# Node semantic query embedding
path = "lib/search/productionIntegration.ts"
s = read(path)
s = must_replace(
    s,
    'import type { EnterpriseLocation, EnterprisePair, EnterpriseSearchResult } from "@/lib/search/enterprise/types";\n',
    'import OpenAI from "openai";\nimport type { EnterpriseLocation, EnterprisePair, EnterpriseSearchResult } from "@/lib/search/enterprise/types";\n',
    "productionIntegration OpenAI import",
)
pattern = r'''async function fetchQueryEmbedding\(query: string\) \{.*?\n\}\n\nasync function embedQuery'''
replacement = '''async function fetchQueryEmbedding(query: string) {\n  const model = process.env.SEARCH_EMBEDDING_MODEL || "text-embedding-3-small";\n  const client = new OpenAI();\n  const payload = await client.embeddings.create({ model, input: query });\n  const embedding = payload?.data?.[0]?.embedding as number[] | undefined;\n  if (!Array.isArray(embedding) || !embedding.length) throw new Error("embedding response was empty");\n  return embedding;\n}\n\nasync function embedQuery'''
s = must_sub(s, pattern, replacement, "productionIntegration embedding", re.S)
write(path, s)

# Node phase13 embedding
path = "app/api/cron/search-phase13-maintenance/route.ts"
s = read(path)
s = must_replace(
    s,
    'import { NextResponse } from "next/server";\n',
    'import OpenAI from "openai";\nimport { NextResponse } from "next/server";\n',
    "phase13 OpenAI import",
)
pattern = r'''async function embed\(text: string\) \{.*?\n\}\n\nconst uniq'''
replacement = '''async function embed(text: string) {\n  const model = process.env.SEARCH_EMBEDDING_MODEL || EMBEDDING_MODEL;\n  const client = new OpenAI();\n  const payload = await client.embeddings.create({ model, input: text });\n  const embedding = payload?.data?.[0]?.embedding as number[] | undefined;\n  if (!Array.isArray(embedding) || !embedding.length) throw new Error("embedding response was empty");\n  return embedding;\n}\n\nconst uniq'''
s = must_sub(s, pattern, replacement, "phase13 embedding", re.S)
write(path, s)

# Debug route: never expose provider credential fragments.
path = "app/api/debug/llm-intent-health/route.ts"
s = read(path)
s = must_replace(
    s,
    'export const runtime = "nodejs";\n',
    'import { assistantApiConfigured } from "@/lib/aws/assistant-api";\n\nexport const runtime = "nodejs";\n',
    "llm health Assistant import",
)
old = '''      env: {\n        hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY),\n        openAIKeyPreview: process.env.OPENAI_API_KEY\n          ? `${process.env.OPENAI_API_KEY.slice(0, 7)}...`\n          : null,\n        model: process.env.OPENAI_SEARCH_MODEL || "gpt-4.1-mini",\n      },'''
new = '''      env: {\n        assistantApiConfigured: assistantApiConfigured(),\n        providerCredentialLocation: "aws-assistant-api",\n        model: process.env.OPENAI_SEARCH_MODEL || "gpt-4.1-mini",\n      },'''
s = must_replace(s, old, new, "llm health credential preview")
write(path, s)

# Plain JS embedding CLI also uses the AWS boundary instead of a provider key.
path = "scripts/backfill-embeddings.js"
s = read(path)
s = must_replace(s, "import OpenAI from 'openai'\n", "import crypto from 'node:crypto'\n", "backfill OpenAI import")
pattern = r'''const openai = new OpenAI\(\{\n  apiKey: process\.env\.OPENAI_API_KEY,\n\}\)\n'''
replacement = '''const assistantBaseUrl = String(process.env.AWS_PLATFORM_ASSISTANT_API_URL || '').replace(/\\/$/, '')\nconst assistantSecret = String(process.env.AWS_PLATFORM_ASSISTANT_API_SECRET || process.env.AWS_PLATFORM_JOB_GATEWAY_SECRET || '')\nasync function assistantEmbedding(input) {\n  if (!assistantBaseUrl.startsWith('https://') || assistantSecret.length < 32) throw new Error('AWS Assistant API is not configured')\n  const path = '/v1/openai/embeddings'\n  const body = JSON.stringify({ model: process.env.SEARCH_EMBEDDING_MODEL || 'text-embedding-3-small', input })\n  const timestamp = String(Date.now())\n  const signature = crypto.createHmac('sha256', assistantSecret).update([timestamp, 'POST', path, body].join('\\n'), 'utf8').digest('hex')\n  const response = await fetch(`${assistantBaseUrl}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-toh-timestamp': timestamp, 'x-toh-signature': signature }, body })\n  const payload = await response.json().catch(() => null)\n  if (!response.ok || !payload?.data?.[0]?.embedding) throw new Error(payload?.error?.message || `Assistant embedding failed: ${response.status}`)\n  return payload.data[0].embedding\n}\n'''
s = must_sub(s, pattern, replacement, "backfill Assistant setup")
s = must_sub(
    s,
    r'''await openai\.embeddings\.create\(\{\s*model: [^,]+,\s*input: ([^\n]+),?\s*\}\)''',
    r'''{ data: [{ embedding: await assistantEmbedding(\1) }] }''',
    "backfill embedding call",
    re.S,
)
write(path, s)

# Hard fail if any runtime OpenAI hostname remains after this migration.
for root in ["app", "lib", "supabase/functions"]:
    for candidate in Path(root).rglob("*"):
        if candidate.suffix not in {".ts", ".tsx", ".js", ".mjs"}:
            continue
        if candidate.as_posix() == "infra/aws/lambda/platform_assistant_api.py":
            continue
        text = candidate.read_text(errors="ignore")
        if "api.openai.com" in text:
            raise SystemExit(f"direct OpenAI hostname remains: {candidate}")

print("Assistant API codemod completed")
