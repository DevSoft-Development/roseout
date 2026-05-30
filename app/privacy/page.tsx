import type { Metadata } from "next";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Privacy Policy",
  description:
    "Read TheOutHaven's Privacy Policy, including how information is collected, used, protected, and managed across the service.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-black pb-28 text-white">
      <TheOutHavenHeader />

      <section className="relative overflow-hidden px-6 pt-28 pb-12">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(225,6,42,0.24),transparent_32%),linear-gradient(180deg,#050505,#000)]" />

        <div className="relative mx-auto max-w-4xl">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-[#e1062a]">
            Privacy
          </p>

          <h1 className="mt-5 text-4xl font-black tracking-tight md:text-6xl">
            Privacy Policy
          </h1>

          <p className="mt-4 text-sm font-semibold text-white/45">
            Last updated: April 30, 2026
          </p>

          <p className="mt-6 max-w-2xl text-base leading-7 text-white/60">
            This Privacy Policy explains how TheOutHaven collects, uses, discloses,
            and protects information when you use our website, applications,
            AI outing planner, account features, restaurant and activity
            recommendations, and related services.
          </p>
        </div>
      </section>

      <section className="px-6 pb-20">
        <div className="mx-auto max-w-4xl rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/40 md:p-8">
          <div className="space-y-8 text-sm leading-7 text-zinc-300">
            <section>
              <h2 className="text-xl font-black text-white">1. Overview</h2>
              <p className="mt-2">
                TheOutHaven respects your privacy. This Privacy Policy explains how
                we collect, use, disclose, and protect information when you use
                our website, applications, AI outing planner, account features,
                restaurant and activity recommendations, and related services.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-black text-white">
                2. Information We Collect
              </h2>
              <p className="mt-2">
                We may collect information you provide directly, including your
                name, email address, phone number, password, city or borough,
                outing preferences, budget range, preferred vibe, account
                details, and any messages, searches, or prompts you submit to
                TheOutHaven.
              </p>
              <p className="mt-2">
                We may also collect usage information such as pages viewed,
                restaurants clicked, activity clicks, saved plans, device and
                browser information, IP address, approximate location, referral
                source, cookies, and analytics data.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-black text-white">
                3. How We Use Information
              </h2>
              <p className="mt-2">
                We use information to provide and improve TheOutHaven, create and
                manage accounts, personalize outing recommendations, generate AI
                responses, save preferences, improve search results,
                communicate with users, protect the platform, prevent fraud,
                analyze usage, and send updates or promotional messages where
                permitted.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-black text-white">
                4. SMS Communications and Consent
              </h2>
              <p className="mt-2">
                If you provide your phone number and opt in, you agree to
                receive SMS messages from TheOutHaven about account updates, outing
                recommendations, reminders, promotions, and offers.
              </p>
              <p className="mt-2">
                Message frequency varies. Message and data rates may apply.
                Reply STOP to opt out. Reply HELP for help. Consent is not a
                condition of purchase.
              </p>
              <p className="mt-2">
                We do not sell or share mobile phone numbers, SMS opt-in data,
                or SMS consent information with third parties or affiliates for
                their own marketing or promotional purposes.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-black text-white">
                5. Email Communications
              </h2>
              <p className="mt-2">
                We may send emails about your account, confirmation links,
                platform updates, outing recommendations, reminders, and
                promotional offers. You can unsubscribe from marketing emails
                where an unsubscribe option is provided. Some account or
                security emails may still be necessary to provide the service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-black text-white">
                6. Sharing of Information
              </h2>
              <p className="mt-2">
                We may share information with service providers who help us
                operate TheOutHaven, including hosting, authentication, analytics,
                email delivery, SMS delivery, payments, fraud prevention,
                customer support, and database services.
              </p>
              <p className="mt-2">
                We may also disclose information if required by law, to protect
                rights and safety, to prevent fraud or abuse, or in connection
                with a business transfer such as a merger, acquisition, or sale
                of assets.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-black text-white">
                7. No Sale of Personal Information
              </h2>
              <p className="mt-2">
                TheOutHaven does not sell your personal information. TheOutHaven does
                not sell, rent, or share SMS opt-in data or mobile numbers with
                third parties for marketing purposes.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-black text-white">
                8. Cookies and Analytics
              </h2>
              <p className="mt-2">
                We may use cookies, pixels, local storage, and analytics tools
                to remember preferences, measure usage, improve features,
                understand traffic, and protect the service. You can control
                cookies through your browser settings, but some features may not
                work properly if cookies are disabled.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-black text-white">
                9. AI and User Prompts
              </h2>
              <p className="mt-2">
                When you submit prompts, preferences, or outing requests, we may
                process that information to generate recommendations and improve
                TheOutHaven. Do not submit sensitive information that you do not
                want processed by our systems or service providers.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-black text-white">
                10. Data Security
              </h2>
              <p className="mt-2">
                We use reasonable administrative, technical, and organizational
                safeguards designed to protect information. However, no internet
                or electronic storage system is completely secure, and we cannot
                guarantee absolute security.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-black text-white">
                11. Data Retention
              </h2>
              <p className="mt-2">
                We retain information for as long as needed to provide the
                service, comply with legal obligations, resolve disputes,
                enforce agreements, prevent abuse, and maintain business
                records.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-black text-white">
                12. Your Choices
              </h2>
              <p className="mt-2">
                You may update certain account information, opt out of marketing
                emails, reply STOP to opt out of SMS messages, or contact us to
                request access, correction, or deletion of your information,
                subject to legal and operational limits.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-black text-white">
                13. Children’s Privacy
              </h2>
              <p className="mt-2">
                TheOutHaven is not intended for children under 13. We do not
                knowingly collect personal information from children under 13.
                If we learn that we collected such information, we will take
                appropriate steps to delete it.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-black text-white">
                14. Third-Party Links
              </h2>
              <p className="mt-2">
                TheOutHaven may link to restaurants, venues, reservation platforms,
                maps, event websites, and other third-party services. Their
                privacy practices are governed by their own policies, not this
                Privacy Policy.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-black text-white">
                15. Changes to This Policy
              </h2>
              <p className="mt-2">
                We may update this Privacy Policy from time to time. Continued
                use of TheOutHaven after updates means you acknowledge the revised
                policy.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-black text-white">16. Contact</h2>
              <p className="mt-2">
                Questions about this Privacy Policy may be sent to:
              </p>
              <p className="mt-2 font-bold text-white">
                TheOutHaven
                <br />
                Email: concierge@theouthaven.com
                <br />
                Website: https://theouthaven.com
              </p>
            

            <section>
              <h2 className="text-xl font-black text-white">17. Review and Listing Integrity</h2>
              <p className="mt-2">We process review, moderation, and listing signals to protect trust and reduce spam, fraud, and misleading business information.</p>
            </section>
</section>
          </div>
        </div>
      </section>
    </main>
  );
}