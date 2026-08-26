import { SupabaseClient } from '@supabase/supabase-js';

/* ============================================================
   환생 · 주간 길드원 순위 계산 (공용 로직)

   두 곳에서 씁니다.
   - 매주 월요일 크론      → scrape: true  (공식 랭킹까지 훑음, 20초쯤 걸림)
   - 프로필 저장 직후 갱신 → scrape: false (즉시 반영, 1초 내)
   ============================================================ */

const OFFICIAL_BASE = 'https://mabinogimobile.nexon.com/Ranking/List';
const SERVER_NAME = process.env.GUILD_SERVER_NAME || '알리사';
const MAX_PAGES = Number(process.env.RANKING_MAX_PAGES || 50); // 20명/페이지 × 50 = 1000위

export type Row = {
  officialRank: number;
  server: string;
  characterName: string;
  gameClass: string;
  total: number;
  combat: number;
  life: number;
  charm: number;
};

/** HTML 태그를 걷어내고 순수 텍스트 흐름으로 만듭니다.
 *  공식 페이지의 class 이름이 바뀌어도 깨지지 않도록,
 *  마크업이 아니라 '텍스트 패턴'을 기준으로 파싱합니다. */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

const num = (s: string) => parseInt(s.replace(/[^0-9]/g, ''), 10) || 0;

export function parseRankingPage(html: string): Row[] {
  const text = htmlToText(html);
  const rows: Row[] = [];

  // "12위 ... 서버명 알리사 ... 캐릭터명 홍길동 ... 클래스 궁수 ... 종합 점수 123,456 (전투) (생활) (매력)"
  const re = new RegExp(
    '(\\d[\\d,]*)\\s*위' +
    '[\\s\\S]{0,200}?서버명\\s*\\n?\\s*([^\\n]+?)\\s*\\n' +
    '[\\s\\S]{0,200}?캐릭터명\\s*\\n?\\s*([^\\n]+?)\\s*\\n' +
    '[\\s\\S]{0,200}?클래스\\s*\\n?\\s*([^\\n]+?)\\s*\\n' +
    '[\\s\\S]{0,200}?종합 점수\\s*\\n?\\s*([\\d,]+)\\s*\\n\\s*([\\d,]+)\\s*\\n\\s*([\\d,]+)\\s*\\n\\s*([\\d,]+)',
    'g'
  );

  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    rows.push({
      officialRank: num(m[1]), server: m[2].trim(),
      characterName: m[3].trim(), gameClass: m[4].trim(),
      total: num(m[5]), combat: num(m[6]), life: num(m[7]), charm: num(m[8]),
    });
  }
  return rows;
}

/** 공식 종합 랭킹을 훑어 우리 서버 캐릭터만 모읍니다. */
export async function scrapeOfficial(): Promise<Map<string, Row>> {
  const found = new Map<string, Row>();
  let lastFirstName = '';

  for (let page = 1; page <= MAX_PAGES; page++) {
    // t=4 : 종합 랭킹 (t=1 전투력 / t=2 매력 / t=3 생활력)
    const url = `${OFFICIAL_BASE}?t=4&page=${page}`;
    let html = '';
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; HwansaengGuildBot/1.0)',
          'Accept-Language': 'ko-KR,ko;q=0.9',
        },
        cache: 'no-store',
      });
      if (!res.ok) break;
      html = await res.text();
    } catch { break; }

    const rows = parseRankingPage(html);
    if (rows.length === 0) break;

    // page 파라미터가 먹지 않아 1페이지만 반복 반환되는 경우 감지
    if (rows[0].characterName === lastFirstName) break;
    lastFirstName = rows[0].characterName;

    rows.filter(r => !SERVER_NAME || r.server === SERVER_NAME)
        .forEach(r => found.set(r.characterName, r));

    // 공식 사이트에 부담을 주지 않도록 간격을 둡니다.
    await new Promise(r => setTimeout(r, 350));
  }
  return found;
}

/** 이번 주 월요일 (KST) */
export function mondayKST(): string {
  const now = new Date(Date.now() + 9 * 3600 * 1000); // UTC → KST
  const day = now.getUTCDay();                        // 0=일 … 1=월
  const diff = day === 0 ? 6 : day - 1;
  return new Date(now.getTime() - diff * 86400000).toISOString().split('T')[0];
}

/** 이번 주 스냅샷을 만들어 저장합니다. */
export async function buildWeeklySnapshot(
  admin: SupabaseClient,
  opts: { scrape: boolean }
) {
  const weekStart = mondayKST();

  const { data: profiles, error: pErr } = await admin
    .from('profiles')
    .select('nickname, game_class, character_name, combat_power, life_power, charm_power');
  if (pErr) throw new Error(pErr.message);

  const members = (profiles || []).filter(p => p.character_name?.trim());
  if (members.length === 0) {
    return { weekStart, saved: 0, note: '캐릭터명이 등록된 길드원이 없습니다.' };
  }

  // 공식 랭킹 (주간 크론에서만 — 즉시 갱신은 건너뜁니다)
  let official = new Map<string, Row>();
  if (opts.scrape) {
    try { official = await scrapeOfficial(); }
    catch (e) { console.error('공식 랭킹 수집 실패:', e); }
  }

  // 이미 저장돼 있던 이번 주 값 (즉시 갱신 시 공식 점수를 잃지 않도록)
  const { data: existing } = await admin
    .from('guild_rankings').select('*').eq('week_start', weekStart);
  const exMap = new Map((existing || []).map((r: any) => [r.character_name, r]));

  // 지난주 값 (이어받기용)
  const prevDate = new Date(new Date(weekStart).getTime() - 7 * 86400000)
    .toISOString().split('T')[0];
  const { data: prev } = await admin
    .from('guild_rankings')
    .select('character_name, combat_power, life_power, charm_power')
    .eq('week_start', prevDate);
  const prevMap = new Map((prev || []).map((r: any) => [r.character_name, r]));

  const rows = members.map(m => {
    const name = m.character_name.trim();
    const hit = official.get(name);
    const ex: any = exMap.get(name);
    const last: any = prevMap.get(name);

    let combat = 0, life = 0, charm = 0, source = 'carryover';
    let officialRank: number | null = null;

    if (hit) {
      ({ combat, life, charm } = hit);
      officialRank = hit.officialRank;
      source = 'official';
    } else if (m.combat_power || m.life_power || m.charm_power) {
      combat = m.combat_power || 0; life = m.life_power || 0; charm = m.charm_power || 0;
      source = 'manual';
    } else if (ex && ex.source === 'official') {
      // 즉시 갱신이라 공식 수집을 건너뛴 경우, 기존 공식 점수를 지키지 않도록
      combat = ex.combat_power; life = ex.life_power; charm = ex.charm_power;
      officialRank = ex.official_rank; source = 'official';
    } else if (last) {
      combat = last.combat_power; life = last.life_power; charm = last.charm_power;
    }

    return {
      week_start: weekStart, character_name: name, nickname: m.nickname,
      game_class: hit?.gameClass || m.game_class,
      combat_power: combat, life_power: life, charm_power: charm,
      total_score: combat + life + charm,
      official_rank: officialRank, source, guild_rank: 0,
    };
  });

  rows.sort((a, b) => b.total_score - a.total_score);
  rows.forEach((r, i) => { r.guild_rank = i + 1; });

  const { error: upErr } = await admin
    .from('guild_rankings')
    .upsert(rows, { onConflict: 'week_start,character_name' });
  if (upErr) throw new Error(upErr.message);

  return {
    weekStart,
    saved: rows.length,
    fromOfficial: rows.filter(r => r.source === 'official').length,
    fromManual: rows.filter(r => r.source === 'manual').length,
    carriedOver: rows.filter(r => r.source === 'carryover').length,
  };
}
