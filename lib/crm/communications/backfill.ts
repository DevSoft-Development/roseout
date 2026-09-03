import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
export type BackfillPreview={source:string;scanned:number;linkable:number;skipped:number;ambiguous:number};
export async function previewCommunicationBackfill():Promise<BackfillPreview[]> {
 const sources=["email_logs","sms_messages","notifications","support_messages","reservation_communications"];
 return Promise.all(sources.map(async source=>{const result=await supabaseAdmin.from(source).select("id",{count:"exact",head:true});return {source,scanned:result.count||0,linkable:0,skipped:result.error?0:result.count||0,ambiguous:0}}));
}
