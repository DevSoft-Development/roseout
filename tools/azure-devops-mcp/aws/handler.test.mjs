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
test("wrong audience is rejected",async()=>{
 assert.equal((await handler(event("tools/list",{...goodClaims,aud:"wrong"}))).statusCode,401);
});
test("missing delegated read scope rejected",async()=>{
 assert.equal((await handler(event("tools/list",{...goodClaims,scp:""}))).statusCode,403);
});
test("only read tools are advertised",async()=>{
 const res=await handler(event("tools/list"));
 assert.equal(res.statusCode,200);
 const names=JSON.parse(res.body).result.tools.map(t=>t.name);
 assert.deepEqual(names,["list_pipelines","list_builds","get_build","list_branches"]);
});
test("unknown tool is not callable",async()=>{
 const res=await handler({...event("tools/call"),body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"queue_pipeline"}})});
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
