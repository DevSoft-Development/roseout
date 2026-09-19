import QRCode from "qrcode";
import { supabase } from "@/lib/supabase";
import { normalizeAddressForSave } from "@/lib/address-utils";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!body.restaurant_name || !email) {
      return Response.json({ error: "Missing required fields." }, { status: 400 });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://theouthaven.com";
    const qrLink = `${siteUrl}/restaurants/dashboard`;
    const qrCodeDataUrl = await QRCode.toDataURL(qrLink);
    const normalizedAddress = normalizeAddressForSave({
      address: body.address, city: body.city, state: body.state, zip_code: body.zip_code,
    });

    const { error } = await supabase.from("restaurants").insert({
      restaurant_name: body.restaurant_name,
      address: normalizedAddress || null,
      city: body.city,
      state: body.state,
      zip_code: body.zip_code,
      email,
      description: body.description,
      qr_link: qrLink,
      qr_code_data_url: qrCodeDataUrl,
      owner_user_id: null,
      owner_email: email,
      status: "pending",
    });
    if (error) return Response.json({ error: "Could not submit restaurant application." }, { status: 500 });

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${siteUrl}/auth/callback`, shouldCreateUser: true },
    });
    if (otpError) console.error("Restaurant application OTP delivery failed", { error: otpError.message });

    return Response.json({ success: true, message: "Restaurant submitted. Check your email for login link." });
  } catch (error: unknown) {
    console.error("Restaurant application failed", error);
    return Response.json({ error: "Server error" }, { status: 500 });
  }
}
