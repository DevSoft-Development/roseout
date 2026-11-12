import {readFileSync} from "node:fs";
import {join} from "node:path";
import {describe,it,expect} from "vitest";
const file=(path:string)=>readFileSync(join(process.cwd(),path),"utf8");
const identity=file("lib/pos/sandbox-virtual-device.ts");
const auth=file("lib/pos/device-command-service.ts");
const admin=file("apps/business/app/api/pos/sandbox/device/route.ts");
const schema=file("supabase/migrations/20261014193000_pos_sandbox_virtual_device_identity.sql");
const table=file("app/api/pos/device/table-service/route.ts");
const sms=file("apps/business/app/api/pos/customer/text-to-pay/issue/route.ts");
const physical=file("app/api/pos/device/commands/route.ts");
describe("sandbox virtual POS device security boundaries",()=>{
 it("separates virtual identities from certified hardware",()=>{
  expect(schema).toContain("create table if not exists public.pos_sandbox_virtual_devices");
  expect(schema).not.toContain("insert into public.pos_hardware_devices");
  expect(schema).toContain("enable row level security");
  expect(schema).toContain("from public, anon, authenticated");
 });
 it("requires hidden Lounge, explicit flag, and thirty-minute expiry",()=>{
  expect(identity).toContain('POS_SANDBOX_VIRTUAL_DEVICES_ENABLED');
  expect(identity).toContain('is_hidden!==true');
  expect(identity).toContain('SANDBOX_LOUNGE_ID');
  expect(identity).toContain('Date.now()+30*60_000');
  expect(identity).toContain('crypto.randomBytes(32)');
  expect(identity).toContain('timingSafeEqual');
 });
 it("requires admin user session and same origin for issuance/revocation",()=>{
  expect(admin).toContain('new URL(origin).origin!==new URL(request.url).origin');
  expect(admin).toContain('["superadmin","admin"]');
  expect(admin).toContain('"demoHandoff" in viewer');
  expect(admin).toContain('revokeSandboxVirtualDevice');
 });
 it("opts only sandbox table service and checkout issuance into virtual credentials",()=>{
  expect(auth).toContain('if(input.allowSandboxVirtual!==true)');
  expect(table).toContain('allowSandboxVirtual:true');
  expect(sms).toContain('allowSandboxVirtual:true');
  expect(physical).not.toContain('allowSandboxVirtual:true');
 });
});
