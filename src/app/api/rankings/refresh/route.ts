import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { buildDailySnapshot } from '@/lib/rankings';
import { supabaseUrl, supabaseKey } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/* 프로필에서 기갱 점수를 저장한 직후 호출됩니다.
   내일까지 기다리지 않고 오늘 스냅샷에 바로 반영합니다. */
export async function POST(request: Request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const anon = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  const { data: { user }, error: authErr } = await anon.auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

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
