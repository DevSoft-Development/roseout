export const ML_FEEDBACK_SCHEMA_VERSION = "ml_feedback_v1" as const;

export const ML_FEEDBACK_SIGNALS = {
  impression: { weight: 0, polarity: "neutral" },
  view: { weight: 0.25, polarity: "positive" },
  click: { weight: 1, polarity: "positive" },
  website_click: { weight: 1.5, polarity: "positive" },
  directions_opened: { weight: 1.75, polarity: "positive" },
  phone_call: { weight: 2, polarity: "positive" },
  saved: { weight: 2.5, polarity: "positive" },
  reservation_started: { weight: 3, polarity: "positive