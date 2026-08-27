import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { buildDailySnapshot } from '@/lib/rankings';
import { supabaseUrl } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/* ============================================================
   내 PC에서 기갱 점수를 밀어 넣는 창구

   POST /api/records/ingest
   {
     "token":   "프로필에서 확인한 개인 토큰",
     "heosang": { "score": 12345, "seconds": 185 },
     "gwanggi": { "score": 11000, "seconds": 210 },
     "mulgil":  { "score": 9800,  "seconds": 240 }
   }

   세 개 중 보낸 것만 갱신되고, 빠뜨린 항목은 기존 값을 유지합니다.
   ============================================================ */
export async function POST(request: Request) {
  let body: any;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }

  const token = (body.token || request.headers.get('x-ingest-token') || '').trim();
  if (!token) return NextResponse.json({ error: 'token required' }, { status: 401 });

  const admin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  const { data: profile, error: pErr } = await admin
    .from('profiles').select('id, nickname').eq('ingest_token', token).maybeSingle();
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  if (!profile) return NextResponse.json({ error: 'unknown token' }, { status: 401 });

  const toInt = (v: any) => {
    const n = parseInt(String(v ?? '').replace(/[^0-9]/g, ''), 10);
    return Number.isFinite(n) ? n : null;
  };

  const patch: any = { records_updated_at: new Date().toISOString() };
  const map: [string, string][] = [
    ['heosang', 'heosang'], ['gwanggi', 'gwanggi'], ['mulgil', 'mulgil'],
  ];
  let touched = 0;
  for (const [key, col] of map) {
    const v = body[key];
    if (!v) continue;
    const score = toInt(v.score);
    const seconds = toInt(v.seconds);
    if (score !== null) { patch[`${col}_score`] = score; touched++; }
    if (seconds !== null) { patch[`${col}_seconds`] = seconds; touched++; }
  }
  if (touched === 0) {
    return NextResponse.json({ error: '보낼 점수가 없습니다.' }, { status: 400 });
  }

  const { error: upErr } = await admin.from('profiles').update(patch).eq('id', profile.id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  // 오늘 스냅샷에도 즉시 반영
  try { await buildDailySnapshot(admin); } catch (e) { console.error(e); }

  return NextResponse.json({ ok: true, nickname: profile.nickname, updated: touched });
}
