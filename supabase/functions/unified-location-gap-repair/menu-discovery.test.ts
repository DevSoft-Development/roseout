import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  deriveMenuIntelligence,
  discoverMenu,
  extractMenuLinkCandidates,
  extractStructuredMenuData,
  MENU_INTELLIGENCE_VERSION,
} from "./menu-discovery.ts";

Deno.test("structured menu data finds hasMenu, MenuItem names, and explicit cuisine", () => {
  const html = `<script type="application/ld+json">${JSON.stringify({
    "@type": "Restaurant",
    servesCuisine: ["Italian", "Seafood"],
    hasMenu: "/menu",
    subjectOf: {
      "@type": "Menu",
      hasMenuSection: [{
        "@type": "MenuSection",
        hasMenuItem: [
          { "@type": "MenuItem", name: "Lobster Rigatoni" },
          { "@type": "MenuItem", name: "Oysters on the Half Shell" },
        ],
      }],
    },
  })}</script>`;
  const data = extractStructuredMenuData(html, "https://venue.example/");
  assertEquals(data.menuUrls, ["https://venue.example/menu"]);
  assertEquals(data.menuItems.includes("lobster rigatoni"), true);
  assertEquals(data.menuItems.includes("oysters on the half shell"), true);
  assertEquals(data.cuisines, ["italian", "seafood"]);
});

Deno.test("menu link candidates prioritize explicit official menu links", () => {
  const html = `
    <a href="/about">About</a>
    <a href="/menu">Our Menu</a>
    <a href="https://instagram.com/example">Menu photos</a>
  `;
  const candidates = extractMenuLinkCandidates(html, "https://venue.example/");
  assertEquals(candidates[0]?.url, "https://venue.example/menu");
  assertEquals(candidates.some((candidate) => candidate.url.includes("instagram.com")), false);
});

Deno.test("menu intelligence extracts deterministic first-party search terms", async () => {
  const html = `
    <script type="application/ld+json">${JSON.stringify({
      "@type": "Restaurant",
      servesCuisine: "Italian",
      hasMenu: {
        "@type": "Menu",
        hasMenuSection: [{
          "@type": "MenuSection",
          hasMenuItem: [{ "@type": "MenuItem", name: "Tomahawk Steak" }],
        }],
      },
    })}</script>
    <main>
      Brunch Menu. Halal options available. Lobster tail, oysters, rigatoni and cocktails.
      Espresso martinis and a prix fixe tasting menu are available.
    </main>
  `;
  const result = await deriveMenuIntelligence(html, "https://venue.example/menu");
  assertEquals(result.version, MENU_INTELLIGENCE_VERSION);
  assert(result.signatureItems.includes("tomahawk steak"));
  assert(result.foodTerms.includes("steak"));
  assert(result.foodTerms.includes("lobster"));
  assert(result.foodTerms.includes("oysters"));
  assert(result.foodTerms.includes("pasta"));
  assert(result.dietaryTerms.includes("halal"));
  assert(result.mealPeriods.includes("brunch"));
  assert(result.drinkTerms.includes("cocktails"));
  assert(result.featureTerms.includes("prix fixe"));
  assertEquals(result.cuisineTerms, ["italian"]);
  assertEquals(result.contentHash.length, 64);
});

Deno.test("discoverMenu follows official homepage menu link and analyzes same-origin HTML", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname === "/") {
      return Promise.resolve(new Response('<a href="/menu">Menu</a>', {
        status: 200,
        headers: { "content-type": "text/html" },
      }));
    }
    if (url.pathname === "/menu") {
      return Promise.resolve(new Response('<main>Dinner menu: lobster, sushi, vegan dishes, cocktails and wine.</main>', {
        status: 200,
        headers: { "content-type": "text/html" },
      }));
    }
    return Promise.resolve(new Response("missing", { status: 404 }));
  }) as typeof fetch;
  try {
    const result = await discoverMenu("https://venue.example", { analyzeContent: true });
    assertEquals(result.status, "found");
    assertEquals(result.menuUrl, "https://venue.example/menu");
    assertEquals(result.source, "website_link");
    assert(result.intelligence?.foodTerms.includes("lobster"));
    assert(result.intelligence?.foodTerms.includes("sushi"));
    assert(result.intelligence?.dietaryTerms.includes("vegan"));
    assert(result.intelligence?.drinkTerms.includes("cocktails"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("discoverMenu records official PDF menu without pretending to extract intelligence", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.pathname === "/") {
      return Promise.resolve(new Response('<a href="/assets/dinner-menu.pdf">Dinner Menu</a>', {
        status: 200,
        headers: { "content-type": "text/html" },
      }));
    }
    if (url.pathname === "/assets/dinner-menu.pdf") {
      return Promise.resolve(new Response("%PDF fake", {
        status: 200,
        headers: { "content-type": "application/pdf" },
      }));
    }
    return Promise.resolve(new Response("missing", { status: 404 }));
  }) as typeof fetch;
  try {
    const result = await discoverMenu("https://venue.example", { analyzeContent: true });
    assertEquals(result.status, "found");
    assertEquals(result.menuUrl, "https://venue.example/assets/dinner-menu.pdf");
    assertEquals(result.intelligence, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("discoverMenu accepts an officially linked trusted menu provider but does not crawl it for intelligence", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.hostname === "venue.example") {
      return Promise.resolve(new Response('<a href="https://order.toasttab.com/online/example">View Menu</a>', {
        status: 200,
        headers: { "content-type": "text/html" },
      }));
    }
    if (url.hostname === "order.toasttab.com") {
      return Promise.resolve(new Response("<main>Provider menu</main>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }));
    }
    return Promise.resolve(new Response("missing", { status: 404 }));
  }) as typeof fetch;
  try {
    const result = await discoverMenu("https://venue.example", { analyzeContent: true });
    assertEquals(result.status, "found");
    assertEquals(result.source, "website_linked_provider");
    assertEquals(result.intelligence, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
