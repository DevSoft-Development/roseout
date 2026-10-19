import {createSign,randomUUID} from "node:crypto";
// AWS Lambda HTTP API entrypoint for read-only Azure DevOps MCP.
// The API Gateway JWT authorizer MUST validate Microsoft Entra issuer,
// audience and token expiry before this function can be invoked.
// We independently enforce tenant and delegated scope; no unauthenticated tools.
const json=(statusCode,body,extra={})=>({statusCode,headers:{"content-type":"application/json","cache-control":"no-store",...extra},body:JSON.stringify(body)});
const tools=[
{name:"list_pipelines",description:"Read Azure DevOps pipelines",inputSchema:{type:"object",properties:{},additionalProperties:false}},
{name:"list_builds",description:"Read recent Azure DevOps builds",inputSchema:{type:"object",properties:{},additionalProperties:false}},
{name:"get_build",description:"Read one Azure DevOps build",inputSchema:{type:"object",properties:{buildId:{type:"integer",minimum:1}},required:["buildId"],additionalProperties:false}},
{name:"list_branches",description:"Read Azure Repos branches",inputSchema:{type:"object",properties:{},additionalProperties:false}}
];
const org=process.env.AZDO_ORGANIZATION||"TheOutHaven";
const project=process.env.AZDO_PROJECT||"TheOutHaven";
const repository=process.env.AZDO_REPOSITORY||"TheOutHaven";
const apiBase="https://dev.azure.com/"+encodeURIComponent(org)+"/"+encodeURIComponent(project)+"/_apis";
let secretsClient;
let cachedToken;
let expiresAt=0;
const base64url=(value)=>Buffer.from(value).toString("base64url");

async function loadCertificate(){
  const arn=process.env.AZDO_CERT_SECRET_ARN;
  if(!arn)throw new Error("certificate_secret_not_configured");
  const {SecretsManagerClient,GetSecretValueCommand}=await import("@aws-sdk/client-secrets-manager");
  secretsClient??=new SecretsManagerClient({region:process.env.AWS_REGION||"us-east-1"});
  const secret=await secretsClient.send(new GetSecretValueCommand({SecretId:arn}));
  if(!secret.SecretString?.includes("BEGIN PRIVATE KEY"))throw new Error("invalid_certificate_secret");
  return secret.SecretString;
}

async function getDevOpsToken(){
  if(cachedToken&&Date.now()<expiresAt-120000)return cachedToken;
  const tenant=process.env.ENTRA_TENANT_ID;
  const clientId=process.env.ENTRA_CLIENT_ID;
  const publicCert=process.env.ENTRA_CERT_SHA1_THUMBPRINT;
  if(!tenant||!clientId||!publicCert||!/^[a-f0-9]{40}$/i.test(publicCert))
    throw new Error("entra_application_configuration_incomplete");
  const privateKey=await loadCertificate();
  const endpoint=`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`;
  const now=Math.floor(Date.now()/1000);
  const header={alg:"RS256",typ:"JWT",x5t:Buffer.from(publicCert,"hex").toString("base64url")};
  const payload={aud:endpoint,iss:clientId,sub:clientId,jti:randomUUID(),nbf:now,iat:now,exp:now+300};
  const signingInput=base64url(JSON.stringify(header))+"."+base64url(JSON.stringify(payload));
  const signer=createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const assertion=signingInput+"."+signer.sign(privateKey).toString("base64url");
  const form=new URLSearchParams({
    client_id:clientId,scope:"499b84ac-1321-427f-aa17-267ca6975798/.default",
    grant_type:"client_credentials",
    client_assertion_type:"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    client_assertion:assertion
  });
  const response=await fetch(endpoint,{method:"POST",body:form,signal:AbortSignal.timeout(12000),redirect:"error"});
  if(!response.ok)throw new Error("entra_token_request_failed");
  const data=await response.json();
  if(typeof data.access_token!=="string"||!Number.isFinite(data.expires_in))
    throw new Error("entra_token_response_invalid");
  cachedToken=data.access_token;
  expiresAt=Date.now()+Math.min(data.expires_in,3600)*1000;
  return cachedToken;
}

async function read(path,params){
  const token=await getDevOpsToken();
  const url=new URL(apiBase+path);
  for(const [k,v] of Object.entries({...params,"api-version":"7.1"}))url.searchParams.set(k,String(v));
  const result=await fetch(url,{headers:{authorization:"Bearer "+token},redirect:"error",signal:AbortSignal.timeout(12000)});
  if(!result.ok)throw new Error("upstream_http_"+result.status);
  return result.json();
}
export async function handler(event){
  const path=event?.rawPath||event?.requestContext?.http?.path||"";
  const method=event?.requestContext?.http?.method;
  if(method==="GET" && path==="/.well-known/oauth-protected-resource"){
    const resource=process.env.MCP_RESOURCE_URL;
    const tenant=process.env.ENTRA_TENANT_ID;
    if(!resource||!tenant)return json(503,{error:"oauth_metadata_not_configured"});
    return json(200,{resource,authorization_servers:[`https://login.microsoftonline.com/${tenant}/v2.0`],scopes_supported:["devops.read"],bearer_methods_supported:["header"]});
  }

  const claims=event?.requestContext?.authorizer?.jwt?.claims;
  const tenant=process.env.ENTRA_TENANT_ID;
  const audience=process.env.ENTRA_CLIENT_ID;
  // JWT issuer/signature/audience validation is enforced by API Gateway's
  // configured JWT authorizer. Never deploy a route without that authorizer.
  if(!tenant||!audience||!claims||claims.tid!==tenant||claims.aud!==audience)
    return json(401,{error:"unauthorized"},{"www-authenticate":process.env.MCP_RESOURCE_URL ? `Bearer resource_metadata="${process.env.MCP_RESOURCE_URL}/.well-known/oauth-protected-resource"` : "Bearer"});
  const scopes=String(claims.scp||"").split(" ");
  if(!scopes.includes("devops.read"))return json(403,{error:"insufficient_scope"});
  if(event.requestContext?.http?.method!=="POST")return json(405,{error:"method_not_allowed"});
  let msg;
  try{msg=JSON.parse(event.body||"{}")}catch{return json(400,{error:"invalid_json"})}
  if(msg.jsonrpc!=="2.0")return json(400,{error:"invalid_jsonrpc"});
  if(msg.method==="notifications/initialized")return {statusCode:202,body:""};
  const id=msg.id;
  const reply=(result)=>json(200,{jsonrpc:"2.0",id,result});
  if(msg.method==="initialize")return reply({protocolVersion:"2025-03-26",capabilities:{tools:{}},serverInfo:{name:"theouthaven-azure-devops",version:"0.1.0"}});
  if(msg.method==="ping")return reply({});
  if(msg.method==="tools/list")return reply({tools});
  if(msg.method!=="tools/call"||!tools.some(t=>t.name===msg.params?.name))return json(200,{jsonrpc:"2.0",id,error:{code:-32601,message:"Method not found"}});
  const name=msg.params.name, args=msg.params.arguments||{};
  try{
    let result;
    if(name==="list_pipelines")result=await read("/pipelines",{"$top":25});
    if(name==="list_builds")result=await read("/build/builds",{"$top":25});
    if(name==="get_build"){if(!Number.isInteger(args.buildId)||args.buildId<1)return json(400,{error:"invalid_build_id"});result=await read("/build/builds/"+args.buildId,{});}
    if(name==="list_branches")result=await read("/git/repositories/"+encodeURIComponent(repository)+"/refs",{filter:"heads/"});
    return reply({content:[{type:"text",text:JSON.stringify(result)}]});
  }catch{return reply({isError:true,content:[{type:"text",text:"Azure DevOps read unavailable"}]});}
}
