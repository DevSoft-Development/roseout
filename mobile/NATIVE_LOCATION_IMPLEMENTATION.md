# Native location implementation contract

The mobile planner uses `expo-location` foreground permission only.

- `areaSource=search`: explicit parsed place; no device coordinates are sent.
- `areaSource=manual`: typed neighborhood/city/ZIP; no device coordinates are sent.
- `areaSource=device`: coordinates are required and forwarded to the canonical guided web search contract.
- `areaSource=default`: Step 2 remains incomplete until the user supplies an area or chooses current location.

The mobile search adapter remains a response-shaping/auth boundary. It does not implement separate parser, ranking, pairing, or geo logic.
