import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase-server';

export async function GET(_request: NextRequest) {
  const supabase = createServiceRoleClient();

  const { data: reports, error } = await supabase
    .from('reports')
    .select('id, business_name, website_url, created_at')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch reports' }, { status: 500 });
  }

  return NextResponse.json(reports);
}
