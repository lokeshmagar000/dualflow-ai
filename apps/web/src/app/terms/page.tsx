/** Public terms of service. Google, Meta and TikTok ask for this link. Open to everyone (see middleware.ts). */
export const metadata = { title: "Terms of service · DualFlow" };

export default function TermsPage() {
  const owner = process.env.NEXT_PUBLIC_OWNER_NAME || "the channel owner";
  const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
  return (
    <main className="mx-auto max-w-2xl p-8 text-fg1">
      <h1 className="mb-4 text-2xl font-bold">Terms of service</h1>
      <p className="mb-3">
        DualFlow is a private publishing tool run by {owner} for the Namaste Facts channels. Only the owner can sign in
        and use it. It makes short fact videos in Nepali and English and publishes them to the owner&apos;s own YouTube,
        Facebook, Instagram and TikTok accounts.
      </p>
      <h2 className="mb-2 mt-5 text-lg font-semibold">Using DualFlow</h2>
      <ul className="mb-3 list-disc space-y-1 pl-5">
        <li>DualFlow is not offered to the public. There are no sign-ups and no other users.</li>
        <li>It only posts to accounts that the owner connected and allowed, and the owner can disconnect them at any time.</li>
        <li>Every video follows the rules and community guidelines of the platform it is posted on.</li>
        <li>Videos made with AI are labelled as AI-generated where the platform offers a label.</li>
      </ul>
      <h2 className="mb-2 mt-5 text-lg font-semibold">Third-party platforms</h2>
      <p className="mb-3">
        When DualFlow posts to YouTube, Facebook, Instagram or TikTok, the terms of that platform also apply. DualFlow is
        not made by, and is not endorsed by, those companies.
      </p>
      <h2 className="mb-2 mt-5 text-lg font-semibold">No warranty</h2>
      <p className="mb-3">DualFlow is provided as it is, without any warranty. The owner may change or stop it at any time.</p>
      <p className="mb-3">
        See also the <a className="underline" href="/privacy">privacy policy</a>.
        {contact ? <> Questions: <a className="underline" href={`mailto:${contact}`}>{contact}</a>.</> : null}
      </p>
      <p className="text-sm text-fg3">Last updated: 24 November 2026</p>
    </main>
  );
}
