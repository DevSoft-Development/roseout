import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function getTable(itemType: string) {
  if (itemType === "restaurant") return "restaurants";
  if (itemType === "activity") return "activities";
  return null;
}

function getCounter(eventType: string) {
  if (eventType === "view") return "view_count";
  if (eventType === "click") return "click_count";
  return null;
}

function isUuid(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const itemId = body.item_id;
    const itemType = body.item_type;
    const eventType = body.event_type;
    const pagePath = body.page_path || null;

    const referrer = req.headers.get("referer");
    const userAgent = req.headers.get("user-agent");

    // ✅ Validation
    if (!itemId || !itemType || !eventType) {
      return NextResponse.json(
        { error: "Missing item_id, item_type, or event_type." },
        { status: 400 }
      );
    }

    const table = getTable(itemType);
    const counter = getCounter(eventType);

    if (!table || !counter) {
      return NextResponse.json(
        { error: "Invalid analytics type." },
        { status: 400 }
      );
    }

    // ✅ Log event (for history / analytics dashboard). This is non-blocking so
    // legacy counters keep working even when analytics schema changes.
    const { error: analyticsInsertError } = await supabaseAdmin.from("analytics_events").insert({
      event_name: `${itemType}_${eventType}`,
      event_type: eventType,
      location_id: isUuid(itemId) ? itemId : null,
      source_location_id: String(itemId),
      page_path: pagePath,
      referrer,
      source: "legacy_analytics_api",
      metadata: {
        item_id: itemId,
        item_type: itemType,
        user_agent: userAgent,
      },
    });

    if (analyticsInsertError) {
      console.error("LEGACY_ANALYTICS_EVENT_INSERT_FAILED", analyticsInsertError.message);
    }

    // ✅ Get current count
    const { data: item, error: fetchError } = await supabaseAdmin
      .from(table)
      .select(counter)
      .eq("id", itemId)
      .single();

    if (fetchError || !item) {
      return NextResponse.json(
        { error: "Item not found." },
        { status: 404 }
      );
    }

    // 🔥 FIXED TYPE ERROR HERE
    const typedItem = item as Record<string, any>;
    const currentCount = Number(typedItem[counter] || 0);

    // ✅ Update counter
    const { error: updateError } = await supabaseAdmin
      .from(table)
      .update({
        [counter]: currentCount + 1,
      })
      .eq("id", itemId);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      item_id: itemId,
      item_type: itemType,
      event_type: eventType,
      count: currentCount + 1,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Analytics failed." },
      { status: 500 }
    );
  }
}