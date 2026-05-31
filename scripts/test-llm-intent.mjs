const BASE_URL = process.env.SEARCH_TEST_BASE_URL || "http://localhost:3000";

const queries = [
  "steak dinner",
  "romantic rooftop dinner in Long Island City",
  "steak dinner with bowling in Astoria",
  "hookah lounge after sushi in Brooklyn",
  "restaurant with activity walking distance in Queens",
  "sushi before karaoke near Times Square",
];

for (const q of queries) {
  const response = await fetch(
    `${BASE_URL}/api/debug/search-with-llm?q=${encodeURIComponent(q)}`,
  );

  const data = await response.json();

  if (!data.ok) {
    throw new Error(`Search with LLM failed for "${q}": ${data.error}`);
  }

  if (q === "steak dinner") {
    if ((data.restaurants || 0) < 1) {
      throw new Error("steak dinner should return restaurant results.");
    }

    if (data.render_mode !== "restaurant_cards") {
      throw new Error(
        `steak dinner should render restaurant_cards, got ${data.render_mode}`,
      );
    }
  }

  console.log("PASS", q, {
    restaurants: data.restaurants,
    activities: data.activities,
    pairs: data.pairs,
    render_mode: data.render_mode,
    llmError: data.llmError,
  });
}
