import { detectWebsiteImportAdapter, extractImportSignals } from "@/lib/websites/import-provider-adapters";

type Fixture = {
  host: string;
  html: string;
  expected: string;
  contentHint?: string;
  reservationHint?: string;
};

const fixtures: Fixture[] = [
  { host: "restaurant.example", html: '<html><link href="/wp-content/uploads/hero.jpg"><script src="/wp-includes/app.js"></script><a href="/wp-json/wp/v2/pages">Pages</a><a href="https://resy.com/cities/ny/example">Reserve</a></html>', expected: "wordpress", contentHint: "wp-json/wp/v2/pages", reservationHint: "reserve" },
  { host: "restaurant.example", html: '<html><img src="https://static.wixstatic.com/media/abc.jpg"><a href="/wix-data/menu">Menu</a><a href="/wixbookings">Book</a></html>', expected: "wix", contentHint: "wix-data", reservationHint: "wixbookings" },
  { host: "restaurant.example", html: '<html><div class="sqs-layout"><div class="sqs-block">Menu</div></div><img src="https://images.squarespace-cdn.com/a.jpg"><a href="https://acuityscheduling.com/schedule.php">Book</a></html>', expected: "squarespace", contentHint: "sqs-block", reservationHint: "acuityscheduling" },
  { host: "eat.toast.site", html: '<html><a href="/menus">Menus</a><a href="https://www.toasttab.com/reserve/example">Reserve</a><img src="https://toasttab.com/assets/hero.jpg"></html>', expected: "toast", contentHint: "menus", reservationHint: "toasttab.com/reserve" },
  { host: "restaurant.getbento.com", html: '<html><a href="/menus">Menu</a><a href="/private-events">Private Events</a><a href="https://resy.com/example">Reserve</a></html>', expected: "bentobox", contentHint: "private-events", reservationHint: "resy" },
  { host: "restaurant.popmenu.com", html: '<html><a href="/menu">Menu</a><a href="/events">Events</a><a href="/reservation">Reservation</a><img src="https://popmenucloud.com/hero.jpg"></html>', expected: "popmenu", contentHint: "events", reservationHint: "reservation" },
  { host: "independentrestaurant.example", html: '<html><head><title>Independent Restaurant</title><meta name="description" content="Dinner and drinks"></head><body><h1>Independent Restaurant</h1><a href="/menu">Menu</a><a href="/contact">Contact</a></body></html>', expected: "generic", contentHint: "title" },
];

describe("website migration provider fixtures", () => {
  it.each(fixtures)("detects $expected and keeps provider-specific migration signals", (fixture) => {
    const adapter = detectWebsiteImportAdapter(fixture.html, fixture.host);
    expect(adapter.id).toBe(fixture.expected);
    const signals = extractImportSignals(fixture.html, adapter);
    expect(signals.adapter_id).toBe(fixture.expected);
    if (fixture.contentHint) expect(signals.detected_content_hints).toContain(fixture.contentHint);
    if (fixture.reservationHint) expect(signals.detected_reservation_hints).toContain(fixture.reservationHint);
  });

  it("covers the launch migration providers as one regression suite", () => {
    expect(fixtures.map((fixture) => fixture.expected)).toEqual([
      "wordpress",
      "wix",
      "squarespace",
      "toast",
      "bentobox",
      "popmenu",
      "generic",
    ]);
  });
});