import Link from "next/link";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";

export const metadata = {
  title: "SMS Terms – TheOutHaven",
  description: "SMS consent, message frequency, rates, and opt-out terms for TheOutHaven customer care and marketing programs.",
};

export default function SmsTermsPage() {
  return (
    <main className="min-h-screen bg-black pb-24 text-white">
      <TheOutHavenHeader />
      <section className="mx-auto max-w-4xl px-6 pt-28">
        <h1 className="text-4xl font-black">SMS Terms</h1>
        <div className="mt-6 space-y-5 text-sm leading-7 text-white/70">
          <p>
            TheOutHaven operates separate SMS programs for customer care and CRM communications and for marketing or promotional communications. Consent to one SMS program does not enroll you in the other.
          </p>
          <p>
            <strong className="text-white">Customer care and CRM SMS:</strong> If you provide a mobile number, consent to customer-care SMS, or initiate a text conversation with TheOutHaven, you may receive messages about account support, business or location-profile support, location claims, onboarding, reservation assistance, reservation confirmations or reminders, account notifications, support requests, and other communications related to an existing inquiry or business relationship.
          </p>
          <p>
            <strong className="text-white">Marketing SMS:</strong> Marketing and promotional text messages require a separate express marketing opt-in. If you separately opt in to marketing SMS, you may receive promotions, offers, announcements, recommendations, or other promotional messages from TheOutHaven. Customer-care or CRM consent alone does not authorize marketing texts.
          </p>
          <p>
            Message frequency varies by program and your interactions with TheOutHaven. Message and data rates may apply. Reply STOP to opt out of messages from the sending number at any time. Reply START to opt back in where supported. Reply HELP for help. SMS consent is optional and is not a condition of purchase, booking, account creation, or use of TheOutHaven.
          </p>
          <p>
            Opting out of one TheOutHaven SMS number or program does not necessarily opt you out of a separately consented SMS program sent from another number. You may opt out of each program by replying STOP to the applicable sending number.
          </p>
          <p>
            TheOutHaven does not sell, rent, or share mobile phone numbers, SMS opt-in data, or SMS consent information with third parties or affiliates for their own marketing or promotional purposes. We may use service providers solely to operate messaging, customer support, security, and related platform functions on our behalf.
          </p>
          <p>
            For help with TheOutHaven customer care or SMS communications, reply HELP, email hello@theouthaven.com, or visit TheOutHaven.com.
          </p>
          <p>
            See our <Link href="/privacy" className="font-bold text-red-300 underline underline-offset-2">Privacy Policy</Link> and <Link href="/terms" className="font-bold text-red-300 underline underline-offset-2">Terms of Service</Link> for more information.
          </p>
        </div>
      </section>
    </main>
  );
}
