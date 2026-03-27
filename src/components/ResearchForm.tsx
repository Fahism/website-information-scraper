'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const TRACKING_PARAMS = [
  'fbclid', 'gclid', 'gclsrc', 'msclkid', 'twclid', 'ttclid', 'li_fat_id',
  'mc_cid', 'mc_eid',
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'utm_id', 'utm_source_platform', 'utm_creative_format', 'utm_marketing_tactic',
  '_ga', '_gl', 'ref', 'source', 'affiliate',
];

function stripTrackingParams(raw: string): string {
  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const parsed = new URL(withProtocol);
    TRACKING_PARAMS.forEach(p => parsed.searchParams.delete(p));
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return raw;
  }
}

export default function ResearchForm() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // Strip tracking params client-side so the input shows the clean URL
    const cleanedUrl = stripTrackingParams(url.trim());

    try {
      const res = await fetch('/api/research/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: cleanedUrl }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to start research');
      }

      const { jobId } = await res.json();
      router.push(`/dashboard/${jobId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-5">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Website URL</label>
        <input
          type="url"
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://example.com"
          required
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500 transition-colors"
        />
      </div>

      {error && (
        <p className="text-red-400 text-sm">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-violet-600 hover:bg-violet-500 disabled:bg-violet-900 disabled:text-violet-500 text-white font-medium py-2.5 rounded-lg text-sm transition-colors"
      >
        {loading ? 'Starting research...' : 'Start Research'}
      </button>
    </form>
  );
}
