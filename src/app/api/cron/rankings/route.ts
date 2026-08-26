import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/* ============================================================
   환생 · 주간 길드원 순위 갱신
   매주 월요일 09:00 (KST) 에 Vercel Cron 이 호출합니다.

   동작 순서
   1. profiles 에서 캐릭터명이 등록된 길드원을 모읍니다.
   2. 공식 랭킹 페이지를 훑어 해당 캐릭터의 점수를 찾습니다.
   3. 못 찾으면(1000위 밖) 본인이 프로필에 입력한 점수를 씁니다.
   4. 그것도 없으면 지난주 값을 그대로 이어받습니다.
   5. 종합 점수 순으로 길드 내 순위를 매겨 스냅샷을 저장합니다.
   ============================================================ */

const OFFICIAL_BASE = 'https://mabinogimobile.nexon.com/Ranking/List';
const SERVER_NAME = process.env.GUILD_SERVER_NAME || '알리사';
const MAX_PAGES = Number(process.env.RANKING_MAX_PAGES || 50); // 20명/페이지 × 50 = 1000위

type Row = {
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

/** 랭킹 목록 페이지 한 장을 파싱합니다. */
function parseRankingPage(html: string): Row[] {
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
      officialRank: num(m[1]),
      server: m[2].trim(),
      characterName: m[3].trim(),
      gameClass: m[4].trim(),
      total: num(m[5]),
      combat: num(m[6]),
      life: num(m[7]),
      charm: num(m[8]),
    });
  }
  return rows;
}

/** 공식 종합 랭킹을 훑어 우리 서버 캐릭터만 모읍니다. */
async function scrapeOfficial(): Promise<Map<string, Row>> {
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
    } catch {
      break;
    }

    const rows = parseRankingPage(html);
    if (rows.length === 0) break;

    // page 파라미터가 먹지 않아 1페이지만 반복 반환되는 경우 감지
    if (rows[0].characterName === lastFirstName) break;
    lastFirstName = rows[0].characterName;

    rows
      .filter(r => !SERVER_NAME || r.server === SERVER_NAME)
      .forEach(r => found.set(r.characterName, r));

    // 공식 사이트에 부담을 주지 않도록 간격을 둡니다.
    await new Promise(r => setTimeout(r, 350));
  }

  return found;
}

/** 이번 주 월요일 (KST) */
function mondayKST(): string {
  const now = new Date(Date.now() + 9 * 3600 * 1000); // UTC → KST
  const day = now.getUTCDay();                        // 0=일 … 1=월
  const diff = day === 0 ? 6 : day - 1;
  const mon = new Date(now.getTime() - diff * 86400000);
  return mon.toISOString().split('T')[0];
}

export async function GET(request: Request) {
  // Vercel Cron 인증
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const weekStart = mondayKST();

  // 1) 캐릭터명이 등록된 길드원
  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('nickname, game_class, character_name, combat_power, life_power, charm_power');
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const members = (profiles || []).filter(p => p.character_name?.trim());
  if (members.length === 0) {
    return NextResponse.json({ ok: true, weekStart, saved: 0, note: '캐릭터명이 등록된 길드원이 없습니다.' });
  }

  // 2) 공식 랭킹 수집 (실패해도 아래 단계로 넘어갑니다)
  let official = new Map<string, Row>();
  try {
    official = await scrapeOfficial();
  } catch (e) {
    console.error('공식 랭킹 수집 실패:', e);
  }

  // 3) 지난주 스냅샷 (이어받기용)
  const prevDate = new Date(new Date(weekStart).getTime() - 7 * 86400000)
    .toISOString().split('T')[0];
  const { data: prev } = await supabase
    .from('guild_rankings')
    .select('character_name, combat_power, life_power, charm_power, total_score')
    .eq('week_start', prevDate);
  const prevMap = new Map((prev || []).map(r => [r.character_name, r]));

  // 4) 이번 주 값 확정
  const rows = members.map(m => {
    const name = m.character_name.trim();
    const hit = official.get(name);
    const last: any = prevMap.get(name);

    let combat = 0, life = 0, charm = 0, source = 'carryover';
    let officialRank: number | null = null;

    if (hit) {
      ({ combat, life, charm } = hit);
      officialRank = hit.officialRank;
      source = 'official';
    } else if (m.combat_power || m.life_power || m.charm_power) {
      combat = m.combat_power || 0;
      life = m.life_power || 0;
      charm = m.charm_power || 0;
      source = 'manual';
    } else if (last) {
      combat = last.combat_power; life = last.life_power; charm = last.charm_power;
    }

    return {
      week_start: weekStart,
      character_name: name,
      nickname: m.nickname,
      game_class: hit?.gameClass || m.game_class,
      combat_power: combat,
      life_power: life,
      charm_power: charm,
      total_score: combat + life + charm,
      official_rank: officialRank,
      source,
      guild_rank: 0,
    };
  });

  // 5) 종합 점수 순으로 길드 내 순위
  rows.sort((a, b) => b.total_score - a.total_score);
  rows.forEach((r, i) => { r.guild_rank = i + 1; });

  const { error: upErr } = await supabase
    .from('guild_rankings')
    .upsert(rows, { onConflict: 'week_start,character_name' });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    weekStart,
    saved: rows.length,
    fromOfficial: rows.filter(r => r.source === 'official').length,
    fromManual: rows.filter(r => r.source === 'manual').length,
    carriedOver: rows.filter(r => r.source === 'carryover').length,
  });
}
