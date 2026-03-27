import type { SocialMediaResult } from '@/scrapers/types';

const PLATFORM_ICONS: Record<string, string> = {
  facebook: 'f',
  instagram: 'ig',
  tiktok: 'tt',
  youtube: 'yt',
  linkedin: 'in',
  twitter: 'x',
};

function formatCount(n: number | null): string {
  if (n === null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

interface SocialMediaCardProps {
  socialMedia: SocialMediaResult;
}

export default function SocialMediaCard({ socialMedia }: SocialMediaCardProps) {
  if (socialMedia.profiles.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <h3 className="text-sm font-medium text-zinc-400 mb-3">Social Media</h3>
        <p className="text-sm text-zinc-600">No social profiles found on the website.</p>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
      <h3 className="text-sm font-medium text-zinc-400">Social Media</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {socialMedia.profiles.map(profile => (
          <a
            key={profile.platform}
            href={profile.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
          >
            <span className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-300 uppercase flex-shrink-0">
              {PLATFORM_ICONS[profile.platform] ?? profile.platform[0]}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-zinc-100 capitalize">{profile.platform}</p>
              <p className="text-xs text-zinc-500">
                {profile.handle ? `@${profile.handle}` : '—'}
                {profile.followers !== null && ` · ${formatCount(profile.followers)} followers`}
              </p>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
