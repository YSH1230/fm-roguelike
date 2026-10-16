// 밸런스 측정: 자동 감독으로 여러 판을 돌려 리그 통계와 내 팀 성장 곡선을 찍는다.
// 사용: node next/tools/sim.mjs [판 수=30] [최대 시즌=8] [정책=basic|smart]
import { upgradeFacility, upgradeCost } from '../engine/economy.mjs';
import { coachCost, generateCoachCandidates, hireCoach } from '../engine/coach.mjs';
import { standings } from '../engine/league.mjs';
import { myLeague } from '../engine/world.mjs';
import { teamRatings } from '../engine/ratings.mjs';
import { autoOffseason, startedGame } from '../tests/helpers.mjs';
import { finishSeason, playNextChunk } from '../engine/game.mjs';

const GAMES = Number(process.argv[2] ?? 30);
const SEASONS = Number(process.argv[3] ?? 8);
const POLICY = process.argv[4] ?? 'basic';

// smart: 코치 재계약 예비비(RESERVE)를 남기고 남는 코인으로 시설을 가장 싼 것부터 올린다
const RESERVE = Number(process.env.RESERVE ?? 60);
function spend(g) {
  for (let guard = 0; guard < 20; guard += 1) {
    const opts = ['stadium', 'training', 'rehab'].filter((k) => g.club.facilities[k] < 10).map((k) => ({ k, c: upgradeCost(g.club, k) }));
    opts.sort((a, b) => a.c - b.c);
    if (opts.length && opts[0].c + RESERVE <= g.club.coins) { upgradeFacility(g.club, opts[0].k); continue; }
    break;
  }
}

function playSeason(g, stats) {
  while (g.phase === 'manage') {
    const r = playNextChunk(g);
    g.pending.press = null;
    stats.matches.push(...r.matches);
    if (POLICY === 'smart') spend(g);
  }
  const before = standings(myLeague(g.world));
  const rank = before.findIndex((r) => r.id === 'ME') + 1;
  const top = before[0];
  const tier = g.myTeam.tier;
  const season = finishSeason(g);
  return { rank, tier, fate: season.fate, coins: g.club.coins, topPts: top.points, myPts: before[rank - 1].points };
}

const byTier = { 1: { n: 0, ranks: [], fates: {} }, 2: { n: 0, ranks: [], fates: {} }, 3: { n: 0, ranks: [], fates: {} } };
const agg = { games: 0, seasons: new Map(), fired: 0, firedAt: [], reached: { 2: [], 1: [] }, matches: 0, goals: 0, draws: 0, homeWins: 0, awayWins: 0, coinsEnd: [] };
const bySeason = (n) => { if (!agg.seasons.has(n)) agg.seasons.set(n, { ranks: [], tier: [], coins: [], fates: {} }); return agg.seasons.get(n); };
const t0 = Date.now();
for (let seed = 1; seed <= GAMES; seed += 1) {
  const g = startedGame(seed);
  agg.games += 1;
  for (let s = 1; s <= SEASONS; s += 1) {
    const stats = { matches: [] };
    const res = playSeason(g, stats);
    for (const m of stats.matches) { /* 내 경기만 */ }
    const row = bySeason(s);
    const bt = byTier[res.tier]; bt.n += 1; bt.ranks.push(res.rank); bt.fates[res.fate] = (bt.fates[res.fate] ?? 0) + 1;
    row.ranks.push(res.rank); row.tier.push(res.tier); row.coins.push(res.coins);
    row.fates[res.fate] = (row.fates[res.fate] ?? 0) + 1;
    if (res.tier === 2 && !agg.reached[2].some((x) => x.seed === seed)) agg.reached[2].push({ seed, s });
    if (res.tier === 1 && !agg.reached[1].some((x) => x.seed === seed)) agg.reached[1].push({ seed, s });
    if (g.phase === 'ended') { agg.fired += 1; agg.firedAt.push(s); break; }
    autoOffseason(g);
  }
  agg.coinsEnd.push(g.club.coins);
}
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
console.log(`정책 ${POLICY}, ${GAMES}판 x 최대 ${SEASONS}시즌 (${((Date.now() - t0) / 1000).toFixed(1)}초)`);
console.log(`경질로 끝난 판: ${agg.fired}/${agg.games}, 경질 시즌: ${agg.firedAt.join(',') || '-'}`);
for (const [n, r] of agg.seasons) {
  const tiers = [3, 2, 1].map((t) => r.tier.filter((x) => x === t).length).join('/');
  console.log(`시즌${n}: 생존 ${r.ranks.length} · 3/2/1부 ${tiers} · 평균순위 ${avg(r.ranks).toFixed(1)} · 평균코인 ${avg(r.coins).toFixed(0)} · 운명 ${JSON.stringify(r.fates)}`);
}
for (const t of [3, 2, 1]) console.log(`${t}부 시즌 ${byTier[t].n}개: 평균순위 ${avg(byTier[t].ranks).toFixed(1)} · 운명 ${JSON.stringify(byTier[t].fates)}`);
console.log(`2부 도달: ${agg.reached[2].length}판 (평균 ${avg(agg.reached[2].map((x) => x.s)).toFixed(1)}시즌), 1부 도달: ${agg.reached[1].length}판`);
