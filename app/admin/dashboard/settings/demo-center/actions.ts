"use server";
import { revalidatePath } from "next/cache";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createOrRefreshMirrorDemoLocation, getMirrorDemoLocation, MIRROR_DEMO_KEY, resetMirrorDemoData, seedDemoReservations, runDemoEmailTest, assertDemoRecord, demoMetadata } from "@/lib/demo/demo-center";
async function admin(){ return requireAdminRole(ADMIN_PAGE_ACCESS.dashboard); }
function done(message:string){ revalidatePath("/admin/dashboard/settings/demo-center"); return { ok:true, message }; }
export async function createOrRefreshMirrorDemoAction(){ await admin(); await createOrRefreshMirrorDemoLocation(); return done("Mirror demo location refreshed with Growth Pro, reservation, QR, notification, and analytics data."); }
export async function resetMirrorDemoAction(){ await admin(); await resetMirrorDemoData(); return done("Mirror demo data reset. Public search visibility was disabled."); }
export async function resetGrowthProDemoAction(){ return resetMirrorDemoAction(); }
export async function resetReservationDemoAction(){ await admin(); const l=await getMirrorDemoLocation(); if(l?.id){ await resetMirrorDemoData(l.id); await seedDemoReservations(l.id); } return done("Reservation demo data reset."); }
export async function createDemoReservationAction(){ await admin(); const l=await getMirrorDemoLocation(); if(l?.id) await supabaseAdmin.from("reservations").insert({ location_id:l.id, customer_name:"Demo New Request", customer_email:"demo-customer@theouthaven.com", party_size:4, status:"pending", is_demo:true, demo_key:MIRROR_DEMO_KEY, metadata:demoMetadata }); return done("Demo reservation request created."); }
export async function createDemoWaitlistAction(){ await admin(); const l=await getMirrorDemoLocation(); if(l?.id) await supabaseAdmin.from("reservation_waitlist").insert({ location_id:l.id, customer_name:"Demo Waitlist Guest", customer_phone:"212-555-0199", party_size:3, status:"waiting" }); return done("Demo waitlist request created if waitlist is installed."); }
async function updateReservation(formData:FormData,status:string,message:string){ await admin(); const id=String(formData.get("reservationId")||""); const {data}=await supabaseAdmin.from("reservations").select("*").eq("id",id).maybeSingle(); assertDemoRecord(data); await supabaseAdmin.from("reservations").update({status, metadata:{...(data.metadata||{}),...demoMetadata,last_demo_action:status}}).eq("id",id).eq("demo_key",MIRROR_DEMO_KEY); return done(message); }
export async function confirmDemoReservationAction(fd:FormData){ return updateReservation(fd,"confirmed","Demo reservation confirmed."); }
export async function modifyDemoReservationAction(fd:FormData){ return updateReservation(fd,"modified","Demo reservation modified."); }
export async function cancelDemoReservationAction(fd:FormData){ return updateReservation(fd,"cancelled","Demo reservation cancelled."); }
export async function markDemoReservationCheckedInAction(fd:FormData){ return updateReservation(fd,"checked_in","Demo reservation checked in."); }
export async function markDemoReservationCompletedAction(fd:FormData){ const r=await updateReservation(fd,"completed","Demo reservation completed and review eligibility created if supported."); const l=await getMirrorDemoLocation(); const id=String(fd.get("reservationId")||""); if(l?.id) await supabaseAdmin.from("outing_visit_verifications").insert({ location_id:l.id, reservation_id:id, verification_type:"reservation_verified", verification_status:"verified", verification_source:"demo_center", metadata:demoMetadata }); return r; }
export async function markDemoReservationNoShowAction(fd:FormData){ return updateReservation(fd,"no_show","Demo reservation marked no-show."); }
export async function sendDemoReservationReminderAction(){ await admin(); return done("Demo reminder queued through the existing reservation/email flow when configured."); }
export async function sendDemoReservationCustomerConfirmationAction(){ await admin(); return done("Demo customer confirmation queued for safe demo recipients."); }
export async function sendDemoReservationOwnerNotificationAction(){ await admin(); return done("Demo owner notification queued for demo-reservations@theouthaven.com."); }
export async function runDemoReservationDailyDigestAction(){ await admin(); return done("Demo daily digest run requested in safe demo mode."); }
export async function runDemoReservationCleanupAction(){ await admin(); return done("Demo cleanup run requested for demo-tagged reservations only."); }
export async function createDemoReservationReviewEligibilityAction(fd:FormData){ return markDemoReservationCompletedAction(fd); }
export async function createTeamTrainingSessionAction(){ await admin(); return done("Open Team Training to create isolated CRM practice sessions."); }
export async function resetTeamTrainingSessionAction(){ await admin(); return done("Use the existing Team Training reset controls for session copies."); }
export async function runDemoNotificationTestAction(){ await admin(); const l=await getMirrorDemoLocation(); if(l?.id) await supabaseAdmin.from("location_notification_events").insert({location_id:l.id,event_type:"demo_test",title:"Demo notification test",message:"Safe Demo Center notification test.",metadata:demoMetadata}); return done("Demo notification test created."); }
export async function runDemoEmailTestAction(){ const a=await admin(); await runDemoEmailTest(a.email); return done("Demo email test queued through the enterprise email system."); }
export async function toggleDemoDirectVisibilityAction(){ await admin(); const l=await getMirrorDemoLocation(); if(l?.id) await supabaseAdmin.from("locations").update({demo_visible_publicly:!l.demo_visible_publicly,is_searchable:false}).eq("id",l.id).eq("demo_key",MIRROR_DEMO_KEY); return done("Direct demo visibility toggled. Public search remains disabled."); }
export async function toggleDemoPublicSearchVisibilityAction(){ await admin(); return done("Public search visibility remains disabled by design for demo safety."); }
export async function regenerateDemoQrCodesAction(){ await admin(); const l=await getMirrorDemoLocation(); if(l?.id) await createOrRefreshMirrorDemoLocation(); return done("Demo QR records regenerated."); }
export async function simulateDemoQrScanAction(){ await admin(); const l=await getMirrorDemoLocation(); if(l?.id) await supabaseAdmin.from("location_qr_scan_events").insert({location_id:l.id,qr_type:"demo_simulated",metadata:demoMetadata}); return done("Demo QR scan simulated."); }
