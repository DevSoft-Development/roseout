import { AlertTriangle, ExternalLink, PlusCircle, RefreshCw, ScanLine, ShieldAlert, Smartphone, Wifi } from "lucide-react";

import { AdminSectionCard, AdminStatusBadge } from "@/components/admin/AdminDesignSystem";

type Props = {
  appleConnected: boolean;
  managementServiceName?: string | null;
};

export function AppleConfiguratorEnrollmentGuide({ appleConnected, managementServiceName }: Props) {
  return (
    <AdminSectionCard className="p-5 sm:p-6">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-2xl border border-rose-300/20 bg-rose-500/10 p-2.5 text-rose-100">
              <PlusCircle className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-rose-200">Add a company device</p>
              <h2 className="mt-1 text-lg font-black text-white">Enroll with Apple Configurator</h2>
            </div>
            <AdminStatusBadge tone={appleConnected ? "green" : "amber"}>
              {appleConnected ? "Apple connected" : "Apple connection required"}
            </AdminStatusBadge>
          </div>
          <p className="mt-3 text-sm font-semibold leading-6 text-white/55">
            Choose the path that matches the physical device. New or already-erased devices can go straight into Setup Assistant. Devices already in use should be backed up and erased before Configurator onboarding so Apple Business Manager and Intune can take ownership cleanly.
          </p>
        </div>

        <a
          href="https://apps.apple.com/us/app/apple-configurator/id1588794674"
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-black text-white transition hover:bg-white/10"
        >
          Open Apple Configurator <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <div className="rounded-3xl border border-emerald-300/15 bg-emerald-500/5 p-5">
          <div className="flex items-center gap-3">
            <span className="rounded-2xl border border-emerald-300/15 bg-emerald-500/10 p-2.5 text-emerald-100"><Smartphone className="h-5 w-5" /></span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-200/80">Path A</p>
              <h3 className="mt-1 text-base font-black text-white">New or already erased device</h3>
            </div>
          </div>
          <ol className="mt-4 space-y-3 text-sm font-semibold leading-6 text-white/55">
            <li><span className="font-black text-white">1.</span> Power on the iPhone or iPad and begin Setup Assistant.</li>
            <li><span className="font-black text-white">2.</span> Stop at the Wi-Fi selection screen before completing setup.</li>
            <li><span className="font-black text-white">3.</span> Use Apple Configurator to add the device to Apple Business Manager only; skip direct device-management enrollment in Configurator.</li>
            <li><span className="font-black text-white">4.</span> Return here, refresh, then click <span className="font-black text-white">Activate Device</span>.</li>
          </ol>
          <div className="mt-4 rounded-2xl border border-emerald-300/10 bg-black/15 px-4 py-3 text-xs font-semibold leading-5 text-emerald-100/70">
            Best option for brand-new company hardware because no user data needs to be moved first.
          </div>
        </div>

        <div className="rounded-3xl border border-amber-300/20 bg-amber-500/5 p-5">
          <div className="flex items-center gap-3">
            <span className="rounded-2xl border border-amber-300/20 bg-amber-500/10 p-2.5 text-amber-100"><ShieldAlert className="h-5 w-5" /></span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-200/80">Path B</p>
              <h3 className="mt-1 text-base font-black text-white">Device already in use</h3>
            </div>
          </div>
          <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-500/10 px-4 py-3">
            <div className="flex gap-2 text-amber-100"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><p className="text-xs font-black">This path requires an erase before Configurator enrollment.</p></div>
            <p className="mt-1 text-xs font-semibold leading-5 text-amber-100/65">Back up any company data that must be retained before continuing. Do not erase a device until the backup or data-transfer requirement has been confirmed.</p>
          </div>
          <ol className="mt-4 space-y-3 text-sm font-semibold leading-6 text-white/55">
            <li><span className="font-black text-white">1.</span> Confirm required work data is backed up or otherwise retained.</li>
            <li><span className="font-black text-white">2.</span> Sign out or remove activation-lock dependencies as required by your company handoff process.</li>
            <li><span className="font-black text-white">3.</span> Erase the iPhone or iPad and return it to Setup Assistant.</li>
            <li><span className="font-black text-white">4.</span> Follow the same Configurator pairing flow as a new device, then refresh this page and activate it.</li>
          </ol>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-center gap-2 text-white"><Smartphone className="h-4 w-4" /><p className="text-sm font-black">1. Start Setup Assistant</p></div>
          <p className="mt-2 text-xs font-semibold leading-5 text-white/45">Use a new device or an erased existing device and stop on the Wi-Fi selection screen.</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-center gap-2 text-white"><ScanLine className="h-4 w-4" /><p className="text-sm font-black">2. Pair with Configurator</p></div>
          <p className="mt-2 text-xs font-semibold leading-5 text-white/45">Use Apple Configurator to add the device to Apple Business Manager. Configurator is only the Apple bootstrap step; TheOutHaven handles Intune afterward.</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-center gap-2 text-white"><Wifi className="h-4 w-4" /><p className="text-sm font-black">3. Wait for Apple</p></div>
          <p className="mt-2 text-xs font-semibold leading-5 text-white/45">Configurator uploads the device into Apple Business Manager. This browser page cannot bypass that physical Apple step.</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-center gap-2 text-white"><RefreshCw className="h-4 w-4" /><p className="text-sm font-black">4. Refresh here</p></div>
          <p className="mt-2 text-xs font-semibold leading-5 text-white/45">The serial will appear below. Click Activate Device and TheOutHaven assigns Apple Business Manager to {managementServiceName || "your management service"}, syncs ADE, assigns the iOS enrollment profile, and applies Standard Managed Device.</p>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-amber-300/15 bg-amber-500/5 px-4 py-3 text-xs font-semibold leading-5 text-amber-100/70">
        Apple Configurator-added devices can have a provisional enrollment period. Do not hand the device to an employee until it is assigned to Intune and the required enrollment profile has been confirmed.
      </div>
    </AdminSectionCard>
  );
}
