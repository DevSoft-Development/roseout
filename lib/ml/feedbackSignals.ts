export const ML_FEEDBACK_SCHEMA_VERSION = "ml_feedback_v1" as const;

export const ML_FEEDBACK_SIGNALS = {
  impression: { weight: 0, polarity: "neutral" },
  view: { weight: 0.25, polarity: "positive" },
  click: { weight: 1, polarity: "positive" },
  website_click: { weight: 1.5, polarity: "positive" },
  directions_opened: { weight: 1.75, polarity: "positive" },
  phone_call: { weight: 2, polarity: "positive" },
  saved: { weight: 2.5, polarity: "positive" },
  reservation_started: { weight: 3, polarity: "positive" },
  reservation_completed: { weight: 5, polarity: "positive" },
  result_hidden: { weight: -2, polarity: "negative" },
} as const;

export type MlFeedbackSignalName = keyof typeof ML_FEEDBACK_SIGNALS;
export type MlFeedbackPolarity =
  (typeof ML_FEEDBACK_SIGNALS)[MlFeedbackSignalName]["polarity"];

export type MlFeedbackSignal = {
  schemaVersion: typeof ML_FEEDBACK_SCHEMA_VERSION;
  eventName: MlFeedbackSignalName;
  weight: number;
  polarity: MlFeedbackPolarity;
};

export function isMlFeedbackSignalName(
  value: unknown
): value is MlFeedbackSignalName {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(ML_FEEDBACK_SIGNALS, value)
  );
}

export function getMlFeedbackSignal(
  eventName: MlFeedbackSignalName
): MlFeedbackSignal {
  const signal = ML_FEEDBACK_SIGNALS[eventName];

  return {
    schemaVersion: ML_FEEDBACK_SCHEMA_VERSION,
    eventName,
    weight: signal.weight,
    polarity: signal.polarity,
  };
}
