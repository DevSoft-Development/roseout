export const DEFAULT_SEARCH_LIMITS = {
  enabled: false,
  guestWeeklyLimit: 1,
  freeUserWeeklyLimit: 3,
  paidUserWeeklyLimit: null as number | null,
  betaUsersUnlimited: true,
  adminUsersUnlimited: true,
  window: "weekly",
  limitMode: "hard",
  upgradeCtaEnabled: true,
};

export type SearchUsageLimits = typeof DEFAULT_SEARCH_LIMITS;
