#!/usr/bin/env node
/**
 * TheOutHaven Azure DevOps MCP bridge (read-only bootstrap).
 * StdIO, JSON-RPC message per line, no HTTP listener or persisted tokens.
 * Default is strictly read-only: no repositories, pipelines, or permissions are mutated.
 */
import { createInterface } from "node:readline";
const organization=process.env.AZDO_ORGANIZATION||"TheOutHaven";
const project=process.env.AZDO_PROJECT||"TheOutHaven";
const token=process.env.AZDO_MCP_TOKEN;
const repoId=process.env.AZDO_REPOSITORY||"TheOutHaven";
const version="7.1";
const tools=[
  {name:"list_pipelines",description:"List Azure DevOps build pipelines (read-only)",inputSchema:{type:"object",properties:{top:{type:"integer",minimum:1,maximum:100}},additionalProperties:false}},
  {name:"list_builds",description:"Get recent pipeline builds (read-only)",inputSchema:{type:"object",properties:{top:{type:"integer",minimum:1,maximum:100}},additionalProperties:false}},
  {name:"get_build",description:"Read a build result by numeric ID",inputSchema:{type:"object",properties:{buildId:{type:"integer",minimum:1}},required:["buildId"],additionalProperties:false}},
  {name:"list_branches",description:"Read repository branches (read-only)",inputSchema:{type:"object",properties:{},additionalProperties:false}},
];
const projectBase=`https://dev.azure.com/${encodeURIComponent(organization)}/${encodeURIComponent(project)}/_apis`;
async function fetchAzure(path, params={}) {
  if(!token)throw new Error("AZDO_MCP_TOKEN is not configured");
  const url=new URL(projectBase+path);
  Object.entries({...params,"api-version":version}).forEach(([k,v])=>url.searchParams.set(k,String(v)));
  const auth=Buffer.from(":"+token).toString("base64");
  const res=await fetch(url,{headers:{Authorization:"Basic "+auth,Accept:"application/json"},signal:AbortSignal.timeout(15000),redirect:"error"});
  if(!res.ok)throw new Error("Azure DevOps request failed (HTTP "+res.status+")");
  return await res.json();
}
async function call(name,args){
  if(name==="list_pipelines")return fetchAzure("/pipelines",{"$top":Math.min(args.top||20,100)});
  if(name==="list_builds")return fetchAzure("/build/builds",{"$top":Math.min(args.top||20,100),"queryOrder":"queueTimeDescending"});
  if(name==="get_build"){if(!Number.isInteger(args.buildId)||args.buildId<1)throw new Error("Invalid buildId");return fetchAzure("/build/builds/"+args.buildId);}
  if(name==="list_branches")return fetchAzure("/git/repositories/"+encodeURIComponent(repoId)+"/refs",{filter:"heads/"});
  throw new Error("Unknown tool");
}
function send(message){process.stdout.write(JSON.stringify(message)+"\n")}
const reader=createInterface({input:process.stdin,crlfDelay:Infinity});
for await(const line of reader){
  if(!line.trim())continue;
  let request;
  try{
    request=JSON.parse(line);
    if(request.jsonrpc!=="2.0")throw new Error("Invalid JSON-RPC version");
    if(request.method==="notifications/initialized")continue;
    if(request.id===undefined)continue;
    if(request.method==="initialize"){
      send({jsonrpc:"2.0",id:request.id,result:{protocolVersion:"2025-03-26",capabilities:{tools:{listChanged:false}},serverInfo:{name:"theouthaven-azure-devops",version:"0.1.0"}}});
    }else if(request.method==="ping"){
      send({jsonrpc:"2.0",id:request.id,result:{}});
    }else if(request.method==="tools/list"){
      send({jsonrpc:"2.0",id:request.id,result:{tools}});
    }else if(request.method==="tools/call"){
      const name=request.params?.name, args=request.params?.arguments||{};
      if(!tools.some(t=>t.name===name))throw new Error("Unsupported tool");
      const result=await call(name,args);
      send({jsonrpc:"2.0",id:request.id,result:{content:[{type:"text",text:JSON.stringify(result)}]}});
    }else{
      send({jsonrpc:"2.0",id:request.id,error:{code:-32601,message:"Method not found"}});
    }
  }catch(e){
    if(request?.id!==undefined)send({jsonrpc:"2.0",id:request.id,error:{code:-32000,message:e instanceof Error?e.message:"Request failed"}});
  }
}
