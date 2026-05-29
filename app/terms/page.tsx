import type { Metadata } from "next";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";
import { buildMetadata } from "@/lib/seo";

export const metadata: Metadata = buildMetadata({
  title: "Terms of Service",
  description:
    "Read TheOutHaven's Terms of Service for using outing planning, restaurant and activity discovery, accounts, communications, and business listings.",
  path: "/terms",
});

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-black pb-28 text-white">
      <TheOutHavenHeader />

      <section className="relative overflow-hidden px-6 pt-28 pb-12">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(225,6,42,0.24),transparent_32%),linear-gradient(180deg,#050505,#000)]" />

        <div className="relative mx-auto max-w-4xl">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-[#e1062a]">
            Legal
          </p>

          <h1 className="mt-5 text-4xl font-black tracking-tight md:text-6xl">
            Terms of Service
          </h1>

          <p className="mt-4 text-sm font-semibold text-white/45">
            Last updated: April 30, 2026
          </p>

          <p className="mt-6 max-w-2xl text-base leading-7 text-white/60">
            These Terms of Service govern your access to and use of TheOutHaven,
            including our website, applications, AI-powered outing planning
            tools, restaurant and activity recommendations, account features,
            and related services.
          </p>
        </div>
      </section>

      <section className="px-6 pb-20">
        <div className="mx-auto max-w-4xl rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/40 md:p-8">
          <div className="space-y-8 text-sm leading-7 text-zinc-300">
            <section>
              <h2 className="text-xl font-black text-white">
                1. Agreement to Terms
              </h2>
              <p className="mt-2">
                These Terms of Service govern your access to and use of TheOutHaven,
                including our website, applications, AI-powered outing planning
                tools, restaurant and activity recommendations, account
                features, and related services.
              </p>
              <p className="mt-2">
                By using TheOutHaven, you agree to these Terms. If you do not
                agree, do not use the service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-black text-white">
                2. About TheOutHaven
              </h2>
              <p className="mt-2">
                TheOutHaven is an AI-powered outing planner that helps users
                discover restaurants, activities, experiences, and personalized
                outing ideas. Recommendations may be based on user preferences,
                location, budget, availability, and other information provided
                by users.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-black text-white">3. Accounts</h2>
              <p className="mt-2">
                You may need to create an account to access certain features.
                You agree to provide accurate information and keep your login
                details secure. You are responsible for all activity under your
                account.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-black text-white">
                4. AI Recommendations
              </h2>
              <p className="mt-2">
                TheOutHaven uses artificial intelligence to generate
                recommendations. AI-generated suggestions may not always be
                accurate, complete, or current. You are responsible for
                verifying restaurant details, pricing, availability, hours,
                reservation links, policies, accessibility, location, and
                activity details before making plans.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-black text-white">
                5. Third-Party Links and Services
              </h2>
              <p className="mt-2">
                TheOutHaven may link to restaurants, venues, reservation platforms,
                maps, event websites, payment processors, and other third-party
                services. We do not control and are not responsible for
                third-party websites, bookings, cancellations, charges,
                experiences, or policies.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-black text-white">
                6. SMS and Email Communications
              </h2>
              <p className="mt-2">
                If you provide your phone number and opt in, you agree to
                receive SMS messages from TheOutHaven about account updates, outing
                recommendations, reminders, promotions, and offers. Message
                frequency varies. Message and data rates may apply. Reply STOP
                to opt out. Reply HELP for help. Consent to receive SMS
                marketing messages is not a condition of purchase.
              </p>
              <p className="mt-2">
                You may also receive emails related to your account, activity,
                updates, recommendations, and promotional offers. You may
                unsubscribe from marketing emails where available.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-black text-white">
                7. Acceptable Use
              </h2>
              <p className="mt-2">
                You agree not to misuse TheOutHaven, interfere with the service,
                attempt unauthorized access, scrape or copy our data, submit
                false or harmful content, violate laws, or use the service for
                abusive, fraudulent, or illegal purposes.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-black text-white">
                8. Restaurant and Business Listings
              </h2>
              <p className="mt-2">
                TheOutHaven may display restaurant, venue, and activity listings.
                Business owners or authorized representatives may request to
                claim or update listings. We may review, approve, reject, edit,
                or remove listings at our discretion.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-black text-white">
                9. Payments and Subscriptions
              </h2>
              <p className="mt-2">
                If TheOutHaven offers paid services, subscriptions, promoted
                listings, or premium features, payments may be processed by
                third-party providers. Additional terms may apply at checkout.
                Subscription plans may renew automatically unless canceled
                according to the plan terms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-black text-white">
                10. Intellectual Property
              </h2>
              <p className="mt-2">
                TheOutHaven, including our branding, design, software, content,
                recommendations format, and platform features, is owned by us or
                our licensors. You may not copy, reproduce, sell, or exploit our
                service without written permission.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-black text-white">
                11. No Guarantee
              </h2>
              <p className="mt-2">
                We do not guarantee that recommendations, restaurant
                information, activity details, reservation links, prices,
                availability, ratings, or third-party content will be accurate,
                available, or suitable for your needs.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-black text-white">
                12. Limitation of Liability
              </h2>
              <p className="mt-2">
                To the fullest extent allowed by law, TheOutHaven is not liable for
                indirect, incidental, special, consequential, or punitive
                damages, or for losses arising from your use of the service,
                third-party services, bookings, recommendations, or user
                decisions.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-black text-white">13. Termination</h2>
              <p className="mt-2">
                We may suspend or terminate your access to TheOutHaven if you
                violate these Terms, misuse the service, create risk for TheOutHaven
                or other users, or if we discontinue part of the service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-black text-white">
                14. Changes to These Terms
              </h2>
              <p className="mt-2">
                We may update these Terms from time to time. Continued use of
                TheOutHaven after updates means you accept the revised Terms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-black text-white">15. Contact</h2>
              <p className="mt-2">Questions about these Terms may be sent to:</p>
              <p className="mt-2 font-bold text-white">
                TheOutHaven
                <br />
                Email: hello@theouthaven.com
                <br />
                Website: https://theouthaven.com
              </p>
            

            <section>
              <h2 className="text-xl font-black text-white">16. Refunds, Cancellations, and Review Policy</h2>
              <p className="mt-2">Reservation deposits and premium purchases are generally non-refundable once consumed or after a booked time has passed, unless required by law or a stated promotion. Users should cancel as early as possible from their reservation portal. TheOutHaven may remove reviews that are fake, abusive, incentivized without disclosure, or violate our content standards.</p>
            </section>

            <section>
              <h2 className="text-xl font-black text-white">17. Business Listing Terms</h2>
              <p className="mt-2">Business representatives must provide accurate listing details and maintain current contact, hours, reservation links, and policy information. We may moderate, suspend, or remove listings that are misleading, unauthorized, or repeatedly out of date.</p>
            </section>
</section>
          </div>
        </div>
      </section>
    </main>
  );
}