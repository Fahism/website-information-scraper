'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import JobStatusBar from '@/components/JobStatusBar';
import ReportViewer from '@/components/ReportViewer';
import type { ReportData } from '@/scrapers/types';

interface JobStatus {
  status: string;
  progress: number;
  currentStep: string | null;
  reportId: string | null;
  error: string | null;
}

export default function JobPage() {
  const params = useParams();
  const jobId = params.reportId as string;
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [report, setReport] = useState<ReportData | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!jobId) return;

    const poll = async (): Promise<string | null> => {
      const res = await fetch(`/api/research/${jobId}`);
      if (!res.ok) return null;
      const data: JobStatus = await res.json();
      setJobStatus(data);

      if (data.status === 'completed' && data.reportId) {
        const reportRes = await fetch(`/api/reports/${data.reportId}`);
        if (reportRes.ok) {
          const reportData = await reportRes.json();
          setReport(reportData);
        }
      }

      return data.status;
    };

    const start = async () => {
      const status = await poll();
      // Don't start polling interval if already in a terminal state
      if (status === 'completed' || status === 'failed') return;
      intervalRef.current = setInterval(async () => {
        const s = await poll();
        if (s === 'completed' || s === 'failed') {
          if (intervalRef.current) clearInterval(intervalRef.current);
        }
      }, 3000);
    };

    start();

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [jobId]);

  return (
    <main className="min-h-screen bg-zinc-950 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {jobStatus && jobStatus.status !== 'completed' && (
          <JobStatusBar
            status={jobStatus.status}
            progress={jobStatus.progress}
            currentStep={jobStatus.currentStep}
            error={jobStatus.error}
          />
        )}
        {report && <ReportViewer report={report} />}
        {!jobStatus && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
            <p className="text-zinc-400 text-sm">Loading...</p>
          </div>
        )}
      </div>
    </main>
  );
}
