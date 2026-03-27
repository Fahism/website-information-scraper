'use client';

interface JobStatusBarProps {
  status: string;
  progress: number;
  currentStep: string | null;
  error: string | null;
}

export default function JobStatusBar({ status, progress, currentStep, error }: JobStatusBarProps) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-300">
          {currentStep ?? 'Initializing...'}
        </span>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
          status === 'running' ? 'bg-violet-900 text-violet-400' :
          status === 'failed' ? 'bg-red-900 text-red-400' :
          'bg-zinc-800 text-zinc-400'
        }`}>
          {status}
        </span>
      </div>
      <div className="w-full bg-zinc-800 rounded-full h-1.5">
        <div
          className="bg-violet-500 h-1.5 rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-xs text-zinc-500">{progress}% complete</p>
      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}
    </div>
  );
}
