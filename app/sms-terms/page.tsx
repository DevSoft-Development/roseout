import Link from "next/link";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";

export const metadata = {
  title: "SMS Terms – TheOutHaven",
  description: "SMS consent, message frequency, rates, and opt-out terms for TheOutHaven.",
};

export default function SmsTermsPage() {
  return (
    <main className="min-h-screen bg-black pb-24 text-white">
      <TheOutHavenHeader />
      <section className="mx-auto max-w-4xl px-6 pt-28">
        <h1 className="text-4xl font-black">SMS Terms</h1>
        <div className="mt-6 space-y-5 text-sm leading-7 text-white/70">
          <p>
            If you provide a mobile number and separately opt in to SMS, you agree to receive text messages from TheOutHaven about reservation confirmations, reservation reminders, account notifications, and customer care.
          </p>
          <p>
            Message frequency varies. Message and data rates may apply. Reply STOP to opt out at any time. Reply HELP for help. SMS consent is optional and is not a condition of purchase, booking, account creation, or use of TheOutHaven.
          </p>
          <p>
            TheOutHaven does not sell or share mobile phone numbers, SMS opt-in data, or SMS consent information with third parties or affiliates for their own marketing or promotional purposes.
          </p>
          <p>
            Marketing or promotional text messages require a separate marketing opt-in and are not included in reservation or customer-care SMS consent.
          </p>
          <p>
            See our <Link href="/privacy" className="font-bold text-red-300 underline underline-offset-2">Privacy Policy</Link> for more information about how we handle personal information and mobile data.
          </p>
        </div>
      </section>
    </main>
  );
}
