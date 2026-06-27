import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
export async function GET(_:Request,{params}:{params:Promise<{locationId:string}>}){const {locationId}=await params; const {data:pages}=await supabaseAdmin.from("location_commerce_pages").select("*,location_commerce_sections(*),location_commerce_items(*)").eq("location_id",locationId).eq("is_active",true).order("sort_order"); return NextResponse.json({pages:pages||[]});}
