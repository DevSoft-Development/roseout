const BASE_URL = process.env.SEARCH_TEST_BASE_URL || "http://localhost:3000";

const queries = [
  "steak dinner",
  "sushi dinner",
  "rooftop dinner in Long Island City",
  "steak dinner with bowling in Astoria",
  "hookah lounge after steak dinner",
];

function hasBadRawError(value) {
  const text = JSON.stringify(value || {}).toLowerCase();

  return (
    text.includes("string did not match") ||
    text.includes("expected pattern") ||
    text.includes("invalid url") ||
    text.includes("unexpected token")
  );
}

for (const input of queries) {
  const response = await fetch(`${BASE_URL}/api/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input }),
  });

  const raw = await response.text();

  let data;

  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`Search response was not JSON for: ${input}`);
  }

  if (!response.ok) {
    throw new Error(`Search returned HTTP ${response.status} for: ${input}`);
  }

  if (hasBadRawError(data)) {
    throw new Error(`Raw runtime error leaked for: ${input}`);
  }

  console.log("PASS", input, {
    success: data.success,
    error: data.error || null,
    restaurants: data.restaurants?.length || 0,
    activities: data.activities?.length || 0,
    pairs: data.pairs?.length || 0,
    render_mode: data.render_mode,
  });
}
