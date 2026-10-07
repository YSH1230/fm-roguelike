// 커리어 시뮬레이터: 5부에서 시작해 1부 우승(=런 승리)과 챔피언스리그 우승을 노리는 봇이
// 승격·강등·계약·노화·자금 회수까지 게임 규칙대로 여러 시즌을 이어서 플레이한다.
// 사용: node tools/sim-career.mjs <커리어 수> [--strategy greedy|tags|focus] [--out 파일.json]
//  greedy: OVR 최고 순 자동 선발(태그를 안 보는 방치 플레이)
//  tags:   시즌 치를 때 태그/역할까지 최적화한 라인업
//  focus:  tags + 가장 흔한 태그를 노리고 모으는 플레이
//  smart:  영입 판단부터 태그·역할까지 최적화한 라인업 기준(태그를 아는 플레이어). 느리다.
// 모델에 없는 것: 이사진 요구/목표 보상, 이벤트, 감독·스태프 구매 비용(리그별 고정 등급으로 가정),
// 방출 환급, 대륙·특수 태그 성향 노림. 계약은 만료되면 가치 높은 선수만 2년 갱신한다.
import fs from 'node:fs';
import { FORMATIONS } from '../ui/formations.mjs';
import { generateStartingSquad } from '../data/generate-player.mjs';
import { generateShopOffer } from '../data/draft-shop.mjs';
import { runHalfSeason, judgeSeasonResult } from '../engine/season.mjs';
import { applyTransactionDecay } from '../engine/chemistry.mjs';
import { computeAverageOVR, computeTeamPower } from '../engine/team-power.mjs';
import { computePlaystyleSynergyBonus } from '../engine/ovr.mjs';
import { applyCostModifiers, calculateStartingFunds, recallFunds, renewalCost } from '../engine/economy.mjs';
import { getLeagueTier, getLadderIndex, getNextTier } from '../engine/league.mjs';
import { optimizeLineup } from '../engine/lineup.mjs';
import { ageSquad } from '../engine/aging.mjs';
import { finalLeagueRank } from '../engine/half-results.mjs';
import { judgeRunOutcome, nextMissedTargetCount } from '../engine/run.mjs';
import { createUcl, advanceUcl, UCL_REWARDS_FUNDS } from '../engine/champions-league.mjs';
import {
  CHEMISTRY_START, CHEMISTRY_DECAY_PER_TRANSACTION, WINTER_TAX_RATIO, SHOP_OFFER_SIZE,
  PROMOTION_STAY_FUNDS_RATIO, SAME_LEAGUE_FUNDS_RATIO, STAGNATION_FUNDS_PENALTY_PER_MISS, PLAYSTYLE_TAGS, ADVANCED_TAGS,
  SCOUT_TARGET_SLOTS_BY_LEVEL, COACH_UNITS,
} from '../engine/constants.mjs';

const argv = process.argv.slice(2);
const N = Number(argv[0] ?? 500);
const opt = (name, dflt) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : dflt; };
const STRATEGY = opt('--strategy', 'greedy');
const OUT = opt('--out', null);
const TAGS = STRATEGY !== 'greedy';
const FOCUS = STRATEGY === 'focus';
const SMART = STRATEGY === 'smart';
const MAX_SEASONS = 40;
const SQUAD_CAP = 26;

const BOT_MANAGER = { tier5: 'tactician', tier4: 'tactician', tier3: 'tactician', tier2: 'legendary', tier1: 'legendary' };
const BOT_COACH = 'proLicense';
// 코치 주력 유닛은 시즌마다 그 포메이션에서 슬롯이 가장 많은 유닛으로 바꾼다(사람도 포메이션에 맞춰 바꾼다).
const COACH = { level: BOT_COACH, focus: 'defense' };
function bestCoachFocus(slots) {
  const size = (u) => slots.filter((p) => COACH_UNITS[u].includes(p)).length;
  return Object.keys(COACH_UNITS).sort((a, b) => size(b) - size(a))[0];
}
const BOT_SCOUT = 'proLicense'; // smart 봇만 목표 태그를 쓴다(주 1장 보장)
const BASE_SLOTS = FORMATIONS['4-3-3'].slots;
let SLOTS = BASE_SLOTS; // smart 봇은 목표 태그 수혜 슬롯이 가장 많은 포메이션을 시즌마다 고른다
function bestFormationFor(tag) {
  const count = (slots) => slots.filter((p) => PLAYSTYLE_TAGS[tag].positions.includes(p)).length;
  return Object.values(FORMATIONS).map((f) => f.slots).sort((a, b) => count(b) - count(a))[0];
}

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
const toSquad = (c) => ({ ...c, seasonsAtClub: 0, acquiredThisSeason: true, inBench: false, contractYearsLeft: 2 });
// 태그·역할까지 반영한 최적 라인업의 평균 OVR(smart 영입 판단용)
function optimalAvg(squad) {
  const { xi, bench } = optimizeLineup(squad, SLOTS, 5);
  return computeAverageOVR(xi.filter(Boolean), bench);
}
function seasonXI(squad) {
  if (!TAGS) return pickBestXI(squad);
  const { xi, bench } = optimizeLineup(squad, SLOTS, 5);
  return { lineup: xi.filter(Boolean), bench: bench.map((p) => ({ ...p, inBench: true })) };
}
function topTag(squad) {
  const count = {};
  for (const p of squad) for (const t of p.playstyleTags ?? []) count[t] = (count[t] ?? 0) + 1;
  return Object.entries(count).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}
// 라인업에서 보너스가 실제로 붙은 태그 수와 선수 1인당 평균 태그 보너스
function tagStats(lineup) {
  const b = computePlaystyleSynergyBonus(lineup);
  let sum = 0; for (const v of b.values()) sum += v;
  const active = Object.keys(PLAYSTYLE_TAGS).filter((t) => lineup.filter((p) => p.playstyleTags.includes(t)).length >= 3).length;
  return { active, perPlayer: lineup.length ? sum / lineup.length : 0 };
}

// smart 봇의 스카우터 목표 태그: 지금 선수단에서 그 태그를 받는 포지션 보유자가 가장 많은 고급 태그(없으면 무작위 보통 태그).
function chooseTarget(squad) {
  const score = (t) => squad.filter((p) => p.playstyleTags.includes(t) && PLAYSTYLE_TAGS[t].positions.includes(p.position)).length;
  const best = Math.max(...ADVANCED_TAGS.map(score));
  const pool = best > 0 ? ADVANCED_TAGS.filter((t) => score(t) === best) : ADVANCED_TAGS.filter((t) => PLAYSTYLE_TAGS[t].grade === 'mid');
  return pool[Math.floor(Math.random() * pool.length)];
}

// 앞내다보기: 목표 태그 카드는 "다음 문턱을 채울 때의 총 이득"을 남은 인원으로 나눈 만큼(평균 OVR 단위) 가치를 더 쳐준다.
// 문턱 사이(예: 3→5명)의 4번째 보유자는 당장 이득이 0이라 탐욕 평가로는 영영 못 산다 - 사람은 계획해서 산다.
function progressCredit(squad, card, tag) {
  if (!tag || !card.playstyleTags.includes(tag) || !PLAYSTYLE_TAGS[tag].positions.includes(card.position)) return 0;
  const def = PLAYSTYLE_TAGS[tag];
  const holders = squad.filter((p) => p.playstyleTags.includes(tag) && def.positions.includes(p.position)).length;
  const curTier = def.thresholds.filter((n) => holders >= n).length;
  if (curTier >= def.thresholds.length) return 0;
  const need = def.thresholds[curTier];
  const curTotal = (curTier ? def.values[curTier - 1] : 0) * holders;
  return Math.max(0, (def.values[curTier] * need - curTotal) / (need - holders) / 11);
}

function playUcl(lineup, bench, chem) {
  const extras = { leagueTierId: 'tier1' };
  const power = computeTeamPower(lineup, bench, BOT_MANAGER.tier1, chem, COACH, extras);
  const away = computeTeamPower(lineup, bench, BOT_MANAGER.tier1, chem / 2, COACH, extras);
  let s = createUcl(power, Math.random, { myPowerAway: away });
  for (let i = 0; i < 40 && s.stage !== 'done'; i++) s = advanceUcl(s, Math.random);
  return s.result;
}

function playCareer() {
  let tierId = 'tier5';
  let squad = generateStartingSquad().map((p) => ({ ...toSquad(p), contractYearsLeft: Math.random() < 0.5 ? 1 : 2 }));
  let leftover = 0; let proceeds = 0;
  let missed = 0; let promotedPending = false; let first = true;
  const seasons = [];
  let reason = 'cap'; let uclTitles = 0;

  for (let s = 0; s < MAX_SEASONS; s++) {
    const base = calculateStartingFunds(getLadderIndex(tierId));
    const ratio = first ? 1 : promotedPending ? PROMOTION_STAY_FUNDS_RATIO : SAME_LEAGUE_FUNDS_RATIO;
    const grant = Math.round(base * ratio * Math.max(0, 1 - missed * STAGNATION_FUNDS_PENALTY_PER_MISS));
    const carried = first ? 0 : recallFunds(leftover, grant).carried;
    let funds = grant + carried + proceeds;
    proceeds = 0; promotedPending = false;

    if (!first) {
      // 새 시즌: 노화·은퇴, 계약 -1년. 만료된 선수는 가치 높은 순으로 2년 갱신(돈이 되는 만큼만)하고 나머지는 떠난다.
      squad = ageSquad(squad).squad.map((p) => ({ ...p, contractYearsLeft: Math.max(0, p.contractYearsLeft - 1), acquiredThisSeason: false }));
      const keepers = new Set(pickBestXI(squad).lineup.map((p) => p.id));
      pickBestXI(squad).bench.forEach((p) => keepers.add(p.id));
      for (const p of squad.filter((x) => x.contractYearsLeft <= 0).sort((a, b) => b.baseOVR - a.baseOVR)) {
        const cost = renewalCost(p.price, 2);
        if (keepers.has(p.id) && funds >= cost) { funds -= cost; p.contractYearsLeft = 2; }
      }
      squad = squad.filter((p) => p.contractYearsLeft > 0);
    }
    first = false;

    let chem = CHEMISTRY_START;
    let firstHalf = 0; let buys = 0; let spent = 0;
    const focusTag = FOCUS ? topTag(squad) : null;
    const targetTag = SMART ? chooseTarget(squad) : null;
    SLOTS = targetTag ? bestFormationFor(targetTag) : BASE_SLOTS;
    COACH.focus = bestCoachFocus(SLOTS);
    let lineup; let bench; let secondHalf = 0;
    for (const phase of ['summer', 'winter']) {
      for (let w = 0; w < (phase === 'summer' ? 8 : 4); w++) {
        if (SMART) {
          // 살 수 있는 매물을 태그 반영 이득이 큰 순서로, 사고 나면 다시 평가한다.
          let pool = generateShopOffer(SHOP_OFFER_SIZE, [], Math.random, tierId, targetTag, SCOUT_TARGET_SLOTS_BY_LEVEL[BOT_SCOUT])
            .map((card) => ({ card, price: applyCostModifiers(card.price, phase === 'winter' ? [WINTER_TAX_RATIO] : []) }));
          for (;;) {
            const base = optimalAvg(squad);
            const ranked = pool.filter((o) => funds >= o.price)
              .map((o) => ({ ...o, gain: optimalAvg([...squad, toSquad(o.card)]) - base + progressCredit(squad, o.card, targetTag) }))
              .sort((x, y) => y.gain - x.gain);
            if (!ranked.length || ranked[0].gain <= 0.02) break;
            const best = ranked[0];
            funds -= best.price; spent += best.price; buys += 1;
            squad = [...squad, toSquad(best.card)];
            chem = applyTransactionDecay(chem, 1, CHEMISTRY_DECAY_PER_TRANSACTION);
            pool = pool.filter((o) => o !== pool.find((p) => p.card === best.card));
          }
          continue;
        }
        const offers = generateShopOffer(SHOP_OFFER_SIZE, [], Math.random, tierId)
          .sort((a, b) => (focusTag ? (b.playstyleTags.includes(focusTag) - a.playstyleTags.includes(focusTag)) : 0) || b.baseOVR - a.baseOVR);
        for (const card of offers) {
          const price = applyCostModifiers(card.price, phase === 'winter' ? [WINTER_TAX_RATIO] : []);
          if (funds < price) continue;
          const before = pickBestXI(squad);
          const after = pickBestXI([...squad, toSquad(card)]);
          const gain = computeAverageOVR(after.lineup, after.bench) - computeAverageOVR(before.lineup, before.bench);
          const tolerance = focusTag && card.playstyleTags.includes(focusTag) ? -0.35 : 0;
          if (gain <= tolerance) continue;
          funds -= price; spent += price; buys += 1;
          squad = [...squad, toSquad(card)];
          chem = applyTransactionDecay(chem, 1, CHEMISTRY_DECAY_PER_TRANSACTION);
        }
      }
      // 선수단이 불어나면 느려지니 하위권은 정리(방출 환급은 모델 안 함)
      if (squad.length > SQUAD_CAP) squad = [...squad].sort((a, b) => b.baseOVR - a.baseOVR).slice(0, SQUAD_CAP);
      ({ lineup, bench } = seasonXI(squad));
      const pts = runHalfSeason(lineup, bench, BOT_MANAGER[tierId], chem, tierId, Math.random, COACH);
      if (phase === 'summer') firstHalf = pts; else secondHalf = pts;
    }

    const total = firstHalf + secondHalf;
    const result = judgeSeasonResult(total, tierId);
    const tierDef = getLeagueTier(tierId);
    const isTop = getNextTier(tierId) === null;
    const rank = finalLeagueRank(total, tierDef, result, Math.random, isTop ? 4 : 3);
    const xi = pickBestXI(squad);
    const rec = {
      tier: tierId, points: total, result, rank, buys, spent, leftover: Math.round(funds), grant,
      avgOVR: computeAverageOVR(xi.lineup, xi.bench), ...tagStats(lineup), ucl: null,
    };
    seasons.push(rec);
    leftover = funds;

    if (isTop && rank <= 4) {
      rec.ucl = playUcl(lineup, bench, CHEMISTRY_START);
      proceeds += UCL_REWARDS_FUNDS[rec.ucl] ?? 0;
      if (rec.ucl === 'champion') uclTitles += 1;
    }

    const outcome = judgeRunOutcome({ seasonResult: result, leagueTierId: tierId, missedTargetCount: missed });
    if (outcome.ended) { reason = outcome.reason; break; }
    missed = nextMissedTargetCount(result, missed);
    if (outcome.canPromote) { tierId = getNextTier(tierId); promotedPending = true; }
  }
  return { seasons, reason, uclTitles };
}

const t0 = Date.now();
const careers = [];
for (let i = 0; i < N; i++) {
  careers.push(playCareer());
  if ((i + 1) % 25 === 0) process.stderr.write(`\r${i + 1}/${N} ${(Date.now() - t0) / 1000 | 0}s`);
}
process.stderr.write('\n');
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ strategy: STRATEGY, N, careers }));
console.log(JSON.stringify({ strategy: STRATEGY, N, secs: (Date.now() - t0) / 1000 }));
