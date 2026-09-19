const faqSections = [
  { title: "Getting started", items: [
    ["What is TheOutHaven?", "TheOutHaven helps you plan better outings by matching what you are looking for with restaurants, activities, and complete outing ideas."],
    ["How do I use TheOutHaven?", "Type what you want in normal language, like “romantic dinner and live music in Queens” or “birthday dinner with something fun after.” TheOutHaven will look for matches that fit the location, vibe, and type of outing you described."],
    ["Do I need an account to search?", "You can explore TheOutHaven without an account, but signing up gives you a better experience and helps you save or continue your plans when those features are available."],
    ["What kind of outings can I search for?", "You can search for date nights, birthdays, brunch, family outings, girls nights, group plans, dinner and activities, nightlife, casual plans, and more."],
  ]},
  { title: "Search results and matches", items: [
    ["Why did TheOutHaven pick a certain result?", "TheOutHaven looks at the words in your search, including the outing type, location, vibe, and activity you asked for. When possible, it explains why a match was chosen using the same words from your search."],
    ["What does a paired outing mean?", "A paired outing combines more than one stop, such as a restaurant and an activity, so you can plan a fuller experience without searching multiple places yourself."],
    ["What if I do not like the results?", "Try adding more detail, such as the neighborhood, budget, occasion, vibe, cuisine, or activity. For example, “casual sushi dinner and karaoke in Brooklyn” will usually be more helpful than “fun night out.”"],
    ["Are results always perfect?", "Not yet. TheOutHaven is still improving, and feedback helps make the matches better over time."],
  ]},
  { title: "Beta testing", items: [
    ["What is the beta program?", "The beta program lets early users test TheOutHaven before launch and help improve the product by trying weekly tasks and sharing feedback."],
    ["What do beta testers do each week?", "Beta testers complete quick weekly steps, such as searching for an outing, reviewing matches, choosing the best result, and answering feedback questions."],
    ["How long do beta tasks take?", "Most weekly beta tasks should only take a few minutes."],
    ["Does test mode count toward real beta progress?", "Test mode is used for trying the flow safely. If the page says test mode is active, it should not count toward real beta or giveaway progress."],
    ["How does my feedback help?", "Your feedback helps TheOutHaven understand which matches feel useful, which results miss the mark, and what needs to be improved before launch."],
  ]},
  { title: "Giveaway and eligibility", items: [
    ["How do I stay eligible for the giveaway?", "Follow the giveaway instructions shown on TheOutHaven. This may include joining the launch list, completing weekly beta tasks, and any listed social steps."],
    ["Do I need to complete weekly beta tasks?", "If weekly beta tasks are listed as part of the current giveaway or beta requirements, you should complete them to stay eligible."],
    ["Is a purchase required?", "No purchase is necessary for the giveaway."],
  ]},
  { title: "Accounts and login", items: [
    ["Why should I create an account?", "An account helps connect your activity, beta progress, saved plans, and feedback to you."],
    ["I cannot log in. What should I do?", "Use the Get Help link in the footer or support area and share the email connected to your account so support can review it."],
    ["Where can I manage my account?", "When you are logged in, use the account dropdown in the topbar to access your dashboard, settings, beta tasks, and support."],
  ]},
  { title: "Reservations and planning", items: [
    ["Can I book reservations through TheOutHaven?", "TheOutHaven may show ways to call, reserve, or continue with a location when those options are available. Some reservations may be handled directly by the business or an external service."],
    ["Does TheOutHaven guarantee availability?", "No. Availability, hours, prices, and policies can change. Always confirm important details with the business before going."],
    ["Can I call a location from TheOutHaven?", "When phone details are available, TheOutHaven may provide a call option so you can contact the location directly."],
  ]},
  { title: "Businesses", items: [
    ["How can a business appear on TheOutHaven?", "Businesses can be listed when they fit TheOutHaven’s outing categories and location markets. Business owners may also be able to claim or update their listing."],
    ["How do I claim my business listing?", "Use the business or claim option when available, or contact support for help verifying ownership."],
    ["What is TheOutHaven Reserve?", "TheOutHaven Reserve is the business-side reservation and guest management experience being built for restaurants and activity venues."],
    ["Who can I contact about business partnerships?", "Use the Get Help or business contact option on TheOutHaven and include your business name, location, and contact information."],
  ]},
  { title: "Support and safety", items: [
    ["How do I get help?", "Use the Get Help link in the footer or account dropdown. Share as much detail as possible so the support team can understand the issue."],
    ["How do I report wrong information?", "Use feedback or support to report incorrect hours, photos, addresses, categories, or business details."],
    ["Are business details always current?", "TheOutHaven works to keep information useful, but details can change. Always confirm important plans directly with the business."],
    ["Where can I find more help articles?", "Visit the Knowledge Base from the footer support section."],
  ]},
];

export default function FaqPage() {
  return (
    <main className="min-h-screen bg-[#050505] px-4 pb-16 pt-[120px] text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-10">
        <section className="rounded-[2rem] border border-[#e1062a]/30 bg-[radial-gradient(circle_at_top_left,rgba(225,6,42,.28),transparent_34%),linear-gradient(135deg,#24050a,#090706_58%,#110b0b)] p-8 shadow-2xl shadow-red-950/30 md:p-12">
          <p className="text-xs font-black uppercase tracking-[0.35em] text-rose-300">Help Center</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight md:text-6xl">TheOutHaven FAQ</h1>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-white/65">Answers to common questions about finding outings, beta testing, accounts, reservations, and business listings.</p>
        </section>

        {faqSections.map((section) => (
          <section key={section.title} aria-labelledby={section.title.replaceAll(" ", "-").toLowerCase()} className="space-y-4">
            <h2 id={section.title.replaceAll(" ", "-").toLowerCase()} className="text-2xl font-black text-white">{section.title}</h2>
            <div className="grid gap-3">
              {section.items.map(([question, answer]) => (
                <details key={question} className="group rounded-3xl border border-white/10 bg-white/[0.045] p-5 open:border-[#e1062a]/40 open:bg-[#e1062a]/10">
                  <summary className="cursor-pointer list-none text-base font-black text-white marker:hidden">{question}<span className="float-right ml-4 text-rose-300 transition group-open:rotate-180">⌄</span></summary>
                  <p className="mt-4 leading-7 text-white/65">{answer}</p>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
