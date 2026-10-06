import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  createOpenTableDirectoryAdapter,
  discoverReservation,
  extractReservationLinks,
  isNonCrawlableWebsite,
  reservationMatch,
  reservationRecoveryPriority,
} from "./reservation-discovery.ts";

Deno.test("reservationMatch normalizes OpenTable URL", () => {
  assertEquals(
    reservationMatch("http://www.opentable.com/r/example?covers=2#times"),
    { url: "https://www.opentable.com/r/example?covers=2", provider: "OpenTable" },
  );
});

Deno.test("extractReservationLinks finds iframe and escaped provider URLs without duplicates", () => {
  const html = `<iframe src="https://resy.com/cities/ny/venues/example"></iframe><script>window.x="https:\\/\\/resy.com\\/cities\\/ny\\/venues\\/example?x=1\\u0026y=2"</script>`;
  const links = extractReservationLinks(html, new URL("https://venue.example/"));
  assertEquals(links.includes("https://resy.com/cities/ny/venues/example"), true);
  assertEquals(links.includes("https://resy.com/cities/ny/venues/example?x=1&y=2"), true);
  assertEquals(new Set(links).size, links.length);
});

Deno.test("non-crawlable social and delivery hosts are recognized", () => {
  assertEquals(isNonCrawlableWebsite("https://www.instagram.com/example"), true);
  assertEquals(isNonCrawlableWebsite("https://order.online/store/example"), true);
  assertEquals(isNonCrawlableWebsite("https://www.doordash.com/store/example"), true);
  assertEquals(isNonCrawlableWebsite("https://venue.example"), false);
});

Deno.test("discoverReservation skips non-crawlable third-party websites without fetching", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (() => {
    fetchCalls += 1;
    return Promise.resolve(new Response("blocked", { status: 403 }));
  }) as typeof fetch;
  try {
    const social = await discoverReservation("https://instagram.com/example");
    const delivery = await discoverReservation("https://order.online/store/example");
    assertEquals(social.status, "not_found");
    assertEquals(delivery.status, "not_found");
    assertEquals(social.note.includes("non-crawlable"), true);
    assertEquals(delivery.note.includes("non-crawlable"), true);
    assertEquals(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("discoverReservation finds provider on reservation page after clean homepage", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname === "/") return Promise.resolve(new Response("<html>No booking here</html>", { status: 200, headers: { "content-type": "text/html" } }));
    if (url.pathname === "/reservations") return Promise.resolve(new Response('<a href="https://resy.com/cities/ny/venues/example">Reserve</a>', { status: 200, headers: { "content-type": "text/html" } }));
    return Promise.resolve(new Response("not found", { status: 404 }));
  }) as typeof fetch;
  try {
    const result = await discoverReservation("https://venue.example");
    assertEquals(result.status, "found");
    assertEquals(result.match?.provider, "Resy");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("secondary 404 does not turn a successfully checked venue into failed", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname === "/") return Promise.resolve(new Response("<html>Venue</html>", { status: 200, headers: { "content-type": "text/html" } }));
    return Promise.resolve(new Response("not found", { status: 404 }));
  }) as typeof fetch;
  try {
    const result = await discoverReservation("https://venue.example");
    assertEquals(result.status, "not_found");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("403 and 429 classify blocked when no page succeeds", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => Promise.resolve(new Response("blocked", { status: 403 }))) as typeof fetch;
  try {
    assertEquals((await discoverReservation("https://venue.example")).status, "blocked");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("network failures classify failed when no page succeeds", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() => Promise.reject(new Error("network down"))) as typeof fetch;
  try {
    assertEquals((await discoverReservation("https://venue.example")).status, "failed");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("reservation recovery priority favors failed, blocked, recovered website, then unclassified", () => {
  assertEquals(reservationRecoveryPriority({ reservation_discovery_status: "failed", website: "https://a.example" }), 0);
  assertEquals(reservationRecoveryPriority({ reservation_discovery_status: "blocked", website: "https://a.example" }), 1);
  assertEquals(reservationRecoveryPriority({ reservation_discovery_status: "no_website", website: "https://a.example" }), 2);
  assertEquals(reservationRecoveryPriority({ reservation_discovery_status: null, website: "https://a.example" }), 3);
  assertEquals(reservationRecoveryPriority({ reservation_discovery_status: "not_found", website: "https://a.example" }), 4);
});

Deno.test("OpenTable adapter is disabled unless explicitly enabled and configured", () => {
  const values = new Map<string, string>();
  const env = { get: (name: string) => values.get(name) };
  let adapter = createOpenTableDirectoryAdapter(env);
  assertEquals(adapter.enabled, false);
  values.set("OPENTABLE_API_ENABLED", "true");
  adapter = createOpenTableDirectoryAdapter(env);
  assertEquals(adapter.enabled, false);
  values.set("OPENTABLE_API_BASE_URL", "https://approved.example");
  values.set("OPENTABLE_API_KEY", "secret");
  adapter = createOpenTableDirectoryAdapter(env);
  assertEquals(adapter.enabled, true);
});

Deno.test("OpenTable adapter never guesses an API request contract", async () => {
  const values = new Map<string, string>([
    ["OPENTABLE_API_ENABLED", "true"],
    ["OPENTABLE_API_BASE_URL", "https://approved.example"],
    ["OPENTABLE_API_KEY", "secret"],
  ]);
  const adapter = createOpenTableDirectoryAdapter({ get: (name: string) => values.get(name) });
  const result = await adapter.lookup({ name: "Example", address: "1 Main St" });
  assertEquals(result.status, "skipped");
});

Deno.test("extractReservationLinks finds booking URLs in data attributes and form actions", () => {
  const html = `<button data-booking-url="https://bookeo.com/example">Book</button><form action="https://xola.com/example"></form>`;
  const links = extractReservationLinks(html, new URL("https://venue.example/"));
  assertEquals(links.includes("https://bookeo.com/example"), true);
  assertEquals(links.includes("https://xola.com/example"), true);
});

Deno.test("discoverReservation detects reservation provider on external redirect", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname === "/") {
      return Promise.resolve(new Response("", { status: 302, headers: { location: "https://resy.com/cities/ny/venues/example" } }));
    }
    return Promise.resolve(new Response("not found", { status: 404 }));
  }) as typeof fetch;
  try {
    const result = await discoverReservation("https://venue.example");
    assertEquals(result.status, "found");
    assertEquals(result.match?.provider, "Resy");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("discoverReservation follows discovered custom booking path without Google", async () => {
  const originalFetch = globalThis.fetch;
  const seen: string[] = [];
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = new URL(String(input));
    seen.push(url.pathname);
    if (url.pathname === "/") {
      return Promise.resolve(new Response('<a href="/private-events/book-now">Private events</a>', { status: 200, headers: { "content-type": "text/html" } }));
    }
    if (url.pathname === "/private-events/book-now") {
      return Promise.resolve(new Response('<iframe src="https://sevenrooms.com/reservations/example"></iframe>', { status: 200, headers: { "content-type": "text/html" } }));
    }
    return Promise.resolve(new Response("not found", { status: 404 }));
  }) as typeof fetch;
  try {
    const result = await discoverReservation("https://venue.example");
    assertEquals(result.status, "found");
    assertEquals(result.match?.provider, "SevenRooms");
    assertEquals(seen.includes("/private-events/book-now"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("additional activity reservation providers are recognized", () => {
  assertEquals(reservationMatch("https://bookeo.com/example")?.provider, "Bookeo");
  assertEquals(reservationMatch("https://example.roller.app/book")?.provider, "ROLLER");
  assertEquals(reservationMatch("https://xola.com/example")?.provider, "Xola");
  assertEquals(reservationMatch("https://rezdy.com/example")?.provider, "Rezdy");
});


Deno.test("extractReservationLinks parses JSON-LD reservation actions", () => {
  const html = `<script type="application/ld+json">{"@context":"https://schema.org","potentialAction":{"@type":"ReserveAction","target":"https://www.opentable.com/r/example"}}</script>`;
  const links = extractReservationLinks(html, new URL("https://venue.example/"));
  assertEquals(links.includes("https://www.opentable.com/r/example"), true);
});

Deno.test("discoverReservation follows reservation intent anchor text even on custom paths", async () => {
  const originalFetch = globalThis.fetch;
  const seen: string[] = [];
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = new URL(String(input));
    seen.push(url.pathname);
    if (url.pathname === "/") {
      return Promise.resolve(new Response('<a href="/go/now">Book a table</a>', { status: 200, headers: { "content-type": "text/html" } }));
    }
    if (url.pathname === "/go/now") {
      return Promise.resolve(new Response('<iframe src="https://resy.com/cities/ny/venues/example"></iframe>', { status: 200, headers: { "content-type": "text/html" } }));
    }
    return Promise.resolve(new Response("not found", { status: 404 }));
  }) as typeof fetch;
  try {
    const result = await discoverReservation("https://venue.example");
    assertEquals(result.status, "found");
    assertEquals(result.match?.provider, "Resy");
    assertEquals(seen.includes("/go/now"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("extractReservationLinks detects meta refresh provider destinations", () => {
  const html = '<meta http-equiv="refresh" content="0; url=https://sevenrooms.com/reservations/example">';
  const links = extractReservationLinks(html, new URL("https://venue.example/"));
  assertEquals(links.includes("https://sevenrooms.com/reservations/example"), true);
});
