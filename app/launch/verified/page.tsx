import Link from "next/link";

type Status = "success" | "already_verified" | "invalid";

export default async function LaunchVerifiedPage({ searchParams }: { searchParams: Promise<{ status?: string; giveaway?: string }> }) {
  const params = await searchParams;
  const status = (params.status || "invalid") as Status;
  const giveaway = params.giveaway === "1";

  let headline = "Verification link expired or invalid.";
  let subtext = "Please return to the Launch List form and submit your email again to receive a new verification link.";
  let ctas: { label: string; href: string }[] = [{ label: "Back to Launch List", href: "/#launch-list" }];

  if (status === "success" && giveaway) {
    headline = "You've been entered into the prize giveaway.";
    subtext = "Your email is verified. To complete the social part of your entry, make sure you follow @TheOutHaven on Instagram or TikTok and tag 2 friends in the giveaway post comments.";
    ctas = [
      { label: "Follow on Instagram", href: "https://www.instagram.com/TheOutHaven" },
      { label: "Follow on TikTok", href: "https://www.tiktok.com/@TheOutHaven" },
      { label: "Back to Home", href: "/" },
    ];
  } else if (status === "success") {
    headline = "You're on the Launch List.";
    subtext = "Your email is verified. We’ll send launch updates and early access details as TheOutHaven gets closer to launch.";
    ctas = [{ label: "Back to Home", href: "/" }];
  } else if (status === "already_verified") {
    headline = "You're already verified.";
    subtext = "You're on the Launch List. If you entered the giveaway, your entry is ready for social verification.";
    ctas = [{ label: "Back to Home", href: "/" }];
  }

  return (
    <main className="min-h-screen bg-[#070303] px-5 py-16 text-white sm:px-6 lg:px-8">
      <section className="mx-auto max-w-2xl rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.24),transparent_36%),rgba(255,255,255,0.055)] p-8 text-center shadow-2xl shadow-black/30">
        <p className="text-xs font-black uppercase tracking-[0.30em] text-rose-200">TheOutHaven Launch Giveaway</p>
        <h1 className="mt-5 text-4xl font-black tracking-[-0.04em] sm:text-5xl">{headline}</h1>
        <p className="mt-4 text-base leading-7 text-white/65">{subtext}</p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row sm:flex-wrap">
          {ctas.map((cta) => (
            <Link key={cta.label} href={cta.href} className="rounded-full border border-white/10 bg-white/[0.08] px-6 py-3 text-sm font-black text-white transition hover:bg-white/12">
              {cta.label}
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
