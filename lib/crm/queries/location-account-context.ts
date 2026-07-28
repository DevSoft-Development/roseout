import "server-only";import { supabaseAdmin } from "@/lib/supabase-admin";
export async function getLocationAccountContext(locationId:string){const {data,error}=await supabaseAdmin.from("crm_account_locations").select("*,crm_accounts(id,name,primary_contact_id),crm_accounts!inner(crm_tasks(count),crm_opportunities(count))").eq("location_id",locationId).eq("status","active").order("is_primary_location",{ascending:false}).limit(20);if(error)throw error;return data||[]}

