"use client";

import { useState } from "react";
import type { DomainBenefitSettings } from "@/lib/domains/benefit-settings";

export default function DomainBenefitSettingsClient({
  initial,
}: {
  initial: DomainBenefitSettings;
}) {
  const [settings, setSettings] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function save() {
    setSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/admin/settings/domain-benefit", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "Unable to save settings.");
      }

      setSettings(data.settings);
      setMessage("Domain benefit settings saved.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to save settings.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="domain-benefit-card">
      <small>Partner Pro</small>
      <h2>Included Domain Benefit</h2>
      <p>
        Control whether Partner Pro includes a first-year domain and whether
        TheOutHaven sponsors future renewals.
      </p>

      <div className="domain-benefit-grid">
        <label>
          <input
            type="checkbox"
            checked={settings.firstYearIncluded}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                firstYearIncluded: event.target.checked,
                renewalIncluded: event.target.checked
                  ? current.renewalIncluded
                  : false,
              }))
            }
          />
          <span>
            <b>Free first-year domain</b>
            <small>
              Eligible Partner Pro locations can claim one standard domain with
              the first registration year included.
            </small>
          </span>
        </label>

        <label>
          <input
            type="checkbox"
            checked={settings.renewalIncluded}
            disabled={!settings.firstYearIncluded}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                renewalIncluded: event.target.checked,
              }))
            }
          />
          <span>
            <b>Free renewal</b>
            <small>
              Eligible renewals stay sponsored when enabled; otherwise only the
              first registration year is included.
            </small>
          </span>
        </label>
      </div>

      <div className="domain-benefit-offer">
        Customer offer:{" "}
        {settings.firstYearIncluded
          ? settings.renewalIncluded
            ? "First year and eligible renewals included."
            : "First year included; renewal is not included."
          : "Included domain offer is off."}
      </div>

      <button type="button" onClick={save} disabled={saving}>
        {saving ? "Saving…" : "Save domain settings"}
      </button>

      {message ? <p className="domain-benefit-message">{message}</p> : null}
    </section>
  );
}
