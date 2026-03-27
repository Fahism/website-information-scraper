import type { OpportunityAnalysis } from '@/scrapers/types';

const CATEGORY_ICONS: Record<string, string> = {
  automation: '🤖',
  funnel:     '🔧',
  social:     '📱',
  ads:        '📣',
  seo:        '🔍',
  tech:       '⚙️',
  content:    '✍️',
};

const PRIORITY_STYLES: Record<string, string> = {
  high:   'border-red-800 bg-red-950/30',
  medium: 'border-amber-800 bg-amber-950/30',
  low:    'border-zinc-700 bg-zinc-900',
};

const PRIORITY_BADGE: Record<string, string> = {
  high:   'bg-red-900 text-red-400',
  medium: 'bg-amber-900 text-amber-400',
  low:    'bg-zinc-800 text-zinc-500',
};

interface OpportunityListProps {
  analysis: OpportunityAnalysis;
}

export default function OpportunityList({ analysis }: OpportunityListProps) {
  return (
    <div className="space-y-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-zinc-400">Marketing Opportunity Analysis</h3>
          <div className="flex items-center gap-1">
            <span className="text-2xl font-bold text-zinc-100">{analysis.overallScore}</span>
            <span className="text-sm text-zinc-500">/100</span>
          </div>
        </div>
        {analysis.businessSummary && (
          <p className="text-sm text-zinc-300 leading-relaxed">{analysis.businessSummary}</p>
        )}
        {(analysis.strengths.length > 0 || analysis.gaps.length > 0) && (
          <div className="mt-4 grid grid-cols-2 gap-4">
            {analysis.strengths.length > 0 && (
              <div>
                <p className="text-xs font-medium text-emerald-400 mb-1.5">Strengths</p>
                <ul className="space-y-1">
                  {analysis.strengths.slice(0, 3).map((s, i) => (
                    <li key={i} className="text-xs text-zinc-400">· {s}</li>
                  ))}
                </ul>
              </div>
            )}
            {analysis.gaps.length > 0 && (
              <div>
                <p className="text-xs font-medium text-amber-400 mb-1.5">Gaps</p>
                <ul className="space-y-1">
                  {analysis.gaps.slice(0, 3).map((g, i) => (
                    <li key={i} className="text-xs text-zinc-400">· {g}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {analysis.opportunities.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <p className="text-sm text-zinc-600">No opportunities generated yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {analysis.opportunities.map(opp => (
            <div
              key={opp.id}
              className={`border rounded-xl p-4 space-y-2 ${PRIORITY_STYLES[opp.priority]}`}
            >
              <div className="flex items-start gap-3">
                <span className="text-lg flex-shrink-0">{CATEGORY_ICONS[opp.category] ?? '💡'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_BADGE[opp.priority]}`}>
                      {opp.priority}
                    </span>
                    <span className="text-xs text-zinc-500 capitalize">{opp.category}</span>
                  </div>
                  <p className="text-sm font-medium text-zinc-100">{opp.finding}</p>
                  <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{opp.recommendation}</p>
                  {opp.evidence.length > 0 && (
                    <p className="text-xs text-zinc-600 mt-1.5">{opp.evidence.join(' · ')}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
