import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { buildWeeklySnapshot } from '@/lib/rankings';
import { supabaseUrl, supabaseKey } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/* 프로필에 캐릭터명을 저장한 직후 호출됩니다.
   공식 랭킹 수집은 건너뛰고(느리므로) 즉시 이번 주 표에 반영합니다.
   로그인한 길드원만 호출할 수 있습니다. */
export async function POST(request: Request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // 넘어온 토큰이 실제 로그인 세션인지 확인
  const anon = createClient(
    supabaseUrl,
    supabaseKey,
    { auth: { persistSession: false } }
  );
  const { data: { user }, error: authErr } = await anon.auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = createClient(
    supabaseUrl,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  try {
    const result = await buildWeeklySnapshot(admin, { scrape: false });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
