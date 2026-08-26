import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { buildWeeklySnapshot } from '@/lib/rankings';
import { supabaseUrl, supabaseKey } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/* 매주 월요일 09:00 (KST) 에 Vercel Cron 이 호출합니다.
   공식 랭킹 페이지까지 훑어 점수를 갱신합니다. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = createClient(
    supabaseUrl,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  try {
    const result = await buildWeeklySnapshot(admin, { scrape: true });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
