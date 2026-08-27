import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { supabaseUrl, supabaseKey } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/* ============================================================
   도와주기 완료 → 도와준 사람에게 포인트 지급

   POST /api/points/award  { raidId }

   서버에서만 지급합니다. 클라이언트가 포인트를 직접 올릴 수 있으면
   누구나 원하는 만큼 넣을 수 있으니까요.

   지급 조건
   1. 그 일정이 '도와주기'로 만들어졌을 것
   2. 마감(던전 완료) 상태일 것
   3. 아직 지급되지 않았을 것 (points_awarded 로 중복 방지)
   ============================================================ */

export const HELP_POINTS = 10;   // 한 번 도와줄 때 주는 포인트

export async function POST(request: Request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: any;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }

  const raidId = body.raidId;
  if (!raidId) return NextResponse.json({ error: 'raidId required' }, { status: 400 });

  const anon = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  const { data: { user }, error: authErr } = await anon.auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  const { data: raid, error: rErr } = await admin
    .from('raids')
    .select('id, title, is_closed, helper_nickname, help_for_nickname, points_awarded')
    .eq('id', raidId).maybeSingle();
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });
  if (!raid) return NextResponse.json({ error: 'raid not found' }, { status: 404 });

  if (!raid.helper_nickname) return NextResponse.json({ ok: true, awarded: 0, note: '도와주기 일정이 아닙니다.' });
  if (!raid.is_closed)       return NextResponse.json({ ok: true, awarded: 0, note: '아직 마감되지 않았습니다.' });
  if (raid.points_awarded)   return NextResponse.json({ ok: true, awarded: 0, note: '이미 지급되었습니다.' });

  // 도와준 사람 찾기
  const { data: helper } = await admin
    .from('profiles').select('id, nickname, points').eq('nickname', raid.helper_nickname).maybeSingle();
  if (!helper) return NextResponse.json({ error: '도와준 사람을 찾을 수 없습니다.' }, { status: 404 });

  // 중복 지급 방지 — 먼저 깃발을 세우고, 세우기에 성공했을 때만 지급합니다.
  const { data: claimed, error: claimErr } = await admin
    .from('raids')
    .update({ points_awarded: true })
    .eq('id', raidId).eq('points_awarded', false)
    .select('id');
  if (claimErr) return NextResponse.json({ error: claimErr.message }, { status: 500 });
  if (!claimed || claimed.length === 0) {
    return NextResponse.json({ ok: true, awarded: 0, note: '이미 지급되었습니다.' });
  }

  // 지급 (숫자를 덮어쓰지 않고 더합니다)
  let total: number | null = null;
  const { data: rpc, error: rpcErr } = await admin.rpc('add_points', {
    p_user_id: helper.id, p_amount: HELP_POINTS,
  });
  if (rpcErr) {
    // 함수가 없으면 일반 업데이트로 대체
    const { data: up, error: upErr } = await admin
      .from('profiles')
      .update({ points: (helper.points || 0) + HELP_POINTS })
      .eq('id', helper.id).select('points').maybeSingle();
    if (upErr) {
      await admin.from('raids').update({ points_awarded: false }).eq('id', raidId); // 되돌리기
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }
    total = up?.points ?? null;
  } else {
    total = rpc as unknown as number;
  }

  await admin.from('point_logs').insert([{
    user_id: helper.id,
    nickname: helper.nickname,
    amount: HELP_POINTS,
    reason: `도와주기 완료 · ${raid.help_for_nickname || ''}`.trim(),
    raid_id: raidId,
  }]);

  return NextResponse.json({
    ok: true,
    awarded: HELP_POINTS,
    helper: helper.nickname,
    total,
  });
}
