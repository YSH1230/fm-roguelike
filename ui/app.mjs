import { CLUBS } from '../data/clubs.mjs';
import { saveRun, loadRun, clearRun, withRunDefaults } from '../data/local-save.mjs';
import { generateSquadPool, TIER5_SQUAD_WEIGHTS, MOVE_SQUAD_WEIGHTS_BY_TIER } from '../data/generate-player.mjs';
import { generateProceduralManager } from '../data/generate-manager.mjs';
import { assignRandomStaff } from '../data/staff.mjs';
import { GOD_PLAYERS } from '../data/god-players.mjs';
import { rollPreseasonEvent } from '../data/run-preseason-event.mjs';
import { generateShopOffer } from '../data/draft-shop.mjs';
import { getLeagueTier, getLadderIndex, getNextTier } from '../engine/league.mjs';
import { judgeRunOutcome, nextMissedTargetCount, computeReputation } from '../engine/run.mjs';
import { runHalfSeason, judgeSeasonResult, advanceWeek } from '../engine/season.mjs';
import { resolvePromotionTransferDemand } from '../engine/events.mjs';
import {
  calculateStartingFunds,
  applyCarryoverCap,
  applyCostModifiers,
  computeReleaseProceeds,
} from '../engine/economy.mjs';
import { applyTransactionDecay } from '../engine/chemistry.mjs';
import { computePlayerFinalOVR } from '../engine/ovr.mjs';
import { computeTeamPower } from '../engine/team-power.mjs';
import { FORMATIONS, DEFAULT_FORMATION, POSITION_GROUPS } from './formations.mjs';
import { renderPortrait } from './portrait.mjs';
import {
  CHEMISTRY_START,
  CHEMISTRY_DECAY_PER_TRANSACTION,
  SHOP_OFFER_SIZE,
  SHOP_REROLL_COST,
  SUMMER_MARKET_WEEKS,
  WINTER_MARKET_WEEKS,
  WINTER_TAX_RATIO,
  PROMOTION_CHEMISTRY_BONUS,
  PROMOTION_FUNDS_BONUS_RATIO,
  COACH_CHEMISTRY_DECAY_BY_LEVEL,
  SCOUT_SHOP_OFFER_SIZE_BY_LEVEL,
  SCOUT_MASTER_REROLL_DISCOUNT,
  PROMOTION_TRANSFER_DEMAND_CHANCE,
  PLAYER_TIERS,
  MISSED_TARGET_LIMIT,
} from '../engine/constants.mjs';


// 카드 데이터(정적)를 스쿼드 상태(동적 필드 포함)로 만든다. 새 스쿼드이므로
// 전원 이번 시즌 영입, 잔류 0시즌으로 취급 — 저니맨 태그가 바로 발동한다.
function toSquadPlayer(card) {
  return { ...card, seasonsAtClub: 0, acquiredThisSeason: true, inBench: false };
}

// formationId의 슬롯 순서대로 최고 OVR을 채운다. 포지션이 맞는 선수가 없으면
// 남은 최고 OVR로 대타를 세우고 offPosition으로 표시한다(화면에서 금색 점).
function pickBestXI(squad, formationId = DEFAULT_FORMATION) {
  const { slots } = FORMATIONS[formationId] ?? FORMATIONS[DEFAULT_FORMATION];
  const pool = [...squad];
  const used = new Set();
  const lineup = [];
  for (const pos of slots) {
    const byPosition = pool
      .filter((p) => !used.has(p.id) && p.position === pos)
      .sort((a, b) => b.baseOVR - a.baseOVR);
    const fallback = pool.filter((p) => !used.has(p.id)).sort((a, b) => b.baseOVR - a.baseOVR);
    const pick = byPosition[0] ?? fallback[0];
    if (pick) {
      used.add(pick.id);
      lineup.push({ ...pick, slotPosition: pos, offPosition: pick.position !== pos });
    } else {
      lineup.push(null); // 스쿼드가 11명 미만 — 빈 슬롯
    }
  }
  const bench = pool
    .filter((p) => !used.has(p.id))
    .sort((a, b) => b.baseOVR - a.baseOVR)
    .slice(0, 5)
    .map((p) => ({ ...p, inBench: true }));
  return { lineup: lineup.filter(Boolean), slotted: lineup, bench };
}

function currentFormation() {
  return FORMATIONS[currentState.formation] ? currentState.formation : DEFAULT_FORMATION;
}

function tierOf(ovr) {
  if (ovr >= 95) return 'god';
  for (const [id, t] of Object.entries(PLAYER_TIERS)) {
    if (ovr >= t.minOVR && ovr <= t.maxOVR) return id;
  }
  return ovr > 94 ? 'god' : 'local';
}

const TIER_LABELS = {
  local: '로컬', bigLeaguer: '빅리거', topClass: '톱클래스',
  worldClass: '월드클래스', legendary: '레전더리', god: 'GOD',
};
const TAG_LABELS = {
  gegenpressing: '게겐프레싱', falseNine: '폴스나인', longBallKickAndRush: '롱볼',
  tikiTaka: '티키타카', totalFootball: '토탈풋볼', falseFullBack: '변형 3백',
  buildUpFromBack: '후방 빌드업', counterAttack: '역습',
};
const TRAIT_LABELS = {
  seongGolYouth: '성골 유스', veteranLeader: '베테랑 리더', superSub: '슈퍼 서브',
  hometownHero: '지역 영웅', polyglot: '폴리글롯', journeyman: '저니맨',
};

function esc(text) {
  return String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// 한국어 조사 '로/으로'. 받침이 없거나 받침이 ㄹ이면 '로', 그 외에는 '으로'.
function ro(word) {
  const last = word.charCodeAt(word.length - 1) - 0xac00;
  if (last < 0 || last > 11171) return '로'; // 한글이 아니면 기본값
  const jong = last % 28;
  return jong === 0 || jong === 8 ? '로' : '으로';
}

const screenEl = () => document.getElementById('screen');
const dockEl = () => document.getElementById('dock');

function setScreen(html, dock = '') {
  screenEl().innerHTML = html;
  dockEl().innerHTML = dock;
}

function renderClubButtons() {
  const saved = loadRun(localStorage);
  const resume = saved
    ? `<button class="club club--resume" id="resume-btn" style="--kit:${saved.club.kit ?? '#dda63a'}">
         <div class="club__body">
           <div class="club__name">이어하기</div>
           <div class="club__line"><span class="club__tag">구단</span><span>${esc(saved.club.name)}</span></div>
           <div class="club__line"><span class="club__tag">진행</span><span>${saved.phase === 'summer' ? '여름' : '겨울'} ${saved.week}주차</span></div>
         </div>
       </button>`
    : '';

  setScreen(`
    <div class="start">
      <h1 class="start__title">FM<br>ROGUELIKE</h1>
      <p class="start__sub">5부 리그 감독으로 시작합니다. 12주 동안 선수를 사고 팔아 한 시즌을 버티세요.</p>
      <div class="clubs">
        ${resume}
        ${CLUBS.map((club) => `
          <button class="club" data-club="${club.id}" style="--kit:${club.kit}">
            <div class="club__body">
              <div class="club__name">${esc(club.name)}</div>
              <div class="club__line"><span class="club__tag club__tag--up">강점</span><span>${esc(club.strength)}</span></div>
              <div class="club__line"><span class="club__tag club__tag--down">약점</span><span>${esc(club.weakness)}</span></div>
            </div>
          </button>`).join('')}
      </div>
    </div>
  `);

  document.getElementById('resume-btn')?.addEventListener('click', () => {
    currentState = withRunDefaults(saved, DEFAULT_FORMATION); // 구버전 세이브 호환
    renderMarket();
  });
  for (const club of CLUBS) {
    document.querySelector(`[data-club="${club.id}"]`).onclick = () => startRun(club);
  }
}

let currentState = null;

function startRun(club) {
  const baseFunds = Math.round(calculateStartingFunds(0) * club.startingFundsMultiplier);
  const rawSquad = generateSquadPool(TIER5_SQUAD_WEIGHTS).map(toSquadPlayer);
  const manager = generateProceduralManager('tactician');
  const staff = assignRandomStaff();

  // 초기 정비기(Week 1~3) 이벤트: 자금·스쿼드가 바뀔 수 있다.
  // 위기 관리형 감독은 위기 이벤트(FFP 긴급 감사)를 무효화한다.
  const rolled = rollPreseasonEvent(rawSquad, baseFunds);
  const eventIsCrisis = rolled.id === 'ffpAudit';
  const crisisBlocked = manager.trait === 'crisisManager' && eventIsCrisis;
  const funds = crisisBlocked ? baseFunds : rolled.funds;
  const squad = crisisBlocked ? rawSquad : rolled.squad;
  const eventMessage = crisisBlocked ? '위기 관리형: FFP 긴급 감사를 무효화했습니다' : rolled.message;

  // 헤어드라이어: 영입 즉시 적응도 +20
  const chemistry = manager.trait === 'hairdryer' ? Math.min(100, CHEMISTRY_START + 20) : CHEMISTRY_START;

  currentState = {
    club,
    squad,
    manager,
    staff,
    availableGodPlayers: [...GOD_PLAYERS], // 이번 런에서 아직 영입 안 한 GOD 카드
    chemistry,
    funds,
    eventMessage,
    leagueTierId: 'tier5',
    highestTierId: 'tier5', // 이번 런에서 도달한 최고 리그 (명성 점수용)
    titles: 0, // 우승 횟수
    missedTargetCount: 0, // 기대 목표 미달 누적 (스펙 2절: 3회면 해임)
    seasonNumber: 1,
    formation: DEFAULT_FORMATION,
    tab: 'draft',
    week: SUMMER_MARKET_WEEKS[0],
    phase: 'summer',
    transactedThisWeek: false,
    shopOffer: [],
    firstHalfPoints: null,
    listedForSale: [], // { card, method, resolveWeek }
    boardTrustUsed: false,
    promotionFundsBonusPending: false,
  };
  currentState.shopOffer = generateShopOffer(scoutOfferSize(), currentState.availableGodPlayers);
  renderMarket();
}

// 수석 스카우터 등급에 따른 매주 매물 수 (스펙 5.3절: 3→4→4→5)
function scoutOfferSize() {
  return SCOUT_SHOP_OFFER_SIZE_BY_LEVEL[currentState.staff.headScout.level] ?? SHOP_OFFER_SIZE;
}

// 마스터 스카우터는 리롤 비용 절반
function rerollCost() {
  return currentState.staff.headScout.level === 'master'
    ? Math.round(SHOP_REROLL_COST * (1 - SCOUT_MASTER_REROLL_DISCOUNT))
    : SHOP_REROLL_COST;
}

// 스펙 2절: 시즌마다 자금을 지급하고, 남은 돈은 그 위에 이월한다(상한 30%).
// 지급 시점을 여기로 모은 이유: 다음 시즌 리그와 구단은 거취 선택이 끝나야
// 확정되고, 잔류/이적/승격 위기 세 경로가 전부 startNewSeason으로 합류한다.
// 예전에는 후반기 결산에서 현재 리그 기준으로 이월 상한만 걸었다 - 지급이
// 아예 없어서 2시즌부터 무일푼이었고, 승격 시 상한이 한 단계 낮게 잡혔다.
function grantSeasonFunds() {
  const base = calculateStartingFunds(getLadderIndex(currentState.leagueTierId))
    * currentState.club.startingFundsMultiplier;
  const grant = Math.round(currentState.promotionFundsBonusPending
    ? base * (1 + PROMOTION_FUNDS_BONUS_RATIO)
    : base);
  currentState.promotionFundsBonusPending = false;
  currentState.funds = grant + Math.round(applyCarryoverCap(currentState.funds, grant));
}

// 승격/잔류 후 같은 구단으로 새 시즌 시작 — 스펙 4절: 선수단 유지, 시장 상태만 초기화
function startNewSeason() {
  grantSeasonFunds();
  currentState.seasonNumber += 1;
  currentState.week = SUMMER_MARKET_WEEKS[0];
  currentState.phase = 'summer';
  currentState.transactedThisWeek = false;
  currentState.firstHalfPoints = null;
  currentState.listedForSale = [];
  currentState.eventMessage = ''; // 지난 시즌 이벤트 문구가 다시 뜨지 않도록 비움
  currentState.squad = currentState.squad.map((p) => ({
    ...p,
    acquiredThisSeason: false,
    seasonsAtClub: (p.seasonsAtClub ?? 0) + 1,
  }));
  currentState.shopOffer = generateShopOffer(scoutOfferSize(), currentState.availableGodPlayers);

  let banner = `${currentState.club.name}, ${getLeagueTier(currentState.leagueTierId).label} 새 시즌 시작`;
  // 장기 집권형: 같은 구단 잔류 시즌마다 적응도 시작값 +3
  if (currentState.manager.trait === 'longTermReign') {
    currentState.chemistry = Math.min(100, currentState.chemistry + 3);
    banner += ' (장기 집권형: 적응도 +3)';
  }
  renderMarket(banner);
}

function cardPrice(card) {
  const modifiers = [];
  if (currentState.phase === 'winter') modifiers.push(WINTER_TAX_RATIO);
  // 화술의 달인: 감독과 같은 대륙/전술 태그의 카드는 영입비 -30%
  const { manager } = currentState;
  if (
    manager.trait === 'silverTongue' &&
    (card.continentTag === manager.continentTag || card.playstyleTags.includes(manager.tacticalTag))
  ) {
    modifiers.push(-0.3);
  }
  return applyCostModifiers(card.price, modifiers);
}

// 리빌딩 장인(감독)과 수석 코치(스태프) 둘 다 거래 1건당 적응도 하락을 완화한다.
// 스펙 5.3절: 중복 적용하지 않고 더 강한 쪽(하락폭이 작은 쪽)만 쓴다.
function transactionDecayAmount() {
  const managerReduced =
    currentState.manager.trait === 'reboundArchitect'
      ? CHEMISTRY_DECAY_PER_TRANSACTION / 2
      : CHEMISTRY_DECAY_PER_TRANSACTION;
  const coachLevel = currentState.staff.headCoach.level;
  const coachReduced = COACH_CHEMISTRY_DECAY_BY_LEVEL[coachLevel] ?? CHEMISTRY_DECAY_PER_TRANSACTION;
  return Math.min(managerReduced, coachReduced);
}

function buyCard(card, rowEl = null) {
  const price = cardPrice(card);
  if (currentState.funds < price) return;
  // 카드가 상점에서 빠져나가는 걸 보여준 뒤 다시 그린다.
  if (rowEl && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    rowEl.classList.add('is-leaving');
    setTimeout(() => buyCard(card), 160);
    rowEl.style.pointerEvents = 'none';
    return;
  }
  currentState.funds -= price;
  currentState.squad = [...currentState.squad, toSquadPlayer(card)];
  currentState.chemistry = applyTransactionDecay(currentState.chemistry, 1, transactionDecayAmount());
  currentState.transactedThisWeek = true;
  currentState.shopOffer = currentState.shopOffer.filter((c) => c.id !== card.id);
  // GOD 카드는 전 세계 2명뿐 — 영입하면 이번 런에서 다시 등장하지 않게 뺀다
  if (card.id.startsWith('god-')) {
    currentState.availableGodPlayers = currentState.availableGodPlayers.filter((g) => g.id !== card.id);
  }
  renderMarket();
}

function rerollShop() {
  const cost = rerollCost();
  if (currentState.funds < cost) return;
  currentState.funds -= cost;
  currentState.shopOffer = generateShopOffer(scoutOfferSize(), currentState.availableGodPlayers);
  renderMarket();
}

// 방출 3단계 (스펙 7절): 즉시(0%) / 이적 명단(1주 소모, 여름·겨울 범위 회수율) / Week12 데드라인(40%, 소모 없음)
function releaseImmediate(card) {
  currentState.squad = currentState.squad.filter((p) => p.id !== card.id);
  currentState.chemistry = applyTransactionDecay(currentState.chemistry, 1, transactionDecayAmount());
  currentState.transactedThisWeek = true;
  renderMarket();
}

function listForSale(card) {
  const method = currentState.phase === 'summer' ? 'listedSummer' : 'listedWinter';
  // 겨울 이적명단은 당해 영입 선수를 받지 않는다 (스펙 7절)
  if (method === 'listedWinter' && card.acquiredThisSeason) return;
  currentState.squad = currentState.squad.filter((p) => p.id !== card.id);
  currentState.listedForSale.push({ card, method, resolveWeek: currentState.week + 1 });
  currentState.chemistry = applyTransactionDecay(currentState.chemistry, 1, transactionDecayAmount());
  currentState.transactedThisWeek = true;
  renderMarket();
}

function releaseDeadline(card) {
  currentState.squad = currentState.squad.filter((p) => p.id !== card.id);
  currentState.funds += computeReleaseProceeds(card.price, 'deadline');
  renderMarket();
}

function resolveListedSales() {
  const due = currentState.listedForSale.filter((l) => l.resolveWeek === currentState.week);
  currentState.listedForSale = currentState.listedForSale.filter((l) => l.resolveWeek !== currentState.week);
  const messages = due.map((l) => {
    const proceeds = computeReleaseProceeds(l.card.price, l.method);
    currentState.funds += proceeds;
    return `${l.card.name} 방출 완료: ${proceeds}G 회수`;
  });
  return messages.join(' / ');
}

function nextWeek() {
  currentState.chemistry = advanceWeek(currentState.chemistry, currentState.transactedThisWeek);
  currentState.transactedThisWeek = false;
  currentState.week += 1;
  const saleMessage = resolveListedSales();

  if (currentState.phase === 'summer' && currentState.week > SUMMER_MARKET_WEEKS[1]) {
    runFirstHalf(saleMessage);
    return;
  }
  if (currentState.phase === 'winter' && currentState.week > WINTER_MARKET_WEEKS[1]) {
    runSecondHalfAndFinish(saleMessage);
    return;
  }
  currentState.shopOffer = generateShopOffer(scoutOfferSize(), currentState.availableGodPlayers);
  renderMarket(saleMessage);
}

function boostedTagIdFor(manager) {
  return manager.trait === 'tacticalPurist' ? manager.tacticalTag : null;
}

function runFirstHalf(saleMessage = '') {
  const { manager } = currentState;
  const { lineup, bench } = pickBestXI(currentState.squad, currentFormation());
  currentState.firstHalfPoints = runHalfSeason(
    lineup,
    bench,
    manager.tier,
    currentState.chemistry,
    currentState.leagueTierId,
    Math.random,
    boostedTagIdFor(manager)
  );
  currentState.phase = 'winter';
  currentState.week = WINTER_MARKET_WEEKS[0];
  currentState.shopOffer = generateShopOffer(scoutOfferSize(), currentState.availableGodPlayers);

  let banner = saleMessage ? `${saleMessage} ` : '';
  banner += `전반기 결산: ${currentState.firstHalfPoints.toFixed(1)}점. 겨울 이적시장이 시작됩니다(윈터 택스 +${WINTER_TAX_RATIO * 100}%).`;

  // 소방수: 안전선은 넘었지만 목표선(승격)에는 못 미치는 페이스면 겨울 진입 시 적응도 +30
  const tier = getLeagueTier(currentState.leagueTierId);
  const halfSafe = tier.safePoints / 2;
  const halfTarget = tier.targetPoints / 2;
  if (
    manager.trait === 'firefighter' &&
    currentState.firstHalfPoints >= halfSafe &&
    currentState.firstHalfPoints < halfTarget
  ) {
    currentState.chemistry = Math.min(100, currentState.chemistry + 30);
    banner += ' 소방수 발동: 적응도 +30.';
  }

  renderMarket(banner);
}

const RESULT_LABELS = { champion: '우승권!', promotion: '승격권', safe: '안전 잔류', relegation: '강등 위기' };

function runSecondHalfAndFinish(saleMessage = '') {
  const { manager } = currentState;
  const { lineup, slotted, bench } = pickBestXI(currentState.squad, currentFormation());
  const secondHalf = runHalfSeason(
    lineup,
    bench,
    manager.tier,
    currentState.chemistry,
    currentState.leagueTierId,
    Math.random,
    boostedTagIdFor(manager)
  );
  const totalPoints = currentState.firstHalfPoints + secondHalf;
  let result = judgeSeasonResult(totalPoints, currentState.leagueTierId);
  const tier = getLeagueTier(currentState.leagueTierId);

  // 보드진의 신임: 해임 조건 1회 면제(사용 후 소멸)
  let boardTrustMessage = '';
  if (result === 'relegation' && manager.trait === 'boardTrust' && !currentState.boardTrustUsed) {
    currentState.boardTrustUsed = true;
    result = 'safe';
    boardTrustMessage = '<div class="banner banner--alert">보드진의 신임 발동. 해임을 면했습니다. 이 효과는 소멸합니다.</div>';
  }

  // 보드진의 신임이 result를 safe로 바꾼 뒤에 런 판정을 태워야 한다.
  if (result === 'champion') currentState.titles += 1;
  currentState.missedTargetCount = nextMissedTargetCount(result, currentState.missedTargetCount);

  const outcome = judgeRunOutcome({
    seasonResult: result,
    leagueTierId: currentState.leagueTierId,
    missedTargetCount: currentState.missedTargetCount,
  });
  const canPromote = outcome.canPromote;

  if (outcome.ended) {
    // 같은 클릭에서 보드진의 신임이 발동하고도 목표 미달로 경질될 수 있다.
    // 그 경우에도 성향이 발동했다는 사실은 알려야 한다.
    renderRunEnd(outcome.reason, totalPoints, boardTrustMessage);
    return;
  }

  let dockHtml;
  let closingHtml = '';
  if (canPromote) {
    closingHtml = `<p class="note">승격 보상: 적응도 +${PROMOTION_CHEMISTRY_BONUS}, 자금 +${PROMOTION_FUNDS_BONUS_RATIO * 100}%</p>`;
    dockHtml = `<button class="cta" id="promote-btn">${getLeagueTier(getNextTier(currentState.leagueTierId)).label}로 승격</button>`;
  } else {
    const left = MISSED_TARGET_LIMIT - currentState.missedTargetCount;
    closingHtml = left <= 2
      ? `<p class="note"><b>목표 미달 ${currentState.missedTargetCount}회.</b> ${left}회 더 미달하면 해임됩니다.</p>`
      : '';
    // 1부는 더 올라갈 데가 없어서 목표를 달성해도 승격 버튼이 안 나온다.
    // 아무 설명이 없으면 왜 제자리인지 알 수 없다.
    if (getNextTier(currentState.leagueTierId) === null) {
      closingHtml += '<p class="note">1부가 마지막 리그입니다. 우승해야 커리어가 완결되고, 목표 달성은 자리를 지켜줄 뿐입니다.</p>';
    }
    dockHtml = '<button class="cta" id="continue-btn">같은 리그에서 새 시즌</button>';
  }

  // 승점 게이지: 안전/승격/우승선이 어디였는지 한 눈에
  const scale = Math.max(tier.championPoints * 1.1, totalPoints);
  const at = (v) => `${Math.min(100, (v / scale) * 100)}%`;

  setScreen(`
    <div class="verdict verdict--${result}">
      <div class="verdict__label">${esc(currentState.club.name)} · ${getLeagueTier(currentState.leagueTierId).label} 시즌 결산</div>
      <div class="verdict__result">${RESULT_LABELS[result]}</div>
      <div class="scoreline"><b>${totalPoints.toFixed(0)}</b><span>승점</span></div>
      <div class="halves">
        <span>전반기 <b>${currentState.firstHalfPoints.toFixed(1)}</b></span>
        <span>후반기 <b>${secondHalf.toFixed(1)}</b></span>
      </div>
      <div class="pointbar">
        <div class="pointbar__fill" style="width:${at(totalPoints)}"></div>
        <div class="pointbar__mark" style="left:${at(tier.safePoints)}"></div>
        <div class="pointbar__mark" style="left:${at(tier.targetPoints)}"></div>
        <div class="pointbar__mark" style="left:${at(tier.championPoints)}"></div>
      </div>
      <div class="pointbar__legend">
        <span style="left:${at(tier.safePoints)}">잔류 ${tier.safePoints}</span>
        <span style="left:${at(tier.targetPoints)}">승격 ${tier.targetPoints}</span>
        <span style="left:${at(tier.championPoints)}">우승 ${tier.championPoints}</span>
      </div>
    </div>
    ${boardTrustMessage}
    ${saleMessage ? `<div class="banner">${esc(saleMessage)}</div>` : ''}
    <div class="panel">
      <ul class="summary">
        <li><span>최종 팀 전력</span><b>${computeTeamPower(lineup, bench, manager.tier, currentState.chemistry).toFixed(1)}</b></li>
        <li><span>최종 적응도</span><b>${currentState.chemistry.toFixed(1)}</b></li>
        <li><span>남은 자금 (다음 시즌에 상한 30%까지 이월)</span><b>${currentState.funds.toFixed(0)}G</b></li>
      </ul>
      ${closingHtml}
    </div>
    <div class="panel">
      <div class="panel__head"><h2>최종 라인업</h2><span class="panel__count">${currentFormation()}</span></div>
      ${renderPitch(slotted, currentFormation(), currentState.club.kit)}
    </div>
  `, dockHtml);

  document.getElementById('promote-btn')?.addEventListener('click', () => {
    const nextTier = getNextTier(currentState.leagueTierId);
    currentState.chemistry = Math.min(100, currentState.chemistry + PROMOTION_CHEMISTRY_BONUS);
    currentState.promotionFundsBonusPending = true; // 지급 시점(startNewSeason)에 반영

    // 승격 전용 위기(FFP 긴급 감사 무효화와는 별개)는 거취를 정한 뒤에 띄운다(잔류를 골랐을 때만 의미가 있다).
    renderDestinationChoice(result, nextTier);
  });
  document.getElementById('continue-btn')?.addEventListener('click', startNewSeason);
}

// 스펙 2절 거취 선택. 우승이면 오퍼 3개, 목표 달성이면 2개.
// 현재 구단은 후보에서 뺀다(이적인데 같은 곳이면 의미가 없다).
function buildClubOffers(seasonResult) {
  const count = seasonResult === 'champion' ? 3 : 2;
  const pool = CLUBS.filter((c) => c.id !== currentState.club.id);
  const picked = [];
  while (picked.length < count && picked.length < pool.length) {
    const c = pool[Math.floor(Math.random() * pool.length)];
    if (!picked.includes(c)) picked.push(c);
  }
  return picked;
}

function renderDestinationChoice(seasonResult, nextTierId) {
  const offers = buildClubOffers(seasonResult);
  // 이 화면은 promote-btn에서 getNextTier로만 들어오므로 nextTierId는 항상 승격 리그다.
  const stayLabel = `${getLeagueTier(nextTierId).label}로 승격한다`;

  setScreen(`
    <div class="choice">
      <div class="choice__kicker">시즌 종료 거취</div>
      <h1 class="choice__title">어디서 다음 시즌을<br>시작할까요</h1>
      <p class="choice__body">
        지금 구단에 남으면 <b>선수단을 그대로</b> 들고 갑니다.
        다른 구단으로 옮기면 <b>선수단이 전부 초기화</b>되고, 새 선수단은 그 리그 체급으로
        다시 생성됩니다. 지금까지 키운 전력보다 약할 수 있습니다.
      </p>
      <div class="options">
        <button class="option option--accept" data-stay="1">
          <div class="option__name">${esc(currentState.club.name)}에 남는다</div>
          <div class="option__effect">${stayLabel}. 선수단 <b>유지</b></div>
        </button>
        ${offers.map((c) => `
          <button class="option" data-move="${c.id}">
            <div class="option__name">${esc(c.name)}${ro(c.name)} 이적</div>
            <div class="option__effect">${esc(c.strength)}. 선수단 <b>초기화</b>(${getLeagueTier(nextTierId).label} 체급으로 재생성), 시작 자금 x${c.startingFundsMultiplier}</div>
          </button>`).join('')}
      </div>
    </div>
  `);

  document.querySelector('[data-stay]').onclick = () => {
    currentState.leagueTierId = nextTierId;
    if (getLadderIndex(nextTierId) > getLadderIndex(currentState.highestTierId)) {
      currentState.highestTierId = nextTierId;
    }
    const keyPlayer = [...currentState.squad].sort((a, b) => b.baseOVR - a.baseOVR)[0];
    if (keyPlayer && Math.random() < PROMOTION_TRANSFER_DEMAND_CHANCE) {
      renderPromotionTransferDemand(keyPlayer);
    } else {
      startNewSeason();
    }
  };
  for (const c of offers) {
    document.querySelector(`[data-move="${c.id}"]`).onclick = () => {
      currentState.club = c;
      currentState.leagueTierId = nextTierId;
      if (getLadderIndex(nextTierId) > getLadderIndex(currentState.highestTierId)) {
        currentState.highestTierId = nextTierId;
      }
      // 선수단 초기화. 목적지 리그 체급으로 생성한다(5부 분포로 고정하면 3부
      // 이상에서 강등이 거의 확정이었다). 적응도도 새 팀이므로 기본값으로 돌린다.
      currentState.squad = generateSquadPool(MOVE_SQUAD_WEIGHTS_BY_TIER[nextTierId]).map(toSquadPlayer);
      // 스쿼드에서 사라진 GOD 카드는 다시 상점에 나올 수 있게 되돌린다.
      // 안 그러면 이미 영입한 GOD이 선수단에서도 사라지고 이번 런에서 영영 못 본다.
      currentState.availableGodPlayers = GOD_PLAYERS.filter(
        (g) => !currentState.squad.some((p) => p.id === g.id)
      );
      currentState.chemistry = CHEMISTRY_START;
      startNewSeason(); // 자금은 새 구단 배율로 여기서 한 번만 지급된다
    };
  }
}

const RUN_END = {
  victory: {
    kicker: '커리어 종료',
    title: '1부 우승',
    body: '5부에서 시작해 1부 정상까지 올라갔습니다. 이 런은 여기서 완결됩니다.',
  },
  relegation: {
    kicker: '커리어 종료',
    title: '해임',
    body: '안전 승점을 넘지 못했습니다. 보드진이 경질을 통보했습니다.',
  },
  missedTargets: {
    kicker: '커리어 종료',
    title: '경질',
    body: `기대 목표를 ${MISSED_TARGET_LIMIT}시즌 연속으로 넘지 못했습니다. 잔류만으로는 자리를 지킬 수 없습니다.`,
  },
};

function renderRunEnd(reason, finalPoints, boardTrustMessage = '') {
  const copy = RUN_END[reason];
  const reputation = computeReputation({
    highestTierId: currentState.highestTierId,
    titles: currentState.titles,
  });
  const highest = getLeagueTier(currentState.highestTierId);

  setScreen(`
    <div class="verdict verdict--${reason === 'victory' ? 'champion' : 'relegation'}">
      <div class="verdict__label">${copy.kicker}</div>
      <div class="verdict__result">${copy.title}</div>
      <div class="scoreline"><b>${reputation}</b><span>명성</span></div>
    </div>
    ${boardTrustMessage}
    <div class="panel">
      <p class="note">${copy.body}</p>
      <ul class="summary">
        <li><span>버틴 시즌</span><b>${currentState.seasonNumber}</b></li>
        <li><span>도달 리그</span><b>${highest.label}</b></li>
        <li><span>우승</span><b>${currentState.titles}</b></li>
        <li><span>마지막 시즌 승점</span><b>${finalPoints.toFixed(0)}</b></li>
      </ul>
    </div>
  `, '<button class="cta" id="new-run-btn">새 런 시작</button>');

  clearRun(localStorage); // 끝난 런은 이어하기 목록에서 지운다
  document.getElementById('new-run-btn').onclick = () => {
    currentState = null;
    renderClubButtons();
  };
}

function renderPromotionTransferDemand(keyPlayer) {
  const { acceptProceeds, rejectOvrPenalty } = resolvePromotionTransferDemand(keyPlayer.price);
  setScreen(`
    <div class="choice">
      <div class="choice__kicker">승격 직후 위기</div>
      <h1 class="choice__title">빅클럽이 핵심 선수를<br>데려가려 합니다</h1>
      <div class="choice__card" style="--tier:var(--t-${tierOf(keyPlayer.baseOVR)})">
        ${renderPortrait(keyPlayer, { size: 52, kit: currentState.club.kit })}
        <div>
          <div class="offer__name">${esc(keyPlayer.name)}</div>
          <div class="player__meta">${keyPlayer.position} · ${keyPlayer.age}세 · OVR <b>${keyPlayer.baseOVR}</b></div>
        </div>
      </div>
      <p class="choice__body">보내면 자금이 생기고, 붙잡으면 이 선수가 시즌 내내 흔들립니다.</p>
      <div class="options">
        <button class="option option--accept" id="accept-transfer-btn">
          <div class="option__name">보낸다</div>
          <div class="option__effect">이적료 <b>+${acceptProceeds}G</b>를 받고 선수단에서 제외</div>
        </button>
        <button class="option option--reject" id="reject-transfer-btn">
          <div class="option__name">붙잡는다</div>
          <div class="option__effect">선수단 유지, ${esc(keyPlayer.name)}의 OVR <b>-${rejectOvrPenalty}</b></div>
        </button>
      </div>
    </div>
  `);
  document.getElementById('accept-transfer-btn').onclick = () => {
    currentState.squad = currentState.squad.filter((p) => p.id !== keyPlayer.id);
    currentState.funds += acceptProceeds;
    startNewSeason();
  };
  document.getElementById('reject-transfer-btn').onclick = () => {
    currentState.squad = currentState.squad.map((p) =>
      p.id === keyPlayer.id ? { ...p, baseOVR: p.baseOVR - rejectOvrPenalty } : p
    );
    startNewSeason();
  };
}

// 피치 위 11칸. slotted는 pickBestXI가 준 슬롯 순서 배열(빈 슬롯은 null).
function renderPitch(slotted, formationId, kit) {
  const { slots, coords } = FORMATIONS[formationId];
  const chips = slots.map((pos, i) => {
    const p = slotted[i];
    const [x, y] = coords[i];
    const style = `left:${x}%;top:${y}%`;
    if (!p) {
      return `<div class="slot slot--empty" style="${style}">
        <div class="slot__card"><span class="slot__ovr n">--</span><span class="slot__pos">${pos}</span></div>
      </div>`;
    }
    // 이름은 싣지 않는다. 48px 칸에서 5글자로 잘려 읽히지도 않았고, 칸 밖으로
    // 흘러나온 이름표가 옆 칸과 겹쳤다. 누가 어디 있는지는 선수단 탭이 답한다.
    return `<div class="slot${p.offPosition ? ' slot--offpos' : ''}" style="${style};--tier:var(--t-${tierOf(p.baseOVR)})"
      title="${esc(p.name)} · ${p.position} · OVR ${p.baseOVR}">
      <div class="slot__card">
        <span class="slot__ovr n">${p.baseOVR}</span>
        ${renderPortrait(p, { size: 34, kit })}
        <span class="slot__pos">${pos}</span>
      </div>
    </div>`;
  }).join('');

  const off = slotted.filter((p) => p && p.offPosition).length;
  const note = off
    ? `<p class="note"><b>금색 점선</b> ${off}명은 주 포지션이 아닌 자리에 섰습니다.</p>`
    : '';
  return `<div class="pitch">${chips}</div>${note}`;
}

const TABS = [
  { id: 'draft', label: '영입' },
  { id: 'tactics', label: '전술' },
  { id: 'squad', label: '선수단' },
];

function renderMarket(banner = '') {
  const { club, manager, staff, squad, funds, chemistry, eventMessage, shopOffer, phase, week, listedForSale } = currentState;
  const maxWeek = phase === 'summer' ? SUMMER_MARKET_WEEKS[1] : WINTER_MARKET_WEEKS[1];
  const phaseLabel = phase === 'summer' ? '여름 이적시장' : '겨울 이적시장';
  const isDeadlineWeek = phase === 'winter' && week === WINTER_MARKET_WEEKS[1];
  const formationId = currentFormation();
  const tab = TABS.some((t) => t.id === currentState.tab) ? currentState.tab : 'draft';
  const { lineup, slotted, bench } = pickBestXI(squad, formationId);
  const inXI = new Set(lineup.map((p) => p.id));

  // 스트립은 시너지가 반영된 최종 OVR로 계산한다. 포메이션을 바꿨을 때
  // 숫자가 왜 움직이는지(태그 발동/해제) 읽히게 하려면 baseOVR로는 안 된다.
  const finalOVR = new Map(lineup.map((p) => [p.id, computePlayerFinalOVR(p, lineup, bench)]));
  const groupAvg = (positions) => {
    const members = lineup.filter((p) => positions.includes(p.slotPosition));
    if (!members.length) return null;
    return members.reduce((sum, p) => sum + finalOVR.get(p.id), 0) / members.length;
  };
  const teamPower = computeTeamPower(lineup, bench, manager.tier, chemistry);
  const baseAvg = lineup.reduce((t, p) => t + p.baseOVR, 0) / lineup.length;

  const weekStart = phase === 'summer' ? SUMMER_MARKET_WEEKS[0] : WINTER_MARKET_WEEKS[0];
  const dots = Array.from({ length: maxWeek - weekStart + 1 }, (_, i) => {
    const w = weekStart + i;
    return `<i class="${w < week ? 'is-done' : w === week ? 'is-now' : ''} ${phase === 'winter' ? 'is-winter' : ''}"></i>`;
  }).join('');

  const decay = transactionDecayAmount();
  const decayLabel = decay > 0 ? `적응도 -${decay}` : '적응도 유지';

  const offerHtml = shopOffer.map((c) => {
    const price = cardPrice(c);
    const affordable = funds >= price;
    const tier = tierOf(c.baseOVR);
    // 이 카드를 사면 베스트11 평균이 얼마나 오르는지. 살지 말지의 실제 근거
    const after = pickBestXI([...squad, toSquadPlayer(c)], formationId);
    const gain = after.lineup.reduce((t, p) => t + p.baseOVR, 0) / after.lineup.length - baseAvg;
    const tags = [
      ...c.playstyleTags.map((t) => `<span class="tag">${TAG_LABELS[t] ?? t}</span>`),
      c.specialTrait ? `<span class="tag tag--trait">${TRAIT_LABELS[c.specialTrait] ?? c.specialTrait}</span>` : '',
    ].join('');
    return `<li class="offer" data-row="${c.id}" style="--tier:var(--t-${tier})">
      <div class="offer__aside">
        ${renderPortrait(c, { size: 48 })}
      </div>
      <div class="offer__main">
        <div class="offer__top">
          <span class="offer__name">${esc(c.name)}</span>
          <span class="offer__pos">${c.position}</span>
          <span class="offer__tier">${TIER_LABELS[tier]}</span>
          <span class="offer__age">${c.age}세</span>
        </div>
        <div class="offer__figures">
          <span class="offer__ovr n">${c.baseOVR}</span>
          <span class="offer__delta ${gain >= 0.05 ? 'is-up' : 'is-flat'}">${gain >= 0.05 ? `팀 +${gain.toFixed(1)}` : '전력 변화 없음'}</span>
          <span class="offer__price n${affordable ? '' : ' is-over'}">${price}<i>G</i></span>
        </div>
        <div class="tags">${tags}</div>
        <button class="buy" data-buy="${c.id}" ${affordable ? '' : 'disabled'}>
          <span>${affordable ? '영입' : '자금 부족'}</span>
          <span class="buy__cost">${price}G · ${decayLabel}</span>
        </button>
      </div>
    </li>`;
  }).join('');

  const squadHtml = [...squad]
    .sort((a, b) => b.baseOVR - a.baseOVR)
    .map((p) => {
      const winterBlocked = phase === 'winter' && p.acquiredThisSeason;
      return `<li class="player${inXI.has(p.id) ? ' is-xi' : ''}" style="--tier:var(--t-${tierOf(p.baseOVR)})">
        ${renderPortrait(p, { size: 36, kit: club.kit })}
        <b class="player__ovr n">${p.baseOVR}</b>
        <div>
          <div class="player__name">${esc(p.name)}</div>
          <div class="player__meta">${p.position} · ${p.age}세 · <b>${p.price}G</b>${inXI.has(p.id) ? ' · 주전' : ''}</div>
        </div>
        <div class="player__actions">
          <button class="release" data-release-immediate="${p.id}" title="회수 0%, ${decayLabel}">즉시</button>
          <button class="release" data-release-listed="${p.id}" ${winterBlocked ? 'disabled title="당해 영입 선수는 겨울 이적명단에 올릴 수 없습니다"' : 'title="1주 뒤 정산"'}>명단</button>
          ${isDeadlineWeek ? `<button class="release release--deadline" data-release-deadline="${p.id}" title="원가의 40% 회수">데드라인</button>` : ''}
        </div>
      </li>`;
    })
    .join('');

  const listedHtml = listedForSale
    .map((l) => `<li><span>${esc(l.card.name)}</span><span><b>${l.resolveWeek}</b>주차 정산</span></li>`)
    .join('');

  const bodies = {
    draft: `
      <section class="panel tabpanel">
        <div class="panel__head">
          <h2>이번 주 매물</h2>
          <button class="reroll" id="reroll-btn" ${funds >= rerollCost() ? '' : 'disabled'}>다시 뽑기 <b>${rerollCost()}G</b></button>
        </div>
        <ul class="offers">${offerHtml || '<li class="empty">이번 주는 매물이 없습니다. 다시 뽑거나 다음 주로 넘어가세요.</li>'}</ul>
      </section>`,
    tactics: `
      <section class="panel tabpanel">
        <div class="panel__head">
          <h2>포메이션</h2>
          <div class="formations">
            ${Object.keys(FORMATIONS).map((id) => `<button data-formation="${id}" aria-pressed="${id === formationId}">${id}</button>`).join('')}
          </div>
        </div>
        ${renderPitch(slotted, formationId, club.kit)}
        <p class="note">포메이션을 바꾸면 슬롯 구성이 바뀌어 플레이스타일 시너지 발동 조건이 달라집니다.</p>
      </section>`,
    squad: `
      <section class="panel tabpanel">
        ${listedHtml ? `<div class="panel__head"><h2>이적 명단</h2></div><ul class="listed">${listedHtml}</ul><div style="height:var(--s4)"></div>` : ''}
        <div class="panel__head"><h2>보유 선수</h2></div>
        <ul class="squad">${squadHtml}</ul>
        <p class="staffline">
          <span>감독 <b>${esc(manager.name)}</b> ${manager.tier}${manager.trait ? ` / ${manager.trait}` : ''}</span>
          <span>수석 코치 <b>${staff.headCoach.level}</b></span>
          <span>스카우터 <b>${staff.headScout.level}</b></span>
        </p>
      </section>`,
  };

  const showEvent = phase === 'summer' && week === SUMMER_MARKET_WEEKS[0] && eventMessage;

  setScreen(`
    <header class="topbar">
      <div class="topbar__row">
        <span class="topbar__club">${esc(club.name)}</span>
        <span class="topbar__phase">${phaseLabel}</span>
        <span class="topbar__week"><b>${week}</b>/${maxWeek}주</span>
      </div>
      <div class="weekdots">${dots}</div>
      <div class="res">
        <div class="res__item">
          <span class="res__label">자금</span>
          <span class="res__val n">${funds.toLocaleString('ko-KR')}<i>G</i></span>
        </div>
        <div class="res__item">
          <span class="res__label">적응도</span>
          <span class="res__val n">${chemistry.toFixed(1)}</span>
          <div class="chembar${chemistry < 40 ? ' is-low' : ''}"><i style="width:${Math.min(100, chemistry)}%"></i></div>
        </div>
      </div>
    </header>

    <div class="powerstrip">
      ${POSITION_GROUPS.map((g) => {
        const avg = groupAvg(g.positions);
        return `<div class="pw"><span class="pw__label">${g.label}</span><span class="pw__val n">${avg === null ? '--' : avg.toFixed(0)}</span></div>`;
      }).join('')}
      <div class="pw pw--total"><span class="pw__label">팀 전력</span><span class="pw__val n">${teamPower.toFixed(0)}</span></div>
    </div>

    ${banner ? `<div class="banner">${esc(banner)}</div>` : ''}
    ${showEvent ? `<div class="banner banner--alert">${esc(eventMessage)}</div>` : ''}

    <div class="tabs" role="tablist">
      ${TABS.map((t) => `<button class="tab" role="tab" data-tab="${t.id}" aria-selected="${t.id === tab}">${t.label}${t.id === 'draft' ? `<span class="tab__count">${shopOffer.length}</span>` : ''}${t.id === 'squad' ? `<span class="tab__count">${squad.length}</span>` : ''}</button>`).join('')}
    </div>
    ${bodies[tab]}
  `, `<button class="cta" id="next-week-btn">${week === maxWeek ? (phase === 'summer' ? '전반기 시작' : '후반기 시작') : '다음 주로'}</button>`);

  for (const t of TABS) {
    document.querySelector(`[data-tab="${t.id}"]`).onclick = () => {
      currentState.tab = t.id;
      renderMarket(banner);
    };
  }
  if (tab === 'draft') {
    for (const card of shopOffer) {
      const btn = document.querySelector(`[data-buy="${card.id}"]`);
      btn.onclick = () => buyCard(card, document.querySelector(`[data-row="${card.id}"]`));
    }
    document.getElementById('reroll-btn').onclick = rerollShop;
  }
  if (tab === 'tactics') {
    for (const id of Object.keys(FORMATIONS)) {
      document.querySelector(`[data-formation="${id}"]`).onclick = () => {
        currentState.formation = id;
        renderMarket(banner);
      };
    }
  }
  if (tab === 'squad') {
    for (const p of squad) {
      document.querySelector(`[data-release-immediate="${p.id}"]`).onclick = () => releaseImmediate(p);
      document.querySelector(`[data-release-listed="${p.id}"]`).onclick = () => listForSale(p);
      if (isDeadlineWeek) {
        document.querySelector(`[data-release-deadline="${p.id}"]`).onclick = () => releaseDeadline(p);
      }
    }
  }
  document.getElementById('next-week-btn').onclick = nextWeek;

  saveRun(currentState, localStorage);
}

renderClubButtons();
