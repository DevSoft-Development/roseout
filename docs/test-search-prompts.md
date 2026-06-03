# Edge Search Test Prompts

1. `steak dinner with bowling in Astoria`
   - mixed outing
   - steak/steakhouse restaurants
   - bowling activity
   - no theaters
   - parser source: fast_parser or cache

2. `girls night dinner with cocktails`
   - restaurant plus drinks/lounge/cocktails
   - no theaters unless explicitly requested

3. `steak dinner and hookah lounge after`
   - steak restaurant
   - hookah lounge activity
   - restaurant then activity intent

4. `casual dinner and relaxed activity`
   - restaurant plus activity
   - relaxed activity terms can be broad

5. `sushi and karaoke in Flushing`
   - sushi restaurant
   - karaoke activity
   - Flushing geo

6. `brunch with spa near Brooklyn`
   - brunch restaurant
   - spa activity
   - Brooklyn geo

7. `restaurant with activity walking distance`
   - requires walking distance
   - reject pairs outside requested walking distance
