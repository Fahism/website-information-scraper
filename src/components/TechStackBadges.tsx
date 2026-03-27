import type { TechDetectionResult } from '@/scrapers/types';

const CATEGORY_COLORS: Record<string, string> = {
  analytics:       'bg-blue-900 text-blue-300',
  crm:             'bg-violet-900 text-violet-300',
  email_marketing: 'bg-emerald-900 text-emerald-300',
  ads_pixel:       'bg-orange-900 text-orange-300',
  chat:            'bg-cyan-900 text-cyan-300',
  booking:         'bg-pink-900 text-pink-300',
  ecommerce:       'bg-yellow-900 text-yellow-300',
  cms:             'bg-zinc-700 text-zinc-300',
  hosting:         'bg-zinc-700 text-zinc-300',
  other:           'bg-zinc-800 text-zinc-400',
};

interface TechStackBadgesProps {
  techStack: TechDetectionResult;
}

export default function TechStackBadges({ techStack }: TechStackBadgesProps) {
  if (techStack.technologies.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <h3 className="text-sm font-medium text-zinc-400 mb-3">Tech Stack</h3>
        <p className="text-sm text-zinc-600">No technologies detected.</p>
      </div>
    );
  }

  const byCategory: Record<string, typeof techStack.technologies> = {};
  for (const tech of techStack.technologies) {
    if (!byCategory[tech.category]) byCategory[tech.category] = [];
    byCategory[tech.category].push(tech);
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
      <h3 className="text-sm font-medium text-zinc-400">Tech Stack</h3>
      {Object.entries(byCategory).map(([category, techs]) => (
        <div key={category}>
          <p className="text-xs text-zinc-600 uppercase tracking-wider mb-2">
            {category.replace('_', ' ')}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {techs.map(tech => (
              <span
                key={tech.name}
                className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${CATEGORY_COLORS[tech.category] ?? CATEGORY_COLORS.other}`}
              >
                {tech.name}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
