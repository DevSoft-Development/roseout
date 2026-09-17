import "./launch-checklist.css";

import { requireAdminRole } from "@theouthaven/auth/admin-session";

export const metadata = {
  title: "Launch Checklist – Admin",
  description: "Production launch readiness checklist for TheOutHaven.",
};

const checks = [
  "Build status",
  "Stripe test status",
  "Email status",
  "SMS status",
  "Reservation status",
  "Review system status",
  "SEO status",
  "Mobile QA status",
] as const;

export default async function LaunchChecklistPage() {
  await requireAdminRole(["superadmin"]);

  return (
    <section className="launch-checklist-page">
      <header className="launch-checklist-hero">
        <p>Production Readiness</p>
        <h1>Launch Checklist</h1>
        <span>Track and confirm the critical gates required for launch.</span>
      </header>

      <section className="launch-checklist-grid">
        {checks.map((item) => (
          <article key={item}>
            <div>
              <strong>{item}</strong>
              <small>Status</small>
            </div>
            <span>Pending verification</span>
          </article>
        ))}
      </section>
    </section>
  );
}
