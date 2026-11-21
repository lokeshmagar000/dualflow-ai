/**
 * Public privacy policy. Google, Meta and TikTok ask for this link when you
 * create a developer app. Open to everyone (no login), see middleware.ts.
 */
export const metadata = { title: "Privacy policy · DualFlow" };

export default function PrivacyPage() {
  const owner = process.env.NEXT_PUBLIC_OWNER_NAME || "the channel owner";
  return (
    <main className="mx-auto max-w-2xl p-8 text-fg1">
      <h1 className="mb-4 text-2xl font-bold">Privacy policy</h1>
      <p className="mb-3">DualFlow is a private tool used only by {owner} to upload their own videos to their own YouTube, Facebook, Instagram and TikTok accounts.</p>
      <ul className="mb-3 list-disc space-y-1 pl-5">
        <li>It does not collect data about other people and has no public users.</li>
        <li>It uses the platform permissions only to upload videos and read the owner&apos;s own channel name and post status.</li>
        <li>Access tokens are stored encrypted as secrets and are never shared or sold.</li>
        <li>Data deletion: remove the app from your account settings on the platform, or contact the owner; all stored tokens are then deleted.</li>
      </ul>
      <p className="text-sm text-fg3">Last updated: 19 November 2026</p>
    </main>
  );
}
