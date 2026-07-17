"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { trackClientEvent } from "@/lib/analytics/trackClientEvent";
import CreatePageLegacy from "./CreatePageLegacy";

type AnchorLocation = {
  id?: string | number | null;
  name?: string | null;
  restaurant_name?: string | null;
  activity_name?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  borough?: string | null;
  location_type?: string | null;
  primary_category?: string | null;
  activity_type?: string | null;
  image_url?: string | null;
  main_image?: string | null;
  images?: string[] | string | null;
};
