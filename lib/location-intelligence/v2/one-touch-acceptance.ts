/** Deterministic first-import acceptance evidence; never counts deferred work as complete. */
export type OneTouchEvidence = {
 name?:unknown; address?:unknown; city?:unknown; state?:unknown;
 website?:unknown; main_image?:unknown; has_photos?:unknown;
 latitude?:unknown; longitude?:unknown; phone?:unknown;
 raw_payload?:unknown;
};
export function assessOneTouchImport(row:OneTouchEvidence) {
 const raw=(row.raw_payload && typeof row.raw_payload==="object" && !Array.isArray(row.raw_payload))
  ? row.raw_payload as Record<string,unknown>:{};
 const menu=(raw.li_v2_prepublication_menu && typeof raw.li_v2_prepublication_menu==="object" &&
  !Array.isArray(raw.li_v2_prepublication_menu))
  ? raw.li_v2_prepublication_menu as Record<string,unknown>:null;
 const profile=(raw.independent_profile && typeof raw.independent_profile==="object" &&
  !Array.isArray(raw.independent_profile))
  ? raw.independent_profile as Record<string,unknown>:{};
 // Each structured channel needs an explicit first-pass source check. A missing
 // value alone is not proof that the source was actually inspected.
 const fieldChecks=(raw.li_v2_prepublication_fields &&
   typeof raw.li_v2_prepublication_fields==="object" &&
   !Array.isArray(raw.li_v2_prepublication_fields))
   ?raw.li_v2_prepublication_fields as Record<string,unknown>:{};
 const channelKeys=["contact","email","reservationUrl","socialProfiles","openingHours","amenities"] as const;
 const structuredChannels=Object.fromEntries(channelKeys.map(key=>{
   const check=fieldChecks[key];
   if(!check||typeof check!=="object"||Array.isArray(check))return [key,false];
   const item=check as Record<string,unknown>;
   return [key,(item.status==="available"||item.status==="not_available")&&
     typeof item.sourceUrl==="string"&&item.sourceUrl.startsWith("https://") &&
     typeof item.checkedAt==="string"&&!Number.isNaN(Date.parse(item.checkedAt))];
 })) as Record<typeof channelKeys[number],boolean>;
 const required={
  identity:[row.name,row.address,row.city,row.state].every(v=>typeof v==="string"&&v.trim().length>0),
  coordinates:Number.isFinite(Number(row.latitude))&&Number.isFinite(Number(row.longitude)) &&
    Math.abs(Number(row.latitude))<=90&&Math.abs(Number(row.longitude))<=180,
  website:typeof row.website==="string"&&row.website.startsWith("https://"),
  primaryImage:typeof row.main_image==="string"&&row.main_image.length>0&&row.has_photos===true,
  structuredFields:Object.values(structuredChannels).every(Boolean),
  menuChecked:menu!==null&&typeof menu.status==="string"&&
    menu.status!=="error"&&menu.website===row.website,
 };
 const reviewSample=(raw.li_v2_initial_review_sample && typeof raw.li_v2_initial_review_sample==="object")
  ? raw.li_v2_initial_review_sample as Record<string,unknown>:null;
 const reviewState=reviewSample?.status==="imported"?"imported":
  (reviewSample?.status==="not_available" || reviewSample?.status==="unavailable")?"not_available":"pending_authorization";
 return {
  version:1,
  profileReady:Object.values(required).every(Boolean),
  oneTouchComplete:Object.values(required).every(Boolean)&&reviewState!=="pending_authorization",
  required,
  fieldAvailability:{
   phone:typeof row.phone==="string"&&row.phone.trim()?"available":"not_in_source",
   hours:profile.openStatus==="open"?"operating_status_verified":"not_in_source",
   amenities:profile.initialIntelligence?"source_checked":"not_in_source",
   structuredChannels,
   menu:required.menuChecked?"checked":"incomplete",
   reviews:reviewState,
  },
  missing:Object.entries(required).filter(([,ok])=>!ok).map(([name])=>name),
 };
}
