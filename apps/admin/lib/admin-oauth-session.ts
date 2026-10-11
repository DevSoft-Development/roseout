import "server-only";

import {createServerClient} from "@supabase/ssr";
import {NextRequest,NextResponse} from "next/server";
import {requireSupabaseAnonKey,requireSupabaseUrl} from "@theouthaven/config/server-env";

/** Bind Supabase's PKCE/session cookie writes to the actual redirect response.
 * Server cookieStore writes alone do not guarantee they reach a new NextResponse.
 */
export function createAdminOAuthSession(request:NextRequest){
  type StoredCookie={name:string;value:string;options?:{
    domain?:string;path?:string;maxAge?:number;httpOnly?:boolean;secure?:boolean;
    sameSite?:boolean|"lax"|"strict"|"none";expires?:Date;priority?:"low"|"medium"|"high";partitioned?:boolean;
  }};
  const pending=new Map<string,StoredCookie>();
  const supabase=createServerClient(requireSupabaseUrl(),requireSupabaseAnonKey(),{
    cookies:{
      getAll(){
        const byName=new Map(request.cookies.getAll().map(cookie=>[cookie.name,{name:cookie.name,value:cookie.value}]));
        for(const cookie of pending.values())byName.set(cookie.name,{name:cookie.name,value:cookie.value});
        return [...byName.values()];
      },
      setAll(cookiesToSet){
        for(const {name,value,options} of cookiesToSet)
          pending.set(name,{name,value,options:options as StoredCookie["options"]});
      }
    }
  });
  function redirect(destination:URL|string){
    const response=NextResponse.redirect(destination);
    response.headers.set("Cache-Control","private, no-store, max-age=0");
    response.headers.set("Pragma","no-cache");
    for(const cookie of pending.values()){
      response.cookies.set(cookie.name,cookie.value,{
        ...cookie.options,
        path:"/",
      });
    }
    return response;
  }
  return {supabase,redirect};
}
