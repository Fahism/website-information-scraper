import ResearchForm from '@/components/ResearchForm';
import Link from 'next/link';
import LogoutButton from '@/components/LogoutButton';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-8">
        <div className="flex items-center justify-end gap-2">
          <Link
            href="/dashboard"
            className="flex items-center gap-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300 text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            History
          </Link>
          <LogoutButton />
        </div>
        <div className="text-center space-y-3">
          <h1 className="text-3xl font-semibold text-zinc-100">
            Business Intelligence Research
          </h1>
          <p className="text-zinc-400 text-sm leading-relaxed">
            Enter a website URL to generate a complete marketing opportunity analysis.
          </p>
        </div>
        <ResearchForm />
      </div>
    </main>
  );
}
