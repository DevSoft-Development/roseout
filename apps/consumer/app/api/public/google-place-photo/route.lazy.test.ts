import { afterEach, describe, expect, it } from "vitest";
import { GET } from "./route";

const ORIGINAL_GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

afterEach(() => {
  if (ORIGINAL_GOOGLE_PLACES_API_KEY === undefined) {
    delete process.env.GOOGLE_PLACES_API_KEY;
  } else {
    process.env.GOOGLE_PLACES_API_KEY = ORIGINAL_GOOGLE_PLACES_API_KEY;
  }
});

describe("lazy Google place photo slots", () => {
  it("returns an unavailable response instead of the branded placeholder for secondary slots", async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;

    const response = await GET(
      new Request(
        "https://theouthaven.com/api/public/google-place-photo?placeId=test-place&index=2",
      ),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-theouthaven-photo-unavailable")).toBe("1");
    expect(response.headers.get("x-theouthaven-photo-fallback-reason")).toBe(
      "missing_google_places_api_key",
    );
  });
});
