import "./websites.css";

import { requireAdminRole } from "@theouthaven/auth/admin-session";
import WebsiteResetClient from "./WebsiteResetClient";

export const dynamic = "force-dynamic";

export default async function GeneratedWebsitesSettingsPage() {
  await requireAdminRole(["superadmin"]);

  return (
    <section className="websites-page">
      <header>
        <small>Admin Settings · Website operations</small>
        <h1>Generated Websites</h1>
        <p>
          Review generated location websites and reset one website at a time for
          testing or operations. Location records and registered domains remain
          intact.
        </p>
      </header>

      <WebsiteResetClient />
    </section>
  );
}
