import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { supabaseUrl, supabaseKey } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/* ============================================================
   닉네임 변경 — 흩어진 이름을 한꺼번에 갈아끼웁니다.

   일정 참가자, 파티장, 롤링페이퍼(보낸 사람/받는 사람),
   팁 게시판 글, 도와줘, 순위 스냅샷까지 모두 새 닉네임으로 바꿉니다.

   RLS 때문에 남의 행(예: 다른 사람이 나에게 쓴 롤링페이퍼의
   to_nickname)은 클라이언트에서 못 고치므로 서버에서 처리합니다.
   ============================================================ */
export async function POST(request: Request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: any;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }

  const oldName = (body.oldName || '').trim();
  const newName = (body.newName || '').trim();
  if (!newName) return NextResponse.json({ error: '새 닉네임이 필요합니다.' }, { status: 400 });
  if (!oldName || oldName === newName) return NextResponse.json({ ok: true, changed: 0 });

  // 요청자 확인
  const anon = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  const { data: { user }, error: authErr } = await anon.auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  // 본인의 예전 닉네임이 맞는지 확인 (남의 이름을 갈아치우지 못하게)
  const { data: me } = await admin
    .from('profiles').select('id, nickname').eq('id', user.id).maybeSingle();
  if (!me) return NextResponse.json({ error: 'profile not found' }, { status: 404 });
  if (me.nickname !== oldName) {
    return NextResponse.json({ error: '현재 닉네임과 맞지 않습니다.' }, { status: 400 });
  }

  // 이미 쓰는 사람이 있는지
  const { data: taken } = await admin
    .from('profiles').select('id').eq('nickname', newName).neq('id', user.id).maybeSingle();
  if (taken) return NextResponse.json({ error: '이미 사용 중인 닉네임입니다.' }, { status: 409 });

  const results: { [k: string]: number | string } = {};
  const run = async (label: string, fn: () => any) => {
    try {
      const { error, count } = await fn();
      results[label] = error ? `실패: ${error.message}` : (count ?? 0);
    } catch (e: any) {
      results[label] = `실패: ${e.message}`;
    }
  };

  // 1) 프로필 본체
  await run('profiles', () => admin.from('profiles')
    .update({ nickname: newName }, { count: 'exact' }).eq('id', user.id));

  // 2) 일정 참가자 / 파티장
  await run('participants', () => admin.from('participants')
    .update({ user_name: newName }, { count: 'exact' }).eq('user_email', user.email));
  await run('raids_host', () => admin.from('raids')
    .update({ host_name: newName }, { count: 'exact' }).eq('created_by_email', user.email));

  // 3) 팁 게시판
  await run('posts', () => admin.from('posts')
    .update({ author_name: newName }, { count: 'exact' }).eq('user_id', user.id));

  // 4) 롤링페이퍼 — 내가 쓴 것(익명 제외) + 남이 나에게 쓴 것
  await run('papers_from', () => admin.from('rolling_papers')
    .update({ author_name: newName }, { count: 'exact' })
    .eq('author_id', user.id).eq('is_anonymous', false));
  await run('papers_to', () => admin.from('rolling_papers')
    .update({ to_nickname: newName }, { count: 'exact' }).eq('to_nickname', oldName));

  // 5) 도와줘
  await run('help_requests', () => admin.from('help_requests')
    .update({ nickname: newName }, { count: 'exact' }).eq('user_id', user.id));

  // 6) 순위 스냅샷
  //    (snapshot_date, nickname) 이 유니크라, 새 이름의 같은 날짜 행이
  //    이미 있으면 충돌합니다. 그 날짜의 중복 행을 먼저 지웁니다.
  const { data: mine } = await admin
    .from('abyss_daily').select('snapshot_date').eq('nickname', oldName);
  const dates = (mine || []).map((r: any) => r.snapshot_date);
  if (dates.length > 0) {
    await admin.from('abyss_daily').delete().eq('nickname', newName).in('snapshot_date', dates);
  }
  await run('abyss_daily', () => admin.from('abyss_daily')
    .update({ nickname: newName }, { count: 'exact' }).eq('nickname', oldName));

  return NextResponse.json({ ok: true, oldName, newName, results });
}
