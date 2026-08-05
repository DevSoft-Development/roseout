# Search Health incorrect-result route fix

The All Searches table renders rows from `search_events`. The Mark incorrect result action must therefore use the existing quality-review endpoint for `search_events`, not the detail endpoint for `search_health_events`.
