type ClientTrackEventInput = {
  event_name: string;
  anonymous_id?: string | null;
  session_id?: string | null;
  search_id?: string | null;
  query_fingerprint?: string | null;
  pair_id?: string | null;
  location_id?: string | null;
  source_location_id?: string | null;
  query?: string | null;
  normalized_query?: