#!/usr/bin/env bash
# Read-only certification for the existing TheOutHaven Azure DevOps Lambda.
# Never prints certificates, access tokens, or secrets; does not modify AWS.
set -euo pipefail
REGION=us-east-1
STACK=theouthaven-azure-devops-mcp
FUNCTION="$(aws cloudformation describe-stack-resource --region "$REGION" --stack-name "$STACK" --logical-resource-id McpLambda --query StackResourceDetail.PhysicalResourceId --output text)"
echo "Checking AWS stack and Lambda..."
aws cloudformation describe-stacks --region "$REGION" --stack-name "$STACK" --query 'Stacks[0].StackStatus' --output text
aws lambda get-function-configuration --region "$REGION" --function-name "$FUNCTION" --query '{State:State,Runtime:Runtime,Role:Role}' --output json
echo "Checking API Gateway remains disabled..."
API="$(aws cloudformation describe-stack-resource --region "$REGION" --stack-name "$STACK" --logical-resource-id McpApi --query StackResourceDetail.PhysicalResourceId --output text)"
aws apigatewayv2 get-api --region "$REGION" --api-id "$API" --query '{Name:Name,DefaultEndpointDisabled:DisableExecuteApiEndpoint}' --output json
echo "Testing unauthenticated Lambda invocation..."
RESPONSE="$(mktemp)"
trap 'rm -f "$RESPONSE"' EXIT
aws lambda invoke --region "$REGION" --function-name "$FUNCTION" --cli-binary-format raw-in-base64-out --payload '{"requestContext":{"http":{"method":"POST"}},"body":"{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}"}' "$RESPONSE" --query '{StatusCode:StatusCode,FunctionError:FunctionError}' --output json
node - "$RESPONSE" <<'NODE'
const fs=require("node:fs");
const r=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));
if(r.statusCode!==401){console.error("FAIL: unauthenticated request did not return 401");process.exit(1);}
console.log("PASS: unauthorized request rejected");
NODE
echo "Checking IAM permissions (simulation only)..."
ROLE="$(aws lambda get-function-configuration --region "$REGION" --function-name "$FUNCTION" --query Role --output text)"
SECRET="$(aws lambda get-function-configuration --region "$REGION" --function-name "$FUNCTION" --query 'Environment.Variables.AZDO_CERT_SECRET_ARN' --output text)"
if [[ "$SECRET" != arn:aws:secretsmanager:us-east-1:* ]]; then echo "FAIL: missing region-scoped secret ARN";exit 1;fi
DECISION="$(aws iam simulate-principal-policy --policy-source-arn "$ROLE" --action-names secretsmanager:GetSecretValue --resource-arns "$SECRET" --query 'EvaluationResults[0].EvalDecision' --output text)"
if [ "$DECISION" != allowed ]; then echo "FAIL: role denied secret access";exit 1;fi
echo "PASS: IAM simulation allows scoped secret read"
echo "PENDING: Actual key retrieval and Entra certificate token exchange require a separate reviewed Lambda diagnostic."
echo "PENDING: ChatGPT OAuth and live Azure DevOps read certification."
