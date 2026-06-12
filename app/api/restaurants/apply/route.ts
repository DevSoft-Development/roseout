import QRCode from "qrcode";
import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeAddressForSave } from "@/lib/address-utils";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (!body.restaurant_name || !body.email) {
      return Response.json(
        { error: "Missing required fields." },
        { status: 400 }
      );
    }

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL || "https://theouthaven.vercel.app";

    // Create or find user
    const tempPassword = Math.random().toString(36).slice(-10) + "Aa1!";

    const { data: createdUser } =
      await supabaseAdmin.auth.admin.createUser({
        email: body.email,
        password: tempPassword,
        email_confirm: true,
      });

    let ownerUserId = createdUser?.user?.id || null;

    if (!ownerUserId) {
      const { data: usersData } =
        await supabaseAdmin.auth.admin.listUsers();

      const existingUser = usersData.users.find(
        (user) => user.email?.toLowerCase() === body.email.toLowerCase()
      );

      ownerUserId = existingUser?.id || null;
    }

    const qrLink = `${siteUrl}/restaurants/dashboard`;
    const qrCodeDataUrl = await QRCode.toDataURL(qrLink);
    const normalizedAddress = normalizeAddressForSave({
      address: body.address,
      city: body.city,
      state: body.state,
      zip_code: body.zip_code,
    });

    const { error } = await supabase.from("restaurants").insert({
      restaurant_name: body.restaurant_name,
      address: normalizedAddress || null,
      city: body.city,
      state: body.state,
      zip_code: body.zip_code,
      email: body.email,
      description: body.description,
      qr_link: qrLink,
      qr_code_data_url: qrCodeDataUrl,
      owner_user_id: ownerUserId,
      owner_email: body.email,
      status: "pending",
    });

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    await supabase.auth.signInWithOtp({
      email: body.email,
      options: {
        emailRedirectTo: `${siteUrl}/auth/callback`,
      },
    });

    return Response.json({
      success: true,
      message: "Restaurant submitted. Check your email for login link.",
    });
  } catch (error: any) {
    return Response.json(
      { error: error.message || "Server error" },
      { status: 500 }
    );
  }
}