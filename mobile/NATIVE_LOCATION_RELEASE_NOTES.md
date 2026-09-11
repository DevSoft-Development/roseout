# Native location release notes

This release closes the remaining planner parity gap between the mobile app and the web create flow.

## Location precedence

1. Explicit location parsed from the user request.
2. Manually entered neighborhood, city, or ZIP.
3. Device current location after the user taps `Use my location` and grants foreground permission.
4. No silent coordinate fallback. If none of the first three is available, Step 2 asks the user to add an area or use current location.

## Privacy behavior

- The app requests foreground location permission only after an explicit tap on `Use my location`.
- Device coordinates are used only for the active search request.
- Explicit or manual locations clear any previously selected device coordinates before search.
- The permission-denied path remains fully usable through manual location entry.

## Canonical search parity

When device location is selected, the mobile API adapter forwards the same `useCurrentLocation`, `userLatitude`, and `userLongitude` fields used by the web guided results flow while continuing to use the same canonical search controller.
