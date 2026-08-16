# Reserve bar seating lifecycle

Bar and counter layout items remain the layout container. Their configured capacity is the physical stool count.

The migration materializes one `reservation_seating_resources` row per stool and uses `reservation_resource_assignments` as the many-to-one bridge between reservations and seats.

Lifecycle:

1. Layout create/update syncs individual stools from the container capacity.
2. Host View renders bars/counters as a rail with separately tappable stools.
3. Tapping a stool sends its label through the existing Reserve assignment API.
4. The reservation trigger selects the requested number of adjacent active stools for the party and searches the nearest valid contiguous block if the tapped block is unavailable.
5. Overlapping active reservations are rejected at the database layer using reservation date/time/duration.
6. All selected stool IDs are stored in `reservation_resource_assignments`; the reservation compatibility fields keep a comma-separated seat label list for current UI/API consumers.
7. Floor Snapshot splits that label list so every occupied stool renders with the reservation status.
8. Terminal states (`completed`, `cancelled`, `declined`, `no_show`) and reservation deletion release all stool assignments.

Normal table/booth/private-room assignments continue using the existing single-resource path unchanged.
