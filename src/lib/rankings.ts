import { SupabaseClient } from '@supabase/supabase-js';

/* ============================================================
   환생 · 어비스 기갱 점수 일일 스냅샷

   프로필에 저장된 허상 · 광기 · 물길 기갱 점수를 매일 한 번
   abyss_daily 에 복사해 둡니다. 어제 줄과 비교해서 순위 변동을
   계산합니다.

   점수 자체는 두 경로로 들어옵니다.
   - 사용자가 프로필에서 직접 입력
   - 내 PC의 스크립트가 /api/records/ingest 로 밀어넣기
   ============================================================ */

/** 오늘 (KST) */
export function todayKST(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().split('T')[0];
}

export function daysAgoKST(n: number): string {
  return new Date(Date.now() + 9 * 3600 * 1000 - n * 86400000).toISOString().split('T')[0];
}

export async function buildDailySnapshot(admin: SupabaseClient) {
  const snapshotDate = todayKST();

  const { data: profiles, error } = await admin
    .from('profiles')
    .select('nickname, game_class, character_name, heosang_score, heosang_seconds, gwanggi_score, gwanggi_seconds, mulgil_score, mulgil_seconds');
  if (error) throw new Error(error.message);

  // 점수를 하나라도 가진 사람만 스냅샷에 넣습니다.
  const rows = (profiles || [])
    .filter(p => p.nickname && (p.heosang_score || p.gwanggi_score || p.mulgil_score))
    .map(p => ({
      snapshot_date: snapshotDate,
      nickname: p.nickname,
      character_name: p.character_name || null,
      game_class: p.game_class || null,
      heosang_score: p.heosang_score || 0,
      heosang_seconds: p.heosang_seconds || 0,
      gwanggi_score: p.gwanggi_score || 0,
      gwanggi_seconds: p.gwanggi_seconds || 0,
      mulgil_score: p.mulgil_score || 0,
      mulgil_seconds: p.mulgil_seconds || 0,
    }));

  if (rows.length === 0) {
    return { snapshotDate, saved: 0, note: '기갱 점수를 등록한 길드원이 없습니다.' };
  }

  const { error: upErr } = await admin
    .from('abyss_daily')
    .upsert(rows, { onConflict: 'snapshot_date,nickname' });
  if (upErr) throw new Error(upErr.message);

  return { snapshotDate, saved: rows.length };
}
