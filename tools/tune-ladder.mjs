// 리그 단계별 결과 분포 실측. 티어 승점 기준선을 정하는 근거 자료를 만든다.
// 실제 플레이를 근사한다: 12주 동안 자금을 다 쓰며 베스트11을 올리는 플레이어.
import { generateSquadPool, TIER5_SQUAD_WEIGHTS } from '../data/generate-player.mjs';
import { generateShopOffer } from '../data/draft-shop.mjs';
import { runHalfSeason, judgeSeasonResult } from '../engine/season.mjs';
import { applyTransactionDecay } from '../engine/chemistry.mjs';
import { computeAverageOVR } from '../engine/team-power.mjs';
import { applyCostModifiers, calculateStartingFunds } from '../engine/economy.mjs';
import { LEAGUE_LADDER, getLeagueTier, getLadderIndex } from '../engine/league.mjs';
import {
  CHEMISTRY_START, CHEMISTRY_DECAY_PER_TRANSACTION, WINTER_TAX_RATIO, SHOP_OFFER_SIZE,
} from '../engine/constants.mjs';

const SLOTS = ['GK', 'CB', 'CB', 'WB', 'WB', 'CMF', 'CMF', 'CMF', 'W', 'W', 'ST'];

function pickBestXI(squad) {
  const used = new Set();
  const lineup = [];
  for (const pos of SLOTS) {
    const byPos = squad.filter((p) => !used.has(p.id) && p.position === pos).sort((a, b) => b.baseOVR - a.baseOVR);
    const fallback = squad.filter((p) => !used.has(p.id)).sort((a, b) => b.baseOVR - a.baseOVR);
    const pick = byPos[0] ?? fallback[0];
    if (pick) { used.add(pick.id); lineup.push(pick); }
  }
  const bench = squad.filter((p) => !used.has(p.id)).sort((a, b) => b.baseOVR - a.baseOVR).slice(0, 5)
    .map((p) => ({ ...p, inBench: true }));
  return { lineup, bench };
}

const toSquad = (c) => ({ ...c, seasonsAtClub: 0, acquiredThisSeason: true, inBench: false });

// 해당 리그에 갓 승격한 팀을 근사한다: 아래 리그에서 시즌 수만큼 스쿼드를 키운 상태.
function playSeason(tierId, carriedSquad, carriedFunds) {
  let squad = carriedSquad ?? generateSquadPool(TIER5_SQUAD_WEIGHTS).map(toSquad);
  let funds = carriedFunds ?? calculateStartingFunds(getLadderIndex(tierId));
  let chem = CHEMISTRY_START;
  let firstHalf = null;

  for (const phase of ['summer', 'winter']) {
    for (let w = 0; w < (phase === 'summer' ? 8 : 4); w++) {
      for (const card of generateShopOffer(SHOP_OFFER_SIZE).sort((a, b) => b.baseOVR - a.baseOVR)) {
        const price = applyCostModifiers(card.price, phase === 'winter' ? [WINTER_TAX_RATIO] : []);
        if (funds < price) continue;
        const before = pickBestXI(squad);
        const after = pickBestXI([...squad, toSquad(card)]);
        if (computeAverageOVR(after.lineup, after.bench) <= computeAverageOVR(before.lineup, before.bench)) continue;
        funds -= price;
        squad = [...squad, toSquad(card)];
        chem = applyTransactionDecay(chem, 1, CHEMISTRY_DECAY_PER_TRANSACTION);
      }
    }
    const { lineup, bench } = pickBestXI(squad);
    const pts = runHalfSeason(lineup, bench, 'tactician', chem, tierId);
    if (phase === 'summer') firstHalf = pts;
    else return { points: firstHalf + pts, squad, funds };
  }
}

const N = Number(process.argv[2] ?? 800);
console.log(`리그별 결과 분포 (${N}판, 아래 리그에서 스쿼드를 이어받아 승격한 상황)\n`);
console.log('리그    우승    승격    안전    강등   평균승점   평균전력');

// 승격 스쿼드를 한 개만 물려주면(초기 구현) 그 한 판의 운이 위 리그 3000판
// 전체를 흔들어서 같은 숫자로 3부 우승률이 7%와 2%로 갈렸다. 통과한 스쿼드
// 전부를 풀로 물려주고 매 판 무작위로 하나 뽑는다.
let pool = null;
let funds = null;
for (const tierId of LEAGUE_LADDER) {
  const counts = { champion: 0, promotion: 0, safe: 0, relegation: 0 };
  let sum = 0;
  let powerSum = 0;
  const nextPool = [];
  for (let i = 0; i < N; i++) {
    const carried = pool ? structuredClone(pool[Math.floor(Math.random() * pool.length)]) : null;
    const r = playSeason(tierId, carried, funds);
    const result = judgeSeasonResult(r.points, tierId);
    counts[result] += 1;
    sum += r.points;
    const xi = pickBestXI(r.squad);
    powerSum += computeAverageOVR(xi.lineup, xi.bench);
    // 강등된 팀은 위 리그로 안 간다 — 통과한 스쿼드만 물려준다
    if (result !== 'relegation') nextPool.push(r.squad);
  }
  const pct = (k) => `${((counts[k] / N) * 100).toFixed(1)}%`.padStart(7);
  console.log(
    `${getLeagueTier(tierId).label.padEnd(6)}${pct('champion')}${pct('promotion')}${pct('safe')}${pct('relegation')}`
    + `${(sum / N).toFixed(1).padStart(10)}${(powerSum / N).toFixed(1).padStart(11)}`
  );
  // 다음 리그는 이 리그를 통과한 스쿼드로 시작한다
  pool = nextPool.length > 0 ? nextPool : pool;
  funds = calculateStartingFunds(getLadderIndex(tierId) + 1);
}
