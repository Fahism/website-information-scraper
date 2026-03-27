import { createServiceRoleClient } from '@/lib/supabase-server';
import Link from 'next/link';
import LogoutButton from '@/components/LogoutButton';

/** Extract just the hostname from a URL string, falling back to the raw string. */
function toHostname(raw: string): string {
  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return new URL(withProtocol).hostname.replace(/^www\./, '');
  } catch {
    return raw;
  }
}

/** Strip tracking params and return a clean short URL for display. */
function cleanDisplayUrl(raw: string): string {
  const TRACKING = new Set([
    'fbclid','gclid','gclsrc','msclkid','twclid','ttclid','li_fat_id',
    'mc_cid','mc_eid',
    'utm_source','utm_medium','utm_campaign','utm_term','utm_content',
    'utm_id','utm_source_platform','utm_creative_format','utm_marketing_tactic',
    '_ga','_gl','ref','source','affiliate',
  ]);
  try {
    const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(withProtocol);
    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING.has(key.toLowerCase())) url.searchParams.delete(key);
    }
    url.hash = '';
    // Show as  hostname + path only (no protocol, no trailing slash on root)
    const path = url.pathname === '/' ? '' : url.pathname;
    return url.hostname.replace(/^www\./, '') + path;
  } catch {
    return raw;
  }
}

export default async function DashboardPage() {
  const supabase = createServiceRoleClient();

  const { data: jobs } = await supabase
    .from('research_jobs')
    .select('*, reports(id, business_name, website_url)')
    .order('created_at', { ascending: false })
    .limit(50);

  return (
    <main className="min-h-screen bg-zinc-950 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-zinc-100">Research History</h1>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              New Research
            </Link>
            <LogoutButton />
          </div>
        </div>

        {!jobs || jobs.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center">
            <p className="text-zinc-500 text-sm">No research jobs yet. Start your first one above.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {jobs.map((job: Record<string, unknown>) => {
              const report = Array.isArray(job.reports) ? job.reports[0] as Record<string, string> : null;
              const businessName = report?.business_name || toHostname(job.raw_input as string);
              const websiteUrl   = report?.website_url
                ? cleanDisplayUrl(report.website_url)
                : cleanDisplayUrl(job.raw_input as string);

              return (
                <Link
                  key={job.id as string}
                  href={`/dashboard/${job.id}`}
                  className="block bg-zinc-900 border border-zinc-800 rounded-xl p-4 hover:border-zinc-700 transition-colors"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-zinc-100 truncate">
                        {businessName}
                      </p>
                      <p className="text-xs text-zinc-500 mt-0.5 truncate">
                        {websiteUrl}
                      </p>
                    </div>
                    <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${
                      job.status === 'completed' ? 'bg-emerald-900 text-emerald-400' :
                      job.status === 'running'   ? 'bg-violet-900 text-violet-400'  :
                      job.status === 'failed'    ? 'bg-red-900 text-red-400'        :
                                                   'bg-zinc-800 text-zinc-400'
                    }`}>
                      {job.status as string}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
