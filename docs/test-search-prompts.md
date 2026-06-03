# Edge Search Test Prompts

1. `steak dinner with bowling in Astoria`
   - Expected: `mixed_outing`, restaurant + activity, steak/steakhouse restaurants, bowling activities, no theaters, `parser_source` fast_parser or cache, `llm_used=false`.

2. `girls night dinner with cocktails`
   - Expected: restaurant + drinks/lounge/cocktails, no theater unless specifically requested.

3. `steak dinner and hookah lounge after`
   - Expected: steak restaurant, hookah lounge activity, sequence `restaurant_then_activity`.

4. `casual dinner and relaxed activity`
   - Expected: restaurant + relaxed activity, not overly strict on food.

5. `sushi and karaoke in Flushing`
   - Expected: sushi restaurant, karaoke activity, Flushing geo.

6. `brunch with spa near Brooklyn`
   - Expected: brunch restaurant, spa activity, Brooklyn geo.

7. `restaurant with activity walking distance`
   - Expected: requires walking distance true, pairs rejected outside requested walking distance.

## Sample local route test

```bash
NEXT_PUBLIC_USE_EDGE_CREATE_SEARCH=true npm run dev
curl -X POST http://localhost:3000/api/generate \
  -H 'Content-Type: application/json' \
  -d '{"message":"steak dinner with bowling in Astoria","betaDebug":true}'
```
