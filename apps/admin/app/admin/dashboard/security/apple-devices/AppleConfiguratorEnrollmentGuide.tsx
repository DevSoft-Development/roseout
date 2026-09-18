import { ExternalLink } from "lucide-react";

type Props = {
  appleConnected: boolean;
  managementServiceName?: string | null;
};

export function AppleConfiguratorEnrollmentGuide({
  appleConnected,
  managementServiceName,
}: Props) {
  return (
    <section className="apple-card">
      <div className="apple-guide-head">
        <div>
          <small>Add a company device</small>
          <h2>Enroll with Apple Configurator</h2>
          <p>
            New or already-erased devices can go straight into Setup Assistant.
            Devices already in use should be backed up and erased first so Apple
            Business Manager and Intune can take ownership cleanly.
          </p>
        </div>
        <a
          href="https://apps.apple.com/us/app/apple-configurator/id1588794674"
          target="_blank"
          rel="noreferrer"
        >
          Open Apple Configurator <ExternalLink />
        </a>
      </div>

      <div className="apple-guide-grid">
        <article>
          <b>Path A · New or erased</b>
          <ol>
            <li>Start Setup Assistant and stop at Wi-Fi.</li>
            <li>Open Apple Configurator on the enrollment iPhone.</li>
            <li>Pair and add the device to Apple Business Manager.</li>
            <li>Refresh this page and choose Prepare for Intune.</li>
          </ol>
        </article>
        <article>
          <b>Path B · Already in use</b>
          <ol>
            <li>Back up required company data.</li>
            <li>Remove activation-lock dependencies if needed.</li>
            <li>Erase the device and return to Setup Assistant.</li>
            <li>Run the same Configurator pairing flow, then prepare it here.</li>
          </ol>
        </article>
      </div>

      <div className="apple-guide-note">
        Apple connection: {appleConnected ? "connected" : "required"} · Management service:{" "}
        {managementServiceName || "not detected"}
      </div>
    </section>
  );
}
