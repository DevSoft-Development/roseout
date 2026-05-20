import TheOutHavenHeader from "@/components/TheOutHavenHeader";

export const metadata = {
  title: "SMS Terms – TheOutHaven",
  description: "SMS consent, message frequency, rates, and opt-out terms for TheOutHaven.",
};

export default function SmsTermsPage() {
  return <main className="min-h-screen bg-black pb-24 text-white"><TheOutHavenHeader /><section className="mx-auto max-w-4xl px-6 pt-28"><h1 className="text-4xl font-black">SMS Terms</h1><p className="mt-4 text-white/70">By opting into TheOutHaven SMS, you consent to account alerts, reservation updates, reminders, and optional marketing. Message frequency varies. Message/data rates may apply. Reply STOP to opt out and HELP for help. Consent is not a condition of purchase. We do not sell SMS opt-in data or phone numbers for third-party marketing.</p></section></main>;
}
