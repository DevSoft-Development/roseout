# Enterprise Search Intent/Render Contract

This contract documents the focused search stabilization expectations used by the enterprise search tests.

## Single-venue restaurant queries
Examples: `bar with wings nyc`, `chicken lunch in Astoria`, `group dinner and drinks`, `seafood rooftop restaurant`, `rooftop dinner in Queens`.

Expected intent: `needsRestaurant: true`, `needsActivity: false`, `wantsPairing: false`, `primaryDomain: restaurant`. Accepted search types are `restaurant` or same-location restaurant feature modes. Accepted render modes are `restaurant_cards` or `combo_location_cards` only when the combo mode represents a same-location restaurant feature, never a restaurant + activity pair. These queries must not render `pair_cards` and should not be empty when deterministic fixture data exists.

## Mixed outing / paired queries
Examples: `brunch and activity nearby`, `dinner and activity nearby`, `Mexican dinner and bowling nearby`, `steak dinner and rooftop drinks after`.

Expected intent: `needsRestaurant: true`, `needsActivity: true`, `wantsPairing: true`, `primaryDomain: mixed`. Canonical search type is `mixed_outing`; legacy `paired_outing` may appear only as a public normalized intent label. Render mode is `pair_cards` when pairs exist.

## Sports-watch queries
Examples: `best bar to watch the Knicks game in Harlem`, `sports bar to watch football`, `watch the game`.

Sports-watch scoring is allowed only for explicit sports/game-watch raw-query language. Sports-watch activity terms may include sports bar, watch party, game day, TVs, and team/game-specific terms.

## Non-sports queries
Examples: `brunch and activity nearby`, `dinner and activity nearby`, `Mexican dinner and bowling nearby`, `steak dinner and rooftop drinks after`, `bar with wings nyc`.

Non-sports queries must not receive sports/game-watch fit, sports-watch bar/pub fit, missing sports bar/TV/game-watch signal, or sports-watch penalties/reasons.
