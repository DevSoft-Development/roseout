import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
  const { username } = await params;
  return {
    title: `@${username} on TheOutHaven`,
    description: `See ${username}'s favorite spots, curated guides, and trending outings on TheOutHaven.`,
  };
}

export default async function UserProfilePage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-16 text-white">
      <h1 className="text-4xl font-bold">@{username}</h1>
      <p className="mt-4 text-white/70">Public profile with saved favorites, curated lists, and shareable outing cards.</p>
    </main>
  );
}
