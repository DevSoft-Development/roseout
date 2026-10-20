import assert from "node:assert/strict";
import test from "node:test";
import {handler} from "./handler.mjs";

const goodClaims={tid:"9ad8a4ab-1f10-4d2d-b9ef-2458a2d20a08",aud:"api://ebc4388d-ef62-413b-b7d9-175b53ca0348",scp:"devops.read"};
process.env.ENTRA_TENANT_ID=goodClaims.tid;
process.env.ENTRA_CLIENT_ID="ebc4388d-ef62-413b-b7d9-175b53ca0348";
process.env.MCP_EXPECTED_AUDIENCE=goodClaims.aud;
const event=(method,claims=goodClaims)=>({
 requestContext:{http:{method:"POST"},authorizer:{jwt:{claims}}},
 body:JSON.stringify({jsonrpc:"2.0",id:1,method})
});
test("missing authorizer fails closed",async()=>{
 const res=await handler({requestContext:{http:{method:"POST"}},body:"{}"});
 assert.equal(res.statusCode,401);
});
test("wrong tenant is rejected",async()=>{
 assert.equal((await handler(event("tools/list",{...goodClaims,tid:"wrong"}))).statusCode,401);
});
test("Entra v2 GUID audience is accepted",async()=>{
 const res=await handler(event("tools/list",{...goodClaims,aud:"ebc4388d-ef62-413b-b7d9-175b53ca0348"}));
 assert.equal(res.statusCode,200);
});
test("wrong audience is rejected",async()=>{
 assert.equal((await handler(event("tools/list",{...goodClaims,aud:"wrong"}))).statusCode,401);
});
test("missing delegated read scope rejected",async()=>{
 assert.equal((await handler(event("tools/list",{...goodClaims,scp:""}))).statusCode,403);
});
test("read tools and gated pipeline queue are advertised",async()=>{
 const res=await handler(event("tools/list"));
 assert.equal(res.statusCode,200);
 const names=JSON.parse(res.body).result.tools.map(t=>t.name);
 assert.deepEqual(names,["list_pipelines","list_builds","get_build","get_build_timeline","get_build_log","list_branches","create_repo_branch","commit_repo_file","create_repo_pr","get_repo_pr","complete_repo_pr","queue_pipeline"]);
});
test("unknown tool is not callable",async()=>{
 const res=await handler({...event("tools/call"),body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"delete_pipeline"}})});
 assert.equal(JSON.parse(res.body).error.code,-32601);
});

test("OAuth discovery is unavailable until resource URL is configured",async()=>{
 const previous=process.env.MCP_RESOURCE_URL;
 delete process.env.MCP_RESOURCE_URL;
 const res=await handler({rawPath:"/.well-known/oauth-protected-resource",requestContext:{http:{method:"GET"}}});
 assert.equal(res.statusCode,503);
 if(previous!==undefined)process.env.MCP_RESOURCE_URL=previous;
});
test("OAuth discovery uses the configured resource and Entra tenant",async()=>{
 process.env.MCP_RESOURCE_URL="https://mcp.example.test";
 const res=await handler({rawPath:"/.well-known/oauth-protected-resource",requestContext:{http:{method:"GET"}}});
 const data=JSON.parse(res.body);
 assert.equal(res.statusCode,200);
 assert.equal(data.resource,"https://mcp.example.test");
 assert.equal(data.authorization_servers[0],"https://login.microsoftonline.com/"+goodClaims.tid+"/v2.0");
 delete process.env.MCP_RESOURCE_URL;
});

test("Azure DevOps audience is not accepted for MCP",async()=>{
 const wrong={...goodClaims,aud:"499b84ac-1321-427f-aa17-267ca6975798"};
 assert.equal((await handler(event("tools/list",wrong))).statusCode,401);
});

test("pipeline queue is disabled by default",async()=>{
 delete process.env.MCP_QUEUE_ENABLED;
 const res=await handler({...event("tools/call"),body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"queue_pipeline",arguments:{pipelineId:3}}})});
 assert.equal(JSON.parse(res.body).result.isError,true);
 assert.match(JSON.parse(res.body).result.content[0].text,/not authorized/);
});
test("pipeline queue rejects unauthorized callers and production pipeline IDs",async()=>{
 process.env.MCP_QUEUE_ENABLED="true";
 process.env.MCP_QUEUE_ALLOWED_OIDS="11111111-1111-4111-8111-111111111111";
 const invoke=(claims,pipelineId)=>handler({...event("tools/call",claims),body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"queue_pipeline",arguments:{pipelineId}}})});
 assert.equal(JSON.parse((await invoke({...goodClaims,scp:"devops.read devops.queue",oid:"other"},3)).body).result.isError,true);
 assert.equal(JSON.parse((await invoke({...goodClaims,oid:"11111111-1111-4111-8111-111111111111"},3)).body).result.isError,true);
 assert.match(JSON.parse((await invoke({...goodClaims,scp:"devops.read devops.queue",oid:"11111111-1111-4111-8111-111111111111"},1)).body).result.content[0].text,/not approved/);
 delete process.env.MCP_QUEUE_ENABLED;
 delete process.env.MCP_QUEUE_ALLOWED_OIDS;
});

test("build diagnostics reject invalid IDs before upstream access",async()=>{
 for(const [name,args] of [["get_build_timeline",{buildId:0}],["get_build_log",{buildId:1,logId:0}]]){
  const res=await handler({...event("tools/call"),body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name,arguments:args}})});
  assert.equal(res.statusCode,400);
 }
});

test("repository mutations disabled by default even with delegated scope",async()=>{
 delete process.env.MCP_REPO_WRITE_ENABLED;
 const claims={...goodClaims,scp:"devops.read devops.write",oid:"11111111-1111-4111-8111-111111111111"};
 for(const name of ["create_repo_branch","commit_repo_file","create_repo_pr","complete_repo_pr"]){
  const res=await handler({...event("tools/call",claims),body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name,arguments:{branch:"chatgpt/test",pullRequestId:1}}})});
  assert.match(JSON.parse(res.body).result.content[0].text,/not authorized/);
 }
});
test("invalid branch and unsafe paths fail before upstream writes",async()=>{
 process.env.MCP_REPO_WRITE_ENABLED="true";process.env.MCP_REPO_WRITE_ALLOWED_OIDS="11111111-1111-4111-8111-111111111111";
 const claims={...goodClaims,scp:"devops.read devops.write",oid:"11111111-1111-4111-8111-111111111111"};
 const invoke=(name,args)=>handler({...event("tools/call",claims),body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name,arguments:args}})});
 assert.match(JSON.parse((await invoke("create_repo_branch",{branch:"main"})).body).result.content[0].text,/Invalid/);
 assert.match(JSON.parse((await invoke("commit_repo_file",{branch:"chatgpt/feature",path:"../secrets",content:"x",message:"test update",expectedCommit:"a".repeat(40)})).body).result.content[0].text,/Invalid/);
 delete process.env.MCP_REPO_WRITE_ENABLED;delete process.env.MCP_REPO_WRITE_ALLOWED_OIDS;
});
