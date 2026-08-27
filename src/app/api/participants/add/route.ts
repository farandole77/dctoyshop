import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { supabaseUrl, supabaseKey } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/* ============================================================
   다른 길드원을 일정에 참가시키기

   POST /api/participants/add  { raidId, nickname }

   '도와주기'로 방을 만들 때, 도움을 요청한 사람을 대신 넣어줍니다.
   내 것이 아닌 참가 행은 RLS 때문에 브라우저에서 넣을 수 없어
   서버에서 처리합니다.

   방장 본인 또는 관리자만 호출할 수 있습니다.
   ============================================================ */
export async function POST(request: Request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  let body: any;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }); }

  const { raidId, nickname } = body;
  if (!raidId || !nickname) {
    return NextResponse.json({ error: 'raidId, nickname required' }, { status: 400 });
  }

  const anon = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  const { data: { user }, error: authErr } = await anon.auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const admin = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });

  // 방장인지 확인 (관리자도 허용)
  const { data: raid } = await admin
    .from('raids').select('id, created_by_email, max_members, blocked_slots').eq('id', raidId).maybeSingle();
  if (!raid) return NextResponse.json({ error: 'raid not found' }, { status: 404 });

  const { data: me } = await admin
    .from('profiles').select('role').eq('id', user.id).maybeSingle();
  const isAdmin = me?.role === 'admin';
  if (raid.created_by_email !== user.email && !isAdmin) {
    return NextResponse.json({ error: '방장만 다른 사람을 넣을 수 있습니다.' }, { status: 403 });
  }

  // 대상 프로필
  const { data: target } = await admin
    .from('profiles').select('*').eq('nickname', nickname).maybeSingle();
  if (!target) return NextResponse.json({ error: '해당 길드원을 찾을 수 없습니다.' }, { status: 404 });

  // 이미 참가 중인지 / 자리가 남았는지
  const { data: current } = await admin
    .from('participants').select('id, user_name').eq('raid_id', raidId);
  if ((current || []).some((p: any) => p.user_name === nickname)) {
    return NextResponse.json({ ok: true, added: 0, note: '이미 참가 중입니다.' });
  }
  const max = raid.max_members || 4;
  const blocked = (raid.blocked_slots || []).length;
  if ((current || []).length + blocked >= max) {
    return NextResponse.json({ error: '자리가 없습니다.' }, { status: 409 });
  }

  const { error: insErr } = await admin.from('participants').insert([{
    raid_id: raidId,
    user_name: target.nickname,
    game_class: target.game_class || '모험가',
    user_avatar: target.avatar_url || null,
    user_email: target.email || null,
  }]);
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, added: 1, nickname: target.nickname });
}
