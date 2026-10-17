import https from "node:https";
import { promises as dns } from "node:dns";
import { BlockList, isIP } from "node:net";

// Verify only official HTTPS origins on port 443. Resolve before connection and
// pin the socket to the vetted IP to prevent DNS rebinding. Never follow redirects.
const blocked = new BlockList();
for (const [cidr,bits] of [
  ["0.0.0.0",8],["10.0.0.0",8],["100.64.0.0",10],["127.0.0.0",8],
  ["169.254.0.0",16],["172.16.0.0",12],["192.0.0.0",24],
  ["192.0.2.0",24],["192.168.0.0",16],["198.18.0.0",15],
  ["198.51.100.0",24],["203.0.113.0",24],["224.0.0.0",4],
  ["240.0.0.0",4]
] as const) blocked.addSubnet(cidr,bits,"ipv4");
for (const [cidr,bits] of [
  ["::",128],["::1",128],["fc00::",7],["fe80::",10],
  ["ff00::",8],["2001:db8::",32],["::ffff:0:0",96]
] as const) blocked.addSubnet(cidr,bits,"ipv6");

export function safeVerificationDomain(domain: string): boolean {
  return domain.length <= 253 && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain) &&
    !domain.split(".").some(x=>x.startsWith("-")||x.endsWith("-")) &&
    !domain.endsWith(".local") && !domain.endsWith(".internal");
}
export async function fetchOfficialWebsiteToken(domain: string, expectedHash: string, hash:(s:string)=>string) {
  if (!safeVerificationDomain(domain) || isIP(domain)) return false;
  let addresses: {address:string;family:number}[];
  try { addresses = await dns.lookup(domain,{all:true,verbatim:true}); } catch { return false; }
  if (!addresses.length || addresses.some(a=> !isIP(a.address) ||
    blocked.check(a.address,a.family===6?"ipv6":"ipv4"))) return false;
  const target = addresses.find(a=>a.family===4) || addresses[0];
  const path = "/.well-known/theouthaven-claim.txt";
  return new Promise<boolean>(resolve=>{
    let finished=false; const finish=(v:boolean)=>{if(!finished){finished=true;resolve(v)}};
    const req = https.request({
      hostname:domain,port:443,path,method:"GET",protocol:"https:",
      agent:false,timeout:5000,maxHeaderSize:4096,
      lookup:(_hostname,_opts,cb)=>cb(null,target.address,target.family),
      headers:{"Accept":"text/plain","User-Agent":"TheOutHaven-ClaimVerifier/1.0"}
    },res=>{
      // Redirects and non-text content always fail. Never fetch an arbitrary Location header.
      if(res.statusCode!==200 || !String(res.headers["content-type"]||"").startsWith("text/plain")) {
        res.resume();finish(false);return;
      }
      let body="";res.setEncoding("utf8");
      res.on("data",(chunk:string)=>{body+=chunk;if(body.length>2048){req.destroy();finish(false)}});
      res.on("end",()=>finish(body.length<=2048 && body.split(/\r?\n/).some(line=>hash(line.trim())===expectedHash)));
    });
    req.on("timeout",()=>{req.destroy();finish(false)});
    req.on("error",()=>finish(false));req.end();
  });
}
