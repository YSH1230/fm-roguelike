// 사람처럼 플레이하는 커리어 봇. sim-career의 smart(태그·포메이션·스카우터 목표)에 아래를 더했다.
//  - 선수 판매 순환: 선발·벤치 밖 선수는 매주 판매 등록하고(여름 50~100% / 겨울 70~110%) 그 돈으로 다시 영입한다.
//  - 감독·스태프도 돈을 내고 산다(리그별 목표 등급, 영입비 + 위약금). 코치 주력 유닛/스카우터 능력도 쓴다.
//  - 겨울 지원금, 이사진 목표·요구 보상, 챔피언스리그 상금, 적응도 회복/하락, 포메이션·코치 주력 선택.
// 모델에 없는 것: 시즌 이벤트(좋고 나쁜 게 평균적으로 거의 상쇄), 성골 유스 같은 특수 성향 노림, GOD 영입.
// 사용: node tools/sim-human.mjs <커리어 수> [--out 파일.json]
import fs from 'node:fs';
import { FORMATIONS } from '../ui/formations.mjs';
import { generateStartingSquad } from '../data/generate-player.mjs';
import { generateShopOffer } from '../data/draft-shop.mjs';
import { runHalfSeason, judgeSeasonResult, advanceWeek, boardGoalPoints, boardReward } from '../engine/season.mjs';
import { applyTransactionDecay } from '../engine/chemistry.mjs';
import { computeAverageOVR, computeTeamPower } from '../engine/team-power.mjs';
import { computePlaystyleSynergyBonus } from '../engine/ovr.mjs';
import { applyCostModifiers, calculateStartingFunds, calculatePlayerPrice, computeReleaseProceeds, recallFunds, generateSaleOffers, FUNDS_SCALE, fundsScale } from '../engine/economy.mjs';
import { getLeagueTier, getLadderIndex, getNextTier } from '../engine/league.mjs';
import { optimizeLineup } from '../engine/lineup.mjs';
import { ageSquad, agePriceMult } from '../engine/aging.mjs';
import { finalLeagueRank } from '../engine/half-results.mjs';
import { judgeRunOutcome, nextMissedTargetCount } from '../engine/run.mjs';
import { createUcl, advanceUcl, UCL_REWARDS_FUNDS } from '../engine/champions-league.mjs';
import {
  CHEMISTRY_START, WINTER_TAX_RATIO, WINTER_FUNDS_RATIO, PROMOTION_STAY_FUNDS_RATIO, SAME_LEAGUE_FUNDS_RATIO,
  STAGNATION_FUNDS_PENALTY_PER_MISS, PLAYSTYLE_TAGS, ADVANCED_TAGS, COACH_UNITS, COACH_CHEMISTRY_DECAY_BY_LEVEL,
  SCOUT_SHOP_OFFER_SIZE_BY_LEVEL, SCOUT_QUALITY_BOOST_BY_LEVEL, SCOUT_TARGETS_BY_LEVEL, MANAGER_PRICE_TABLE, STAFF_PRICE_TABLE,
  squadCapFor, PLAYER_TIERS, PLAYER_PRICE_TABLE, TRAIT_PRICE_MULT, BOARD_DEMAND_REWARD, CHEMISTRY_DECAY_PER_TRANSACTION, POSITIONS,
} from '../engine/constants.mjs';

Object.assign(FUNDS_SCALE, JSON.parse(process.env.FS ?? '{}')); // 실험용: FS='{"tier1":0.5}'
const argv = process.argv.slice(2);
const N = Number(argv[0] ?? 100);
const OUT = argv.includes('--out') ? argv[argv.indexOf('--out') + 1] : null;
const MAX_SEASONS = 25;
const BASE_SLOTS = FORMATIONS['4-3-3'].slots;
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

// 리그별로 사람이 맞춰 가는 감독·스태프 목표 등급
const MANAGER_TARGET = { tier5: 'rookie', tier4: 'tactician', tier3: 'tactician', tier2: 'legendary', tier1: 'legendary' };
const COACH_TARGET = { tier5: 'academy', tier4: 'proLicense', tier3: 'proLicense', tier2: 'veteran', tier1: 'master' };
const SCOUT_TARGET = { tier5: 'academy', tier4: 'proLicense', tier3: 'proLicense', tier2: 'veteran', tier1: 'veteran' };
const MANAGER_ORDER = ['rookie', 'tactician', 'legendary'];
const STAFF_ORDER = ['academy', 'proLicense', 'veteran', 'master'];
const mid = ([a, b]) => Math.round((a + b) / 2);

const toSquad = (c, bought = false) => ({ ...c, seasonsAtClub: 0, acquiredThisSeason: true, boughtThisSeason: bought, inBench: false });

// 해금 전 태그·특수 성향은 카드에 안 붙는다(ui/app.mjs stripLockedTags와 같은 규칙, 계정이 처음일 때 기준)
function lockStrip(card, season) {
  const open = (t) => { const g = PLAYSTYLE_TAGS[t].grade; return g === 'basic' || (g === 'mid' && season >= 2) || (g === 'hard' && season >= 3); };
  const out = { ...card, playstyleTags: card.playstyleTags.filter(open) };
  if (card.specialTrait && season < 3) { out.price = Math.round(card.price / (TRAIT_PRICE_MULT[card.specialTrait] ?? 1)); out.specialTrait = null; }
  return out;
}

function tierOfOvr(ovr) {
  for (const [id, t] of Object.entries(PLAYER_TIERS)) if (ovr >= t.minOVR && ovr <= t.maxOVR) return id;
  return ovr > 94 ? null : 'local';
}
// 시즌 시작 몸값 재계산(ui/app.mjs repricePlayer와 같다)
function repricePlayer(p) {
  if (!p.price) return p;
  const tier = tierOfOvr(p.baseOVR);
  const range = tier && PLAYER_PRICE_TABLE[tier];
  if (!range) return p;
  const base = Math.min(range[1], Math.max(range[0], calculatePlayerPrice(tier, p.baseOVR)));
  return { ...p, price: Math.round(base * (TRAIT_PRICE_MULT[p.specialTrait] ?? 1) * agePriceMult(p.age)) };
}

function bestFormationFor(tag) {
  const count = (slots) => slots.filter((p) => PLAYSTYLE_TAGS[tag].positions.includes(p)).length;
  return Object.values(FORMATIONS).map((f) => f.slots).sort((a, b) => count(b) - count(a))[0];
}
function bestCoachFocus(slots) {
  const size = (u) => slots.filter((p) => COACH_UNITS[u].includes(p)).length;
  return Object.keys(COACH_UNITS).sort((a, b) => size(b) - size(a))[0];
}
function chooseTarget(squad) {
  const score = (t) => squad.filter((p) => p.playstyleTags.includes(t) && PLAYSTYLE_TAGS[t].positions.includes(p.position)).length;
  const best = Math.max(...ADVANCED_TAGS.map(score));
  const pool = best > 0 ? ADVANCED_TAGS.filter((t) => score(t) === best) : ADVANCED_TAGS.filter((t) => PLAYSTYLE_TAGS[t].grade === 'mid');
  return pool[Math.floor(Math.random() * pool.length)];
}
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
function tagStats(lineup) {
  const b = computePlaystyleSynergyBonus(lineup);
  let sum = 0; for (const v of b.values()) sum += v;
  return { perPlayer: lineup.length ? sum / lineup.length : 0 };
}

function playCareer() {
  let tierId = 'tier5';
  let squad = generateStartingSquad().map((p) => toSquad(lockStrip(p, 1)));
  let manager = { tier: 'rookie', price: mid(MANAGER_PRICE_TABLE.rookie) };
  let coachLevel = 'academy'; let scoutLevel = 'academy';
  let leftover = 0; let proceeds = 0; let listed = [];
  let missed = 0; let promotedPending = false; let first = true;
  const seasons = []; let reason = 'cap'; let uclTitles = 0;

  for (let s = 0; s < MAX_SEASONS; s++) {
    const base = calculateStartingFunds(getLadderIndex(tierId)) * fundsScale(tierId, s + 1);
    const ratio = first ? 1 : promotedPending ? PROMOTION_STAY_FUNDS_RATIO : SAME_LEAGUE_FUNDS_RATIO;
    const grant = Math.round(base * ratio * Math.max(0, 1 - missed * STAGNATION_FUNDS_PENALTY_PER_MISS));
    let funds = grant + (first ? 0 : recallFunds(leftover, grant).carried) + proceeds;
    proceeds = 0; promotedPending = false;
    let salesIncome = 0; let staffSpend = 0;

    if (!first) {
      squad = ageSquad(squad).squad.map(repricePlayer).map((p) => ({ ...p, seasonsAtClub: (p.seasonsAtClub ?? 0) + 1, acquiredThisSeason: false, boughtThisSeason: false }));
    }
    first = false;

    // 시즌 시작 팀 전력(승격해서 올라온 직후 상단에 보이는 값) - 포메이션/주력은 아래에서 고른다
    const targetTag = chooseTarget(squad);
    let SLOTS = bestFormationFor(targetTag);
    let focus = bestCoachFocus(SLOTS);
    const powerOf = (sq, chem) => {
      const { xi, bench } = optimizeLineup(sq, SLOTS, 5);
      const lineup = xi.filter(Boolean);
      return { power: computeTeamPower(lineup, bench, manager.tier, chem, { level: coachLevel, focus }, { leagueTierId: tierId }), avgOVR: computeAverageOVR(lineup, bench), lineup, bench };
    };
    const startInfo = powerOf(squad, CHEMISTRY_START);

    // 감독·스태프 투자(리그별 목표 등급까지, 감독 → 코치 → 스카우터 순)
    const staffOpen = s + 1 >= 3; // 감독·스태프는 3시즌부터 열린다
    const wantM = staffOpen ? MANAGER_ORDER.indexOf(MANAGER_TARGET[tierId]) : -1;
    if (MANAGER_ORDER.indexOf(manager.tier) < wantM) {
      const next = MANAGER_ORDER[MANAGER_ORDER.indexOf(manager.tier) + 1];
      const cost = mid(MANAGER_PRICE_TABLE[next]) + Math.round(manager.price * 0.5);
      if (funds >= cost + 40) { funds -= cost; staffSpend += cost; manager = { tier: next, price: mid(MANAGER_PRICE_TABLE[next]) }; }
    }
    for (const [role, target] of [['coach', COACH_TARGET[tierId]], ['scout', SCOUT_TARGET[tierId]]]) {
      if (!staffOpen) break;
      const cur = role === 'coach' ? coachLevel : scoutLevel;
      if (STAFF_ORDER.indexOf(cur) >= STAFF_ORDER.indexOf(target)) continue;
      const next = STAFF_ORDER[STAFF_ORDER.indexOf(cur) + 1];
      const cost = mid(STAFF_PRICE_TABLE[next]);
      if (funds >= cost + 60) { funds -= cost; staffSpend += cost; if (role === 'coach') coachLevel = next; else scoutLevel = next; }
    }

    let chem = CHEMISTRY_START;
    let buys = 0; let spent = 0; let week = 0;
    const caps = SCOUT_TARGETS_BY_LEVEL[scoutLevel];
    const decay = COACH_CHEMISTRY_DECAY_BY_LEVEL[coachLevel] ?? CHEMISTRY_DECAY_PER_TRANSACTION;
    let firstHalf = 0; let secondHalf = 0; let lineup; let bench;
    const optimalAvg = (sq) => { const { xi, bench: b } = optimizeLineup(sq, SLOTS, 5); return computeAverageOVR(xi.filter(Boolean), b); };

    for (const phase of ['summer', 'winter']) {
      if (phase === 'winter') {
        funds += Math.round(base * WINTER_FUNDS_RATIO * 1); // 겨울 지원금
        squad = squad.map((p) => ({ ...p, boughtThisSeason: false })); // 여름에 산 선수는 겨울부터 판매 가능
      }
      for (let w = 0; w < (phase === 'summer' ? 8 : 4); w++) {
        week += 1;
        // 지난주에 낸 판매 등록 정산
        const due = listed.filter((l) => l.resolveWeek <= week);
        listed = listed.filter((l) => l.resolveWeek > week);
        for (const l of due) { const p = computeReleaseProceeds(l.card.price, l.method); funds += p; salesIncome += p; }

        // 스카우터 목표: 태그, 포지션(선발에서 가장 약한 자리)
        let targetPos = null;
        if (caps.position) {
          const cur = optimizeLineup(squad, SLOTS, 5).xi.filter(Boolean);
          const weakest = [...cur].sort((a, b) => a.baseOVR - b.baseOVR)[0];
          targetPos = weakest?.position ?? null;
        }
        const useTag = caps.tag && !(caps.exclusive && targetPos);
        const size = SCOUT_SHOP_OFFER_SIZE_BY_LEVEL[scoutLevel];
        let pool = generateShopOffer(size, [], Math.random, tierId, useTag ? targetTag : null, useTag ? 1 : 0, caps.position ? targetPos : null, SCOUT_QUALITY_BOOST_BY_LEVEL[scoutLevel], caps.combined)
          .map((c0) => { const card = lockStrip(c0, s + 1); return { card, price: applyCostModifiers(card.price, phase === 'winter' ? [WINTER_TAX_RATIO] : []) }; });
        let hadTx = false; let txCount = 0;
        const cap = squadCapFor(s + 1);
        const decayNow = () => { const d = txCount === 0 ? 0 : decay; txCount += 1; hadTx = true; chem = applyTransactionDecay(chem, 1, d); }; // 한 주 첫 거래는 면제
        // 선수 내보내기: 1시즌은 다음 주 정산, 2시즌부터는 오퍼 중 최고가를 바로 수락(기다림은 모델에 없음)
        const sellOut = (p) => {
          squad = squad.filter((x) => x.id !== p.id);
          const method = phase === 'summer' ? 'listedSummer' : 'listedWinter';
          if (s === 0) listed.push({ card: p, method, resolveWeek: week + 1 });
          else { const got = Math.max(...generateSaleOffers(p.price, p.baseOVR)); funds += got; salesIncome += got; }
        };
        const spare = () => {
          const { xi: x0, bench: b0 } = optimizeLineup(squad, SLOTS, 5);
          const keep = new Set([...x0.filter(Boolean), ...b0].map((p) => p.id));
          return squad.filter((p) => !keep.has(p.id) && !p.boughtThisSeason).sort((a, b) => a.baseOVR - b.baseOVR);
        };
        for (;;) {
          const baseAvg = optimalAvg(squad);
          const full = squad.length >= cap;
          if (full && !spare().length) break; // 정원이 차고 내보낼 선수도 없다
          const ranked = pool.filter((o) => funds >= o.price)
            .map((o) => ({ ...o, gain: optimalAvg([...squad, toSquad(o.card)]) - baseAvg + progressCredit(squad, o.card, targetTag) }))
            .sort((x, y) => y.gain - x.gain);
          if (!ranked.length || ranked[0].gain <= 0.02) break;
          const best = ranked[0];
          if (full) sellOut(spare()[0]); // 교체 영입은 한 건으로 센다
          funds -= best.price; spent += best.price; buys += 1;
          squad = [...squad, toSquad(best.card, true)];
          decayNow();
          pool = pool.filter((o) => o.card !== best.card);
        }
        // 선발·벤치 밖 선수 판매 등록(이번 시즌 영입은 못 판다). 성장 중인 어린 선수 2명까지는 남겨 둔다.
        const { xi, bench: bn } = optimizeLineup(squad, SLOTS, 5);
        const used = new Set([...xi.filter(Boolean), ...bn].map((p) => p.id));
        const prospects = new Set([...squad].filter((p) => !used.has(p.id) && p.age <= 20).sort((a, b) => b.baseOVR - a.baseOVR).slice(0, 2).map((p) => p.id));
        for (const p of squad.filter((x) => !used.has(x.id) && !x.boughtThisSeason && !prospects.has(x.id))) {
          sellOut(p);
          decayNow();
        }
        chem = advanceWeek(chem, hadTx);
      }
      { // 시장 마감: 정원 초과분은 낮은 OVR 순으로 자동 방출
        const capNow = squadCapFor(s + 1);
        if (squad.length > capNow) {
          const { xi: x1, bench: b1 } = optimizeLineup(squad, SLOTS, 5);
          const keep = new Set([...x1.filter(Boolean), ...b1].map((p) => p.id));
          const drop = new Set(squad.filter((p) => !keep.has(p.id)).sort((a, b) => a.baseOVR - b.baseOVR).slice(0, squad.length - capNow).map((p) => p.id));
          squad = squad.filter((p) => !drop.has(p.id));
        }
      }
      const info = powerOf(squad, chem);
      lineup = info.lineup; bench = info.bench;
      const pts = runHalfSeason(lineup, bench, manager.tier, chem, tierId, Math.random, { level: coachLevel, focus });
      if (phase === 'summer') firstHalf = pts; else secondHalf = pts;
    }
    // 마지막 정산(시즌 안에 못 받은 판매 대금은 이월 자금으로)
    for (const l of listed) { const p = computeReleaseProceeds(l.card.price, l.method); funds += p; salesIncome += p; }
    listed = [];

    const total = firstHalf + secondHalf;
    const result = judgeSeasonResult(total, tierId);
    const tierDef = getLeagueTier(tierId);
    const isTop = getNextTier(tierId) === null;
    const rank = finalLeagueRank(total, tierDef, result, Math.random, isTop ? 4 : 3);
    const endInfo = powerOf(squad, chem);
    const rec = {
      tier: tierId, points: total, result, rank, buys, spent, leftover: Math.round(funds), grant,
      avgOVR: endInfo.avgOVR, active: 0, ...tagStats(lineup), ucl: null,
      powerStart: startInfo.power, avgStart: startInfo.avgOVR, powerEnd: endInfo.power,
      mgr: manager.tier, coach: coachLevel, scout: scoutLevel, salesIncome, staffSpend,
    };
    seasons.push(rec);
    leftover = funds;

    // 이사진 목표 초과 보상 + 요구 카드(쉬움을 골라 절반쯤 달성)
    const goal = boardGoalPoints(tierDef);
    proceeds += boardReward(total, goal, base).funds + Math.round(base * BOARD_DEMAND_REWARD.easy * 0.5);

    if (isTop && rank <= 4) {
      const extras = { leagueTierId: 'tier1' };
      const coach = { level: coachLevel, focus };
      const power = computeTeamPower(lineup, bench, manager.tier, CHEMISTRY_START, coach, extras);
      const away = computeTeamPower(lineup, bench, manager.tier, CHEMISTRY_START / 2, coach, extras);
      let u = createUcl(power, Math.random, { myPowerAway: away });
      for (let i = 0; i < 40 && u.stage !== 'done'; i++) u = advanceUcl(u, Math.random);
      rec.ucl = u.result;
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
  if ((i + 1) % 10 === 0) process.stderr.write(`\r${i + 1}/${N} ${(Date.now() - t0) / 1000 | 0}s`);
}
process.stderr.write('\n');
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ strategy: 'human', N, careers }));
console.log(JSON.stringify({ strategy: 'human', N, secs: (Date.now() - t0) / 1000 }));
