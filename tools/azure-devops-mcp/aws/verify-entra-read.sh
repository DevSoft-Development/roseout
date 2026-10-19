#!/usr/bin/env bash
# Single-use private integration smoke test. No AWS writes.
set -euo pipefail
REGION=us-east-1
STACK=theouthaven-azure-devops-mcp
CLIENT=ebc4388d-ef62-413b-b7d9-175b53ca0348
TENANT=9ad8a4ab-1f10-4d2d-b9ef-2458a2d20a08
FUNCTION="$(aws cloudformation describe-stack-resource --stack-name "$STACK" --logical-resource-id McpLambda --region "$REGION" --query StackResourceDetail.PhysicalResourceId --output text)"
TEMP="$(mktemp -d)"
trap 'rm -rf "$TEMP"' EXIT
chmod 700 "$TEMP"
cat > "$TEMP/event.json" <<EOF
{"requestContext":{"http":{"method":"POST"},"authorizer":{"jwt":{"claims":{"aud":"$CLIENT","tid":"$TENANT","scp":"devops.read"}}}},"body":"{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"list_pipelines\",\"arguments\":{}}}"}
EOF
# Authorizer claims below are synthetic and are only passed via IAM-authorized
# direct Lambda invoke. They are NOT a proof of API Gateway JWT validation.
aws lambda invoke --region "$REGION" --function-name "$FUNCTION" \
  --cli-binary-format raw-in-base64-out \
  --payload "fileb://$TEMP/event.json" "$TEMP/response.json" \
  --query '{StatusCode:StatusCode,FunctionError:FunctionError}' --output json
node - "$TEMP/response.json" <<'NODE'
const fs=require("node:fs");
let r;
try{r=JSON.parse(fs.readFileSync(process.argv[2],"utf8"))}catch{console.error("FAIL: Invalid Lambda response");process.exit(1)}
if(r.statusCode!==200){console.error("FAIL: Lambda returned HTTP "+r.statusCode);process.exit(1)}
let body;
try{body=JSON.parse(r.body)}catch{console.error("FAIL: Invalid MCP response");process.exit(1)}
if(body.result?.isError){console.error("FAIL: upstream Azure DevOps read unavailable");process.exit(1)}
if(!Array.isArray(body.result?.content)){console.error("FAIL: no MCP content");process.exit(1)}
const t=body.result.content.find(x=>x.type==="text")?.text;
let result;try{result=JSON.parse(t)}catch{console.error("FAIL: unreadable Azure DevOps JSON");process.exit(1)}
if(!Array.isArray(result.value)){console.error("FAIL: Azure DevOps pipelines payload unexpected");process.exit(1)}
console.log("PASS: Lambda fetched Azure DevOps pipelines using its certificate-based service identity.");
console.log("Returned pipeline count: "+result.value.length);
NODE
