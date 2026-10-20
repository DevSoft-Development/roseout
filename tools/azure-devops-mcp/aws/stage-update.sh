#!/usr/bin/env bash
# Safe staged upgrade. Does NOT execute the CloudFormation change set.
set -euo pipefail
REGION=us-east-1
STACK=theouthaven-azure-devops-mcp
BUCKET=theouthaven-devops-mcp-artifacts-742020474738
if [ "$#" -ne 2 ]; then echo "Usage: bash stage-update.sh /path/to/lambda.zip /path/to/template.yml" >&2; exit 2; fi
ZIP="$1"
TEMPLATE="$2"
test -f "$ZIP"
test -f "$TEMPLATE"
unzip -tq "$ZIP" >/dev/null
unzip -Z -1 "$ZIP" | grep -qx 'handler.mjs'
aws cloudformation validate-template --region "$REGION" --template-body "file://$TEMPLATE" >/dev/null
STATE="$(aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" --query 'Stacks[0].StackStatus' --output text)"
test "$STATE" = UPDATE_COMPLETE -o "$STATE" = CREATE_COMPLETE
API="$(aws cloudformation describe-stack-resource --region "$REGION" --stack-name "$STACK" --logical-resource-id McpApi --query 'StackResourceDetail.PhysicalResourceId' --output text)"
DISABLED="$(aws apigatewayv2 get-api --region "$REGION" --api-id "$API" --query DisableExecuteApiEndpoint --output text)"
if [ "$DISABLED" != True ];then echo 'ABORT: API is not disabled' >&2;exit 1;fi
HASH="$(sha256sum "$ZIP" | awk '{print $1}')"
KEY="releases/azure-devops-mcp/lambda-${HASH}.zip"
echo "Uploading reviewed ZIP by content digest (sha256=$HASH)"
aws s3api put-object --region "$REGION" --bucket "$BUCKET" --key "$KEY" --body "$ZIP" --server-side-encryption AES256 >/dev/null
VERSION="$(aws s3api head-object --region "$REGION" --bucket "$BUCKET" --key "$KEY" --query VersionId --output text)"
test -n "$VERSION"
CS="mcp-auth-update-$(date +%Y%m%d%H%M%S)"
PARAMS="$(mktemp)"
trap 'rm -f "$PARAMS"' EXIT
node - "$PARAMS" "$BUCKET" "$KEY" "$VERSION" <<'NODE'
const fs=require('fs');
const [file,bucket,key,version]=process.argv.slice(2);
const set={LambdaArtifactBucket:bucket,LambdaArtifactKey:key,LambdaArtifactVersion:version,McpExpectedAudience:"api://ebc4388d-ef62-413b-b7d9-175b53ca0348",McpResourceUrl:"disabled"};
const names=['EntraTenantId','EntraClientId','AzureDevOpsSecretArn','EntraCertificateSha1Thumbprint','LambdaArtifactBucket','LambdaArtifactKey','LambdaArtifactVersion','ExistingLambdaRoleArn','McpExpectedAudience','McpResourceUrl'];
const params=names.map(n=>set[n]?{ParameterKey:n,ParameterValue:set[n]}:{ParameterKey:n,UsePreviousValue:true});
fs.writeFileSync(file,JSON.stringify(params),{mode:0o600});
NODE
aws cloudformation create-change-set --region "$REGION" --stack-name "$STACK" --change-set-name "$CS" --change-set-type UPDATE --template-body "file://$TEMPLATE" --parameters "file://$PARAMS" --description 'Private staged MCP auth update; public API disabled'
aws cloudformation wait change-set-create-complete --region "$REGION" --stack-name "$STACK" --change-set-name "$CS"
echo "CHANGE SET CREATED - NOT EXECUTED: $CS"
aws cloudformation describe-change-set --region "$REGION" --stack-name "$STACK" --change-set-name "$CS" --query '{Status:Status,Changes:Changes[*].ResourceChange.{Type:ResourceType,Action:Action,LogicalId:LogicalResourceId}}' --output json
echo 'Stop: review the change set before executing. Public API must remain disabled.'
