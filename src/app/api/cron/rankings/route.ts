import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { buildDailySnapshot } from '@/lib/rankings';
import { supabaseUrl } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/* 매일 00:00 (KST) 에 Vercel Cron 이 호출합니다.
   그날의 기갱 점수를 한 벌 복사해 두어 순위 변동 계산의 기준을 만듭니다. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const admin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  try {
    const result = await buildDailySnapshot(admin);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
