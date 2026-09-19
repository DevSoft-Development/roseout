import {
  ACTIVE_WAITLIST_STATUSES,
  TERMINAL_WAITLIST_STATUSES,
  handleReserveWaitlistGET,
  handleReserveWaitlistPOST,
  normalizeWaitlistRow,
} from "@/lib/reserve/waitlist-service";

export {
  ACTIVE_WAITLIST_STATUSES,
  TERMINAL_WAITLIST_STATUSES,
  normalizeWaitlistRow,
};

// Compatibility wrapper: new production code should call /api/reserve/portal/waitlist.
export const GET = handleReserveWaitlistGET;
export const POST = handleReserveWaitlistPOST;
