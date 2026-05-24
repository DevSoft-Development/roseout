export type OutingStatus =
  | "planned"
  | "reservation_clicked"
  | "call_clicked"
  | "completed"
  | "cancelled";

export interface Outing {
  id: string;
  user_id?: string | null;
  location_id?: string | null;
  location_type?: string | null;

  status: OutingStatus;

  reservation_type?: string | null;

  external_reservation_url?: string | null;
  phone_number?: string | null;

  contact_method?: string | null;

  reservation_clicked_at?: string | null;
  call_clicked_at?: string | null;

  completed_at?: string | null;
  cancelled_at?: string | null;

  rating?: number | null;
  matched_vibe?: boolean | null;
  would_go_again?: boolean | null;
  feedback?: string | null;

  created_at?: string;
  updated_at?: string;
}
