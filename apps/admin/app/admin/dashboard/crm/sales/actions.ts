"use server";

import { redirect } from "next/navigation";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { CRM_WRITE_ROLES } from "@/lib/crm/permissions";
import { createOpportunity } from "@/lib/crm/opportunities";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { listPermittedCrmLocationIds } from "@/lib/crm/location-scope";
import type { PipelineKey } from "@/lib/crm/pipelines";

const PRODUCT_MAP: Record<string,{pipeline:PipelineKey;productKey:string;label:string}> = {
  claim:{pipeline:"business_claim",productKey:"business_claim",label:"Business Claim"},
  essentials:{pipeline:"partnership",productKey:"essentials_plus",label:"Essentials+"},
  reserve:{pipeline:"reserve_pro",productKey:"reserve",label:"Reserve"},
  website:{pipeline:"partnership",productKey:"website",label:"Website"},
  marketing:{pipeline:"partnership",productKey:"marketing",label:"Email / SMS Marketing"},
  promoted_listing:{pipeline:"promoted_listing",productKey:"promoted_listing",label:"Promoted Listing"},
  events_experiences:{pipeline:"partnership",productKey:"events_experiences",label:"Events / Experiences"},
  renewal_expansion:{pipeline:"renewal_expansion",productKey:"renewal_expansion",label:"Renewal / Expansion"},
};

async function ensureAccount(locationId:string){
  const db=getAdminDatabaseClient();
  const {data:link}=await db.from("crm_account_locations").select("account_id").eq("location_id",locationId).eq("status","active").limit(1).maybeSingle();
  if(link?.account_id)return link.account_id;
  const {data:location,error}=await db.from("locations").select("id,name,business_name,restaurant_name,activity_name,website,phone,owner_email,location_type,category").eq("id",locationId).single();
  if(error||!location)throw error||new Error("Location not found");
  const name=String(location.name||location.business_name||location.restaurant_name||location.activity_name||"Business");
  const {data:account,error:accountError}=await db.from("crm_accounts").insert({
    name,
    account_type:"independent_business",
    lifecycle_stage:"prospect",
    status:"active",
    website:location.website||null,
    phone:location.phone||null,
    email:location.owner_email||null,
    industry:location.location_type||location.category||null,
    source:"unified_sales_workspace",
    source_detail:"ambassador_qualified_product_gap",
    external_reference:`location:${locationId}`,
    metadata:{location_id:locationId,association_reason:"ambassador_qualified_product_gap"},
  }).select("id").single();
  if(accountError)throw accountError;
  const {error:linkError}=await db.from("crm_account_locations").insert({
    account_id:account.id,
    location_id:locationId,
    relationship_type:"operator",
    is_primary_location:true,
    status:"active",
    source:"unified_sales_workspace",
    metadata:{automatic:true},
  });
  if(linkError)throw linkError;
  return account.id;
}

export async function qualifyProductOpportunityAction(form:FormData){
  const actor=await requireAdminRole(CRM_WRITE_ROLES);
  const locationId=String(form.get("location_id")||"");
  const product=String(form.get("product")||"");
  const mapping=PRODUCT_MAP[product];
  if(!locationId||!mapping)throw new Error("Invalid sales opportunity request");

  const permitted=await listPermittedCrmLocationIds(actor.user_id,actor.role);
  if(Array.isArray(permitted)&&!permitted.includes(locationId))throw new Error("Location is outside your CRM scope");

  const db=getAdminDatabaseClient();
  const {data:existing}=await db.from("crm_opportunities")
    .select("id")
    .eq("primary_location_id",locationId)
    .eq("product_key",mapping.productKey)
    .eq("status","open")
    .is("archived_at",null)
    .limit(1)
    .maybeSingle();
  if(existing?.id)redirect(`/admin/dashboard/crm/opportunities/${existing.id}`);

  const accountId=await ensureAccount(locationId);
  const {data:location}=await db.from("locations").select("name,business_name,restaurant_name,activity_name").eq("id",locationId).single();
  const locationName=String(location?.name||location?.business_name||location?.restaurant_name||location?.activity_name||"Location");
  const created=await createOpportunity({
    account_id:accountId,
    name:`${locationName} — ${mapping.label}`,
    pipeline_key:mapping.pipeline,
    owner_user_id:actor.user_id,
    primary_location_id:locationId,
  },actor);
  await db.from("crm_opportunities").update({
    product_key:mapping.productKey,
    metadata:{unified_sales_generated:true,qualified_by_user_id:actor.user_id,qualified_product:product},
  }).eq("id",created.id);
  redirect(`/admin/dashboard/crm/opportunities/${created.id}`);
}
