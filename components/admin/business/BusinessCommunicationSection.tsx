import type { BusinessCRMRow } from "@/lib/admin-crm";

type Props = {
  business: Pick<BusinessCRMRow, "id" | "name" | "crm_status">;
  compact?: boolean;
};

export default function BusinessCommunicationSection({ business, compact = false }: Props) {
  return (
    <section className={`rounded-2xl border border-white/10 bg-white/[0.03] ${compact ? "p-4" : "p-5"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-black">Communication + Follow-up</h3>
        <span className="rounded-full border border-white/20 px-2 py-1 text-[11px] uppercase tracking-[0.2em] text-white/70">{business.crm_status}</span>
      </div>
      <div className="mt-3 grid gap-3 text-sm text-white/75 sm:grid-cols-2">
        <p>Email history: available in communication log.</p>
        <p>SMS history: available in communication log.</p>
        <p>Last contacted: —</p>
        <p>Next follow-up: —</p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {['Draft Email','Draft SMS','Mark Contacted','Schedule Follow-up','Add Quick Note'].map((label)=>(
          <button key={label} type="button" className="rounded-full border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-semibold hover:bg-white/10">{label}</button>
        ))}
      </div>
    </section>
  );
}
