#!/usr/bin/env node
/**
 * Live LI V2 -> Search V3 certification. Read-only: never creates menu rows,
 * calls paid acquisition providers, or mints synthetic production embeddings.
 *
 * Inputs:
 *   LI_E2E_SUPABASE_URL: East primary URL
 *   LI_E2E_SUPABASE_SERVICE_ROLE_KEY: read-only certification access
 *   LI_E2E_SEARCH_URL: authenticated Search V3 endpoint (full URL)
 *   LI_E2E_SEARCH_BEARER_TOKEN: real test user session JWT
 *   LI_E2E_SEARCH_QUERY: distinctive official menu item to search
 *   LI_E2E_LOCATION_ID: expected restaurant UUID
 */
const required = [
  "LI_E2E_SUPABASE_URL", "LI_E2E_SUPABASE_SERVICE_ROLE_KEY",
  "LI_E2E_SEARCH_URL", "LI_E2E_SEARCH_BEARER_TOKEN",
  "LI_E2E_SEARCH_QUERY", "LI_E2E_LOCATION_ID"
];
const missing=required.filter(k=>!process.env[k]?.trim());
if(missing.length) { console.error("LI E2E BLOCKED: missing "+missing.join(", "));process.exit(2); }
const env=process.env;
const project=new URL(env.LI_E2E_SUPABASE_URL).hostname.split(".")[0];
if(project!=="ftdsltatyqhtllyyefzp") throw Error("LI E2E must read East primary, not DR");
const searchUrl=new URL(env.LI_E2E_SEARCH_URL);
if(searchUrl.protocol!=="https:" && searchUrl.hostname!=="localhost") throw Error("Search URL must be HTTPS");
const timeout=AbortSignal.timeout(20000);
async function read(table,select,filters) {
 const u=new URL("/rest/v1/"+table,env.LI_E2E_SUPABASE_URL);
 u.searchParams.set("select",select);
 for(const [k,v] of Object.entries(filters)) u.searchParams.set(k,v);
 const response=await fetch(u,{headers:{apikey:env.LI_E2E_SUPABASE_SERVICE_ROLE_KEY,authorization:"Bearer "+env.LI_E2E_SUPABASE_SERVICE_ROLE_KEY},signal:timeout});
 if(!response.ok) throw Error("East query "+table+" failed: "+response.status+" "+(await response.text()).slice(0,300));
 return response.json();
}
const location=env.LI_E2E_LOCATION_ID;
if(!/^[a-f0-9-]{36}$/i.test(location)) throw Error("Invalid location UUID");
const items=await read("location_menu_items","id,location_id,item_name,source,source_metadata,content_hash",{location_id:"eq."+location,source:"eq.official_jsonld",status:"eq.active",limit:"100"});
const query=env.LI_E2E_SEARCH_QUERY.trim().toLowerCase();
const target=items.find(i=>i.item_name.toLowerCase()===query);
if(!target) throw Error("Not certified: official_jsonld menu item missing in East primary for this exact query");
const sourceUrl=target.source_metadata?.sourceUrl;
if(typeof sourceUrl!=="string" || new URL(sourceUrl).protocol!=="https:") throw Error("Official source provenance missing HTTPS URL");
const embeddings=await read("location_menu_item_embeddings","menu_item_id,location_id,embedding_model,embedding_version,status,document_hash",{menu_item_id:"eq."+target.id,status:"eq.ready",limit:"2"});
const matchedEmbedding=embeddings.find(e=>e.embedding_model==="text-embedding-3-small" && e.location_id===location && e.document_hash===target.content_hash);\nif(!matchedEmbedding) throw Error("Not certified: matching fresh Azure menu vector not ready");
const response=await fetch(searchUrl,{method:"POST",headers:{"authorization":"Bearer "+env.LI_E2E_SEARCH_BEARER_TOKEN,"content-type":"application/json"},body:JSON.stringify({query:env.LI_E2E_SEARCH_QUERY}),signal:timeout});
if(!response.ok) throw Error("Authenticated Search V3 failed: HTTP "+response.status);
const body=await response.json();
const encoded=JSON.stringify(body).toLowerCase();
if(!encoded.includes(location.toLowerCase()) || !encoded.includes(query)) throw Error("Search result lacks expected location or menu evidence");
// Source provenance is verified against the authoritative menu record in East.\n// Search V3 menu lane does not currently expose the source URL in its public metadata.\n// Do not conflate retrieval certification with public provenance-display certification.
console.log(JSON.stringify({certified:true,location_id:location,menu_item_id:target.id,embedding_version:matchedEmbedding.embedding_version,source_url:sourceUrl,public_provenance_display_certified:false,search_http_status:response.status}));
