import {describe,it,expect,vi,beforeEach} from "vitest";
import {NextRequest} from "next/server";

const writes=vi.hoisted(()=>({setAll:null as null|((cookies:any[])=>void),getAll:null as null|(()=>any[])}));
vi.mock("@supabase/ssr",()=>({
  createServerClient:(_url:string,_key:string,settings:{cookies:{getAll:()=>any[];setAll:(cookies:any[])=>void}})=>{
    writes.setAll=settings.cookies.setAll;
    writes.getAll=settings.cookies.getAll;
    return {auth:{}};
  }
}));
vi.mock("@theouthaven/config/server-env",()=>({
  requireSupabaseUrl:()=>"https://example.supabase.co",
  requireSupabaseAnonKey:()=>"anon-test-key"
}));
import {createAdminOAuthSession} from "./admin-oauth-session";

describe("Admin OAuth redirect cookies",()=>{
  beforeEach(()=>{writes.setAll=null;writes.getAll=null;});
  it("sends PKCE verifier and preserves security attributes on Microsoft redirect",()=>{
    const request=new NextRequest("https://admin.theouthaven.com/auth/admin/start");
    const session=createAdminOAuthSession(request);
    writes.setAll?.([{name:"sb-test-code-verifier",value:"test-verifier",options:{httpOnly:true,secure:true,sameSite:"lax",maxAge:300}}]);
    const response=session.redirect("https://login.microsoftonline.com/example");
    const cookie=response.cookies.get("sb-test-code-verifier");
    expect(cookie?.value).toBe("test-verifier");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.secure).toBe(true);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("replaces old session cookies with new callback session and expires cleared cookies",()=>{
    const request=new NextRequest("https://admin.theouthaven.com/auth/admin/callback");
    request.cookies.set("sb-test-auth-token","expired");
    const session=createAdminOAuthSession(request);
    writes.setAll?.([{name:"sb-test-auth-token",value:"fresh",options:{httpOnly:true,secure:true,path:"/"}}]);
    expect(writes.getAll?.().find((x:any)=>x.name==="sb-test-auth-token")?.value).toBe("fresh");
    let response=session.redirect(new URL("/admin/dashboard",request.url));
    expect(response.cookies.get("sb-test-auth-token")?.value).toBe("fresh");
    writes.setAll?.([{name:"sb-test-auth-token",value:"",options:{maxAge:0,path:"/"}}]);
    response=session.redirect(new URL("/admin/login",request.url));
    expect(response.cookies.get("sb-test-auth-token")?.maxAge).toBe(0);
  });
  it("does not forward unrelated input cookies into redirect Set-Cookie",()=>{
    const request=new NextRequest("https://admin.theouthaven.com/auth/admin/start");
    request.cookies.set("unrelated-cookie","private");
    const session=createAdminOAuthSession(request);
    const response=session.redirect(new URL("/admin/login",request.url));
    expect(response.cookies.get("unrelated-cookie")).toBeUndefined();
  });
});
