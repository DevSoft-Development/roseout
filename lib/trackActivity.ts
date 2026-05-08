export async function trackActivity({
  userId,
  eventType,
  eventName,
  pagePath,
  metadata = {},
}: {
  userId?: string | null;
  eventType: string;
  eventName?: string;
  pagePath?: string;
  metadata?: Record<string, any>;
}) {
  try {
    let sessionId = localStorage.getItem("theouthaven_session_id");

    if (!sessionId) {
      sessionId = crypto.randomUUID();
      localStorage.setItem("theouthaven_session_id", sessionId);
    }

    await fetch("/api/activity/track", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: userId || null,
        session_id: sessionId,
        event_type: eventType,
        event_name: eventName,
        page_path: pagePath || window.location.pathname,
        metadata,
      }),
    });
  } catch {
    // silent fail
  }
}