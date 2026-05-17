import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const priceId = process.env.STRIPE_THEOUTHAVEN_PRO_PRICE_ID;
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL || "https://theouthaven.vercel.app";

    if (!stripeSecretKey) {
      return NextResponse.json(
        { error: "Missing STRIPE_SECRET_KEY" },
        { status: 500 }
      );
    }

    if (!priceId) {
      return NextResponse.json(
        { error: "Missing STRIPE_THEOUTHAVEN_PRO_PRICE_ID" },
        { status: 500 }
      );
    }

    const formData = await request.formData();

    const plan = String(formData.get("plan") || "pro");
    const businessName = String(formData.get("businessName") || "");
    const contactName = String(formData.get("contactName") || "");
    const email = String(formData.get("email") || "");
    const phone = String(formData.get("phone") || "");
    const address = String(formData.get("address") || "");
    const city = String(formData.get("city") || "");
    const state = String(formData.get("state") || "");
    const zipCode = String(formData.get("zip_code") || "");
    const neighborhood = String(formData.get("neighborhood") || "");
    const latitude = String(formData.get("latitude") || "");
    const longitude = String(formData.get("longitude") || "");
    const googlePlaceId = String(formData.get("google_place_id") || "");
    const formattedAddress = String(formData.get("formatted_address") || "");
    const businessType = String(formData.get("businessType") || "");
    const goal = String(formData.get("goal") || "");

    if (plan !== "pro") {
      return NextResponse.redirect(`${siteUrl}/locations/apply?plan=free`, {
        status: 303,
      });
    }

    if (!businessName || !contactName || !email || !phone || !address || !businessType) {
      return NextResponse.json(
        { error: "Missing required business information." },
        { status: 400 }
      );
    }

    const body = new URLSearchParams({
      mode: "subscription",
      success_url: `${siteUrl}/locations/dashboard?upgraded=1`,
      cancel_url: `${siteUrl}/pricing?canceled=1`,

      "line_items[0][price]": priceId,
      "line_items[0][quantity]": "1",

      customer_email: email,

      "metadata[plan]": "theouthaven_pro",
      "metadata[businessName]": businessName,
      "metadata[contactName]": contactName,
      "metadata[email]": email,
      "metadata[phone]": phone,
      "metadata[address]": address,
      "metadata[city]": city,
      "metadata[state]": state,
      "metadata[zip_code]": zipCode,
      "metadata[neighborhood]": neighborhood,
      "metadata[latitude]": latitude,
      "metadata[longitude]": longitude,
      "metadata[google_place_id]": googlePlaceId,
      "metadata[formatted_address]": formattedAddress,
      "metadata[businessType]": businessType,
      "metadata[goal]": goal,

      "subscription_data[metadata][plan]": "theouthaven_pro",
      "subscription_data[metadata][businessName]": businessName,
      "subscription_data[metadata][contactName]": contactName,
      "subscription_data[metadata][email]": email,
      "subscription_data[metadata][phone]": phone,
      "subscription_data[metadata][address]": address,
      "subscription_data[metadata][city]": city,
      "subscription_data[metadata][state]": state,
      "subscription_data[metadata][zip_code]": zipCode,
      "subscription_data[metadata][neighborhood]": neighborhood,
      "subscription_data[metadata][latitude]": latitude,
      "subscription_data[metadata][longitude]": longitude,
      "subscription_data[metadata][google_place_id]": googlePlaceId,
      "subscription_data[metadata][formatted_address]": formattedAddress,
      "subscription_data[metadata][businessType]": businessType,
      "subscription_data[metadata][goal]": goal,
    });

    const stripeResponse = await fetch(
      "https://api.stripe.com/v1/checkout/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      }
    );

    const session = await stripeResponse.json();

    if (!stripeResponse.ok || !session.url) {
      return NextResponse.json(
        {
          error: session.error?.message || "Unable to create Stripe checkout.",
        },
        { status: 500 }
      );
    }

    return NextResponse.redirect(session.url, { status: 303 });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Checkout failed." },
      { status: 500 }
    );
  }
}