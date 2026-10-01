// 런을 넘어 쌓이는 역대 기록과 업적. 진행 중인 런의 저장(local-save.mjs)과 별개로
// 따로 저장해서 새 런을 시작해도 사라지지 않는다.
import { LEAGUE_LADDER, getLadderIndex } from '../engine/league.mjs';

const KEY = 'fm-roguelike-records';
const HISTORY_LIMIT = 40;

export function emptyRecords() {
  return {
    runs: 0, seasons: 0, promotions: 0, highestTier: 'tier5', doubles: 0,
    titles: Object.fromEntries(LEAGUE_LADDER.map((t) => [t, 0])),
    uclEntries: 0,
    ucl: { league: 0, playoff: 0, r16: 0, qf: 0, sf: 0, final: 0, champion: 0 },
    history: [], // 최근 시즌 기록 { season, club, tierId, result, rank, points, ucl }
  };
}

export function loadRecords(storage) {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return emptyRecords();
    const base = emptyRecords();
    const saved = JSON.parse(raw);
    return { ...base, ...saved, titles: { ...base.titles, ...saved.titles }, ucl: { ...base.ucl, ...saved.ucl } };
  } catch {
    return emptyRecords();
  }
}

export function saveRecords(storage, records) {
  try { storage.setItem(KEY, JSON.stringify(records)); } catch { /* 저장 실패해도 게임은 계속 */ }
}

// 아래 record* 함수는 새 객체를 돌려준다(원본 불변).
export function recordRunStart(r) {
  return { ...r, runs: r.runs + 1 };
}

export function recordPromotion(r) {
  return { ...r, promotions: r.promotions + 1 };
}

export function recordSeason(r, { season, club, tierId, result, rank, points }) {
  const titles = { ...r.titles };
  if (result === 'champion') titles[tierId] = (titles[tierId] ?? 0) + 1;
  const highestTier = getLadderIndex(tierId) > getLadderIndex(r.highestTier) ? tierId : r.highestTier;
  const history = [...r.history, { season, club, tierId, result, rank, points, ucl: null }].slice(-HISTORY_LIMIT);
  return { ...r, seasons: r.seasons + 1, titles, highestTier, history };
}

// 챔피언스리그가 끝난 뒤 호출. 같은 시즌의 가장 최근 기록에 결과를 붙이고, 리그와 챔스를 같은 해에 우승하면 더블.
export function recordUcl(r, { result, season }) {
  const ucl = { ...r.ucl, [result]: (r.ucl[result] ?? 0) + 1 };
  const history = r.history.map((h) => ({ ...h }));
  const entry = [...history].reverse().find((h) => h.season === season && h.ucl === null);
  if (entry) entry.ucl = result;
  const doubles = r.doubles + (result === 'champion' && entry?.result === 'champion' ? 1 : 0);
  return { ...r, uclEntries: r.uclEntries + 1, ucl, history, doubles };
}

const UCL_ORDER = ['league', 'playoff', 'r16', 'qf', 'sf', 'final', 'champion'];
// 그 라운드 "이상"까지 간 횟수(예: 8강 이상 = qf 탈락 + sf + final + champion)
export function uclReached(r, stage) {
  const from = UCL_ORDER.indexOf(stage);
  return UCL_ORDER.slice(from).reduce((n, k) => n + (r.ucl[k] ?? 0), 0);
}
const titleTotal = (r) => Object.values(r.titles).reduce((a, b) => a + b, 0);

// progress: [현재, 목표] (숫자로 쌓는 업적만)
export const ACHIEVEMENTS = [
  { id: 'first_title', group: '커리어', label: '첫 우승', desc: '리그 우승을 한 번 차지한다', check: (r) => titleTotal(r) >= 1 },
  { id: 'escape5', group: '커리어', label: '5부 탈출', desc: '5부에서 처음 승격한다', check: (r) => r.promotions >= 1 },
  { id: 'reach1', group: '커리어', label: '1부 입성', desc: '1부 리그에 올라간다', check: (r) => r.highestTier === 'tier1' },
  { id: 'seasons10', group: '커리어', label: '10시즌 생존', desc: '누적 10시즌을 치른다', check: (r) => r.seasons >= 10, progress: (r) => [Math.min(r.seasons, 10), 10] },
  { id: 'title_tier1', group: '리그', label: '1부 우승', desc: '1부 리그에서 우승한다', check: (r) => r.titles.tier1 >= 1 },
  { id: 'title_all', group: '리그', label: '전 리그 우승', desc: '5부부터 1부까지 모든 리그에서 우승한다', check: (r) => LEAGUE_LADDER.every((t) => r.titles[t] >= 1), progress: (r) => [LEAGUE_LADDER.filter((t) => r.titles[t] >= 1).length, 5] },
  { id: 'title_x5', group: '리그', label: '우승 5회', desc: '리그 우승을 누적 5회 한다', check: (r) => titleTotal(r) >= 5, progress: (r) => [Math.min(titleTotal(r), 5), 5] },
  { id: 'ucl_enter', group: '챔피언스리그', label: '챔스 입성', desc: '챔피언스리그에 처음 진출한다', check: (r) => r.uclEntries >= 1 },
  { id: 'ucl_r16', group: '챔피언스리그', label: '16강 진출', desc: '챔피언스리그 16강에 오른다', check: (r) => uclReached(r, 'r16') >= 1 },
  { id: 'ucl_qf', group: '챔피언스리그', label: '8강 진출', desc: '챔피언스리그 8강에 오른다', check: (r) => uclReached(r, 'qf') >= 1 },
  { id: 'ucl_sf', group: '챔피언스리그', label: '4강 진출', desc: '챔피언스리그 4강에 오른다', check: (r) => uclReached(r, 'sf') >= 1 },
  { id: 'ucl_final', group: '챔피언스리그', label: '결승 진출', desc: '챔피언스리그 결승에 오른다', check: (r) => uclReached(r, 'final') >= 1 },
  { id: 'ucl_champion', group: '챔피언스리그', label: '유럽 정상', desc: '챔피언스리그에서 우승한다', check: (r) => r.ucl.champion >= 1 },
  { id: 'ucl_x3', group: '챔피언스리그', label: '왕조', desc: '챔피언스리그 우승을 누적 3회 한다', check: (r) => r.ucl.champion >= 3, progress: (r) => [Math.min(r.ucl.champion, 3), 3] },
  { id: 'double', group: '챔피언스리그', label: '더블', desc: '같은 시즌에 1부 우승과 챔피언스리그 우승을 모두 차지한다', check: (r) => r.doubles >= 1 },
];

export const unlockedIds = (r) => ACHIEVEMENTS.filter((a) => a.check(r)).map((a) => a.id);

// 기록이 바뀌어 새로 풀린 업적 목록
export function newlyUnlocked(before, after) {
  const had = new Set(unlockedIds(before));
  return ACHIEVEMENTS.filter((a) => a.check(after) && !had.has(a.id));
}
