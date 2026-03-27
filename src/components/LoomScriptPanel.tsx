'use client';

import { useState } from 'react';
import type { LoomScript } from '@/scrapers/types';

interface LoomScriptPanelProps {
  loomScript: LoomScript;
}

const SECTION_META: {
  key: keyof LoomScript['sections'];
  label: string;
  icon: string;
  color: string;
  bgColor: string;
  borderColor: string;
  tip: string;
}[] = [
  {
    key: 'hook',
    label: 'Hook',
    icon: 'H',
    color: 'text-amber-400',
    bgColor: 'bg-amber-900/20',
    borderColor: 'border-amber-800/40',
    tip: 'Pattern-interrupt opener — grab their attention in the first 5 seconds',
  },
  {
    key: 'observation',
    label: 'Observation',
    icon: 'O',
    color: 'text-blue-400',
    bgColor: 'bg-blue-900/20',
    borderColor: 'border-blue-800/40',
    tip: 'Data-backed findings — show you actually researched their business',
  },
  {
    key: 'insight',
    label: 'Insight',
    icon: 'I',
    color: 'text-violet-400',
    bgColor: 'bg-violet-900/20',
    borderColor: 'border-violet-800/40',
    tip: 'The "aha moment" — what this means for their growth and revenue',
  },
  {
    key: 'pitch',
    label: 'Pitch',
    icon: 'P',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-900/20',
    borderColor: 'border-emerald-800/40',
    tip: 'Solution tease — position your approach as the natural next step',
  },
  {
    key: 'cta',
    label: 'CTA',
    icon: 'C',
    color: 'text-rose-400',
    bgColor: 'bg-rose-900/20',
    borderColor: 'border-rose-800/40',
    tip: 'Micro-commitment close — make saying yes effortless',
  },
];

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export default function LoomScriptPanel({ loomScript }: LoomScriptPanelProps) {
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [copiedSubject, setCopiedSubject] = useState(false);

  const handleCopyAll = async () => {
    await navigator.clipboard.writeText(loomScript.fullScript);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const handleCopySection = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedSection(key);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const handleCopySubject = async () => {
    await navigator.clipboard.writeText(loomScript.subjectLine);
    setCopiedSubject(true);
    setTimeout(() => setCopiedSubject(false), 2000);
  };

  if (!loomScript.fullScript) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h3 className="text-sm font-medium text-zinc-400 mb-3">Loom Outreach Script</h3>
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mb-3">
            <span className="text-zinc-600 text-lg">S</span>
          </div>
          <p className="text-sm text-zinc-500">Script not generated yet.</p>
          <p className="text-xs text-zinc-600 mt-1">Run a research job to generate the outreach script.</p>
        </div>
      </div>
    );
  }

  const hasSections = SECTION_META.some(s => loomScript.sections[s.key]);

  return (
    <div className="space-y-4">
      {/* Header card */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-medium text-zinc-200">Loom Outreach Script</h3>
            <p className="text-xs text-zinc-500 mt-0.5">Personalized video script ready to record</p>
          </div>
          <button
            onClick={handleCopyAll}
            className="text-xs font-medium px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition-colors"
          >
            {copiedAll ? 'Copied!' : 'Copy Full Script'}
          </button>
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5 bg-zinc-800 rounded-lg px-3 py-1.5">
            <span className="text-zinc-500">Words</span>
            <span className="text-zinc-300 font-medium">{loomScript.wordCount}</span>
          </div>
          <div className="flex items-center gap-1.5 bg-zinc-800 rounded-lg px-3 py-1.5">
            <span className="text-zinc-500">Duration</span>
            <span className="text-zinc-300 font-medium">~{formatDuration(loomScript.estimatedDuration)}</span>
          </div>
          {hasSections && (
            <div className="flex items-center gap-1.5 bg-zinc-800 rounded-lg px-3 py-1.5">
              <span className="text-zinc-500">Sections</span>
              <span className="text-zinc-300 font-medium">{SECTION_META.filter(s => loomScript.sections[s.key]).length}</span>
            </div>
          )}
        </div>
      </div>

      {/* Subject line card */}
      {loomScript.subjectLine && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-zinc-500 mb-1">Email Subject Line</p>
              <p className="text-sm text-zinc-200 font-medium truncate">{loomScript.subjectLine}</p>
            </div>
            <button
              onClick={handleCopySubject}
              className="flex-shrink-0 ml-3 text-xs font-medium px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
            >
              {copiedSubject ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {/* Script sections */}
      {hasSections ? (
        <div className="space-y-3">
          {SECTION_META.map((meta) => {
            const text = loomScript.sections[meta.key];
            if (!text) return null;

            const sectionWords = wordCount(text);
            const sectionDuration = sectionWords / 2.5;

            return (
              <div
                key={meta.key}
                className={`${meta.bgColor} border ${meta.borderColor} rounded-xl p-4 transition-colors`}
              >
                {/* Section header */}
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2.5">
                    <span className={`w-7 h-7 rounded-lg bg-zinc-900/60 flex items-center justify-center text-xs font-bold ${meta.color}`}>
                      {meta.icon}
                    </span>
                    <div>
                      <span className={`text-sm font-medium ${meta.color}`}>{meta.label}</span>
                      <span className="text-xs text-zinc-600 ml-2">
                        {sectionWords}w · ~{formatDuration(sectionDuration)}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleCopySection(meta.key, text)}
                    className="text-xs px-2.5 py-1 rounded-md bg-zinc-900/40 hover:bg-zinc-900/60 text-zinc-400 hover:text-zinc-300 transition-colors"
                  >
                    {copiedSection === meta.key ? 'Copied!' : 'Copy'}
                  </button>
                </div>

                {/* Section text */}
                <p className="text-sm text-zinc-200 leading-relaxed pl-9">
                  {text}
                </p>

                {/* Tip */}
                <p className="text-xs text-zinc-600 mt-2 pl-9 italic">{meta.tip}</p>
              </div>
            );
          })}
        </div>
      ) : (
        /* Fallback: no sections, show full script */
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">
            {loomScript.fullScript}
          </p>
        </div>
      )}

      {/* Timeline bar */}
      {hasSections && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
          <p className="text-xs text-zinc-500 mb-3">Script Timeline</p>
          <div className="flex gap-0.5 h-2 rounded-full overflow-hidden">
            {SECTION_META.map((meta) => {
              const text = loomScript.sections[meta.key];
              if (!text) return null;
              const sectionWords = wordCount(text);
              const pct = loomScript.wordCount > 0
                ? (sectionWords / loomScript.wordCount) * 100
                : 0;

              return (
                <div
                  key={meta.key}
                  className={`${meta.bgColor} border ${meta.borderColor} rounded-sm transition-all`}
                  style={{ width: `${pct}%` }}
                  title={`${meta.label}: ${sectionWords} words (${Math.round(pct)}%)`}
                />
              );
            })}
          </div>
          <div className="flex justify-between mt-2">
            {SECTION_META.filter(m => loomScript.sections[m.key]).map((meta) => (
              <span key={meta.key} className={`text-xs ${meta.color} opacity-60`}>{meta.label}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
