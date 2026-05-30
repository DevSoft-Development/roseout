"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Template = { id: string; name?: string; channel?: string; subject?: string | null; body?: string | null };
type Log = { id: string; channel?: string; subject?: string | null; body?: string | null; to_address?: string | null; recipient?: string | null; status?: string | null; created_at?: string | null };

export default function CommunicationPanel({ locationId, defaultEmail, defaultPhone, templates, logs, canSend }: { locationId: string; defaultEmail?: string | null; defaultPhone?: string | null; templates: Template[]; logs: Log[]; canSend: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialChannel = searchParams.get("channel") === "sms" ? "sms" : "email";
  const [channel, setChannel] = useState<"email" | "sms">(initialChannel);
  const [to, setTo] = useState(initialChannel === "sms" ? defaultPhone || "" : defaultEmail || "");
  const [subject, setSubject] = useState(searchParams.get("subject") || "");
  const [body, setBody] = useState(searchParams.get("body") || "");
  const [templateId, setTemplateId] = useState("");
  const [saveTemplate, setSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const filteredTemplates = useMemo(() => templates.filter((template) => (template.channel || "email") === channel), [templates, channel]);

  function switchChannel(next: "email" | "sms") {
    setChannel(next);
    setTo(next === "email" ? defaultEmail || "" : defaultPhone || "");
    setTemplateId("");
  }

  function applyTemplate(id: string) {
    setTemplateId(id);
    const template = templates.find((item) => item.id === id);
    if (!template) return;
    setSubject(template.subject || "");
    setBody(template.body || "");
  }

  async function send() {
    setSending(true);
    setMessage(null);
    try {
      if (saveTemplate) {
        await fetch("/api/admin/communication/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: templateName || `CRM ${channel} ${new Date().toLocaleDateString()}`, channel, subject, body, category: "crm" }) });
      }
      const response = await fetch("/api/admin/communication/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel, to, subject, body, recipientType: "location", recipientId: locationId }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Message could not be sent.");
      setMessage("Message sent successfully.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Message could not be sent. Check provider settings and try again.");
    } finally {
      setSending(false);
    }
  }

  return <section className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
    <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <h2 className="text-xl font-black">Communication</h2>
      <p className="mt-2 text-sm text-white/55">Send location-specific email or SMS messages and keep outreach history connected to this CRM record.</p>
      <div className="mt-4 grid gap-3">
        <select value={channel} onChange={(e) => switchChannel(e.target.value === "sms" ? "sms" : "email")} disabled={!canSend} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white">
          <option value="email">Email</option><option value="sms">SMS</option>
        </select>
        <input value={to} onChange={(e) => setTo(e.target.value)} disabled={!canSend} placeholder={channel === "email" ? "owner@example.com" : "+15555555555"} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white placeholder:text-white/35" />
        <select value={templateId} onChange={(e) => applyTemplate(e.target.value)} disabled={!canSend} className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white"><option value="">Select template</option>{filteredTemplates.map((template) => <option key={template.id} value={template.id}>{template.name || "Template"}</option>)}</select>
        {channel === "email" ? <input value={subject} onChange={(e) => setSubject(e.target.value)} disabled={!canSend} placeholder="Subject" className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white placeholder:text-white/35" /> : null}
        <textarea value={body} onChange={(e) => setBody(e.target.value)} disabled={!canSend} rows={8} placeholder="Write your message..." className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white placeholder:text-white/35" />
        <label className="flex items-center gap-2 text-sm font-bold text-white/65"><input type="checkbox" checked={saveTemplate} onChange={(e) => setSaveTemplate(e.target.checked)} disabled={!canSend} /> Create custom template</label>
        {saveTemplate ? <input value={templateName} onChange={(e) => setTemplateName(e.target.value)} disabled={!canSend} placeholder="Template name" className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-white placeholder:text-white/35" /> : null}
        <button type="button" onClick={send} disabled={!canSend || sending || !to || !body} className="rounded-full bg-rose-600 px-6 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50">{sending ? "Sending..." : "Send"}</button>
        {message ? <p className="rounded-2xl border border-white/10 bg-black/20 p-3 text-sm text-white/70">{message}</p> : null}
        {!canSend ? <p className="text-sm text-white/45">Viewer role is read-only.</p> : null}
      </div>
    </article>
    <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <h3 className="text-lg font-black">Previous messages</h3>
      {logs.length ? <ul className="mt-4 space-y-2 text-sm text-white/70">{logs.map((log) => <li key={log.id} className="rounded-2xl border border-white/10 bg-black/20 p-3"><b>{log.channel || "message"}</b> · {log.subject || log.status || "Sent message"}<p className="mt-1 line-clamp-2 text-white/50">{log.body}</p><span className="mt-1 block text-xs text-white/35">{log.to_address || log.recipient || "location"} · {log.created_at ? new Date(log.created_at).toLocaleString() : "—"}</span></li>)}</ul> : <div className="mt-4 rounded-2xl border border-dashed border-white/15 bg-black/20 p-5 text-sm text-white/55">No messages have been sent to this location yet.</div>}
    </article>
  </section>;
}
