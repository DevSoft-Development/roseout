"use client";

/**
 * Deprecated duplicate control.
 *
 * The CRM page still imports this component for backward compatibility, but
 * PublishabilityRepairButton is the single source of truth for repair and
 * approval actions. Returning null prevents two identical repair buttons from
 * being rendered while the older import is removed in a later page cleanup.
 */
export default function RepairPublishabilityButton(_props: { locationId: string }) {
  return null;
}
