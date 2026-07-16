"use client";

/**
 * Deprecated duplicate control.
 *
 * PublishabilityRepairButton is the single source of truth for repair and
 * approval actions. This compatibility component no longer renders a second
 * button. It also keeps the CRM hero metrics directly beneath the status chips
 * on desktop instead of leaving an empty column beside the action panel.
 */
export default function RepairPublishabilityButton(_props: { locationId: string }) {
  return (
    <style jsx global>{`
      @media (min-width: 1280px) {
        main.admin-page-shell > div > div.space-y-6 > section:first-child {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 390px;
          column-gap: 1.25rem;
          align-items: start;
        }

        main.admin-page-shell > div > div.space-y-6 > section:first-child > div:first-child {
          display: contents;
        }

        main.admin-page-shell > div > div.space-y-6 > section:first-child > div:first-child > div:first-child {
          grid-column: 1;
          grid-row: 1;
        }

        main.admin-page-shell > div > div.space-y-6 > section:first-child > div:first-child > aside {
          grid-column: 2;
          grid-row: 1 / span 2;
        }

        main.admin-page-shell > div > div.space-y-6 > section:first-child > div:nth-child(2) {
          grid-column: 1;
          grid-row: 2;
          margin-top: 1.25rem;
        }
      }
    `}</style>
  );
}
