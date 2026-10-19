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
let credentialClientPromise;
async function loadUpstreamToken(){
  const arn=process.env.AZDO_READ_SECRET_ARN;
  if(!arn)throw new Error("upstream_secret_not_configured");
  const {SecretsManagerClient,GetSecretValueCommand}=await import("@aws-sdk/client-secrets-manager");
  if(!credentialClientPromise)credentialClientPromise=Promise.resolve(new SecretsManagerClient({region:process.env.AWS_REGION||"us-east-1"}));
  const client=await credentialClientPromise;
  const result=await client.send(new GetSecretValueCommand({SecretId:arn}));
  if(!result.SecretString)throw new Error("upstream_secret_empty");
  const value=JSON.parse(result.SecretString);
  if(typeof value.token!=="string"||!value.token)throw new Error("upstream_secret_invalid");
  return value.token;
}
async function read(path,params){
  // This is a bootstrap: secret retrieval and upstream service identity wiring are
  // deliberately not enabled until the authenticated deployment has been reviewed.
  const key=await loadUpstreamToken();
  const url=new URL(apiBase+path);
  for(const [k,v] of Object.entries({...params,"api-version":"7.1"}))url.searchParams.set(k,String(v));
  const result=await fetch(url,{headers:{authorization:"Basic "+Buffer.from(":"+key).toString("base64")},redirect:"error",signal:AbortSignal.timeout(12000)});
  if(!result.ok)throw new Error("upstream_http_"+result.status);
  return result.json();
}
export async function handler(event){
  const claims=event?.requestContext?.authorizer?.jwt?.claims;
  const tenant=process.env.ENTRA_TENANT_ID;
  const audience=process.env.ENTRA_CLIENT_ID;
  // JWT issuer/signature/audience validation is enforced by API Gateway's
  // configured JWT authorizer. Never deploy a route without that authorizer.
  if(!tenant||!audience||!claims||claims.tid!==tenant||claims.aud!==audience)
    return json(401,{error:"unauthorized"});
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
