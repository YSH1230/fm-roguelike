import { CLUBS } from '../data/clubs.mjs';
import { saveRun, loadRun, clearRun } from '../data/local-save.mjs';
import { generateSquadPool, TIER5_SQUAD_WEIGHTS } from '../data/generate-player.mjs';
import { generateProceduralManager } from '../data/generate-manager.mjs';
import { assignRandomStaff } from '../data/staff.mjs';
import { GOD_PLAYERS } from '../data/god-players.mjs';
import { rollPreseasonEvent } from '../data/run-preseason-event.mjs';
import { generateShopOffer } from '../data/draft-shop.mjs';
import { getLeagueTier } from '../engine/league.mjs';
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
} from '../engine/constants.mjs';

// 슬라이스는 5부/4부만 구현 (스펙 11절) — 승격 시 다음 단계로, 3부 이상은 여기서 멈춘다
const LEAGUE_LADDER = ['tier5', 'tier4'];



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

const screenEl = () => document.getElementById('screen');
const dockEl = () => document.getElementById('dock');

function setScreen(html, dock = '') {
  screenEl().innerHTML = html;
  dockEl().innerHTML = dock;
}

function renderClubButtons() {
  const saved = loadRun(localStorage);
  const resume = saved
    ? `<button class="club club--resume" id="resume-btn">
         <div class="club__name">이어하기</div>
         <div class="club__line"><span class="club__tag">구단</span><span>${esc(saved.club.name)}</span></div>
         <div class="club__line"><span class="club__tag">진행</span><span>${saved.phase === 'summer' ? '여름' : '겨울'} ${saved.week}주차</span></div>
       </button>`
    : '';

  setScreen(`
    <div class="start">
      <h1 class="start__title">FM<br>ROGUELIKE</h1>
      <p class="start__sub">5부 리그 감독으로 시작합니다. 12주 동안 선수를 사고 팔아 한 시즌을 버티세요.</p>
      <div class="clubs">
        ${resume}
        ${CLUBS.map((club) => `
          <button class="club" data-club="${club.id}">
            <div class="club__name">${esc(club.name)}</div>
            <div class="club__line"><span class="club__tag club__tag--up">강점</span><span>${esc(club.strength)}</span></div>
            <div class="club__line"><span class="club__tag club__tag--down">약점</span><span>${esc(club.weakness)}</span></div>
          </button>`).join('')}
      </div>
    </div>
  `);

  document.getElementById('resume-btn')?.addEventListener('click', () => {
    currentState = saved;
    currentState.formation ??= DEFAULT_FORMATION; // 포메이션 도입 전 세이브 호환
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
    formation: DEFAULT_FORMATION,
    week: SUMMER_MARKET_WEEKS[0],
    phase: 'summer',
    transactedThisWeek: false,
    shopOffer: [],
    firstHalfPoints: null,
    listedForSale: [], // { card, method, resolveWeek }
    boardTrustUsed: false,
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

// 승격/잔류 후 같은 구단으로 새 시즌 시작 — 스펙 4절: 선수단 유지, 시장 상태만 초기화
function startNewSeason() {
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

  let banner = `${currentState.club.name}, ${currentState.leagueTierId === 'tier4' ? '4부' : '5부'} 새 시즌 시작`;
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

function buyCard(card) {
  const price = cardPrice(card);
  if (currentState.funds < price) return;
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
  const nextSeasonFunds = calculateStartingFunds(LEAGUE_LADDER.indexOf(currentState.leagueTierId));
  currentState.funds = applyCarryoverCap(currentState.funds, nextSeasonFunds);

  // 보드진의 신임: 해임 조건 1회 면제(사용 후 소멸)
  let boardTrustMessage = '';
  if (result === 'relegation' && manager.trait === 'boardTrust' && !currentState.boardTrustUsed) {
    currentState.boardTrustUsed = true;
    result = 'safe';
    boardTrustMessage = '<div class="banner banner--alert">보드진의 신임 발동 — 해임을 면했습니다. 이 효과는 소멸합니다.</div>';
  }

  const currentTierIndex = LEAGUE_LADDER.indexOf(currentState.leagueTierId);
  const canPromote = (result === 'promotion' || result === 'champion') && currentTierIndex < LEAGUE_LADDER.length - 1;

  let dockHtml;
  let closingHtml = '';
  if (result === 'relegation') {
    closingHtml = `<p class="pitch-note">안전 승점 ${tier.safePoints}을 넘지 못해 해임됐습니다. 이 런은 여기서 끝입니다.</p>`;
    dockHtml = '<button class="cta cta--danger" id="new-run-btn">새 런 시작</button>';
  } else if (canPromote) {
    closingHtml = `<p class="pitch-note">승격 보상 — 적응도 +${PROMOTION_CHEMISTRY_BONUS}, 자금 +${PROMOTION_FUNDS_BONUS_RATIO * 100}%</p>`;
    dockHtml = `<button class="cta" id="promote-btn">${LEAGUE_LADDER[currentTierIndex + 1] === 'tier4' ? '4부로 승격' : '다음 리그로 승격'}</button>`;
  } else if (result === 'promotion' || result === 'champion') {
    closingHtml = '<p class="pitch-note">이 슬라이스는 4부까지만 구현돼 있습니다. 3부 이상은 다음 마일스톤에서 이어집니다.</p>';
    dockHtml = '<button class="cta cta--ghost" id="new-run-btn">새 런 시작</button>';
  } else {
    dockHtml = '<button class="cta" id="continue-btn">같은 리그에서 새 시즌</button>';
  }

  // 승점 게이지: 안전/승격/우승선이 어디였는지 한 눈에
  const scale = Math.max(tier.championPoints * 1.1, totalPoints);
  const at = (v) => `${Math.min(100, (v / scale) * 100)}%`;

  setScreen(`
    <div class="verdict verdict--${result}">
      <div class="verdict__label">${esc(currentState.club.name)} · ${currentState.leagueTierId === 'tier4' ? '4부' : '5부'} 시즌 결산</div>
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
        <li><span>다음 시즌 이월 자금</span><b>${currentState.funds.toFixed(0)}G</b></li>
      </ul>
      ${closingHtml}
    </div>
    <div class="panel">
      <div class="panel__head"><h2>최종 라인업</h2><span class="panel__count">${currentFormation()}</span></div>
      ${renderPitch(slotted, currentFormation())}
    </div>
  `, dockHtml);

  document.getElementById('promote-btn')?.addEventListener('click', () => {
    currentState.leagueTierId = LEAGUE_LADDER[currentTierIndex + 1];
    currentState.chemistry = Math.min(100, currentState.chemistry + PROMOTION_CHEMISTRY_BONUS);
    currentState.funds = Math.round(currentState.funds * (1 + PROMOTION_FUNDS_BONUS_RATIO));

    // 승격 전용 위기: 핵심 선수 이적 요구 (스펙 8절). 위기 관리형 감독의 무효화는
    // 이미 시즌 시작 이벤트(FFP 긴급 감사)에 한 번 썼으므로 여기서는 다시 쓰지 않는다.
    const keyPlayer = [...currentState.squad].sort((a, b) => b.baseOVR - a.baseOVR)[0];
    if (keyPlayer && Math.random() < PROMOTION_TRANSFER_DEMAND_CHANCE) {
      renderPromotionTransferDemand(keyPlayer);
    } else {
      startNewSeason();
    }
  });
  document.getElementById('continue-btn')?.addEventListener('click', startNewSeason);
  document.getElementById('new-run-btn')?.addEventListener('click', () => {
    currentState = null;
    clearRun(localStorage);
    renderClubButtons();
  });
}

function renderPromotionTransferDemand(keyPlayer) {
  const { acceptProceeds, rejectOvrPenalty } = resolvePromotionTransferDemand(keyPlayer.price);
  setScreen(`
    <div class="choice">
      <div class="choice__kicker">승격 직후 위기</div>
      <h1 class="choice__title">빅클럽이 핵심 선수를<br>데려가려 합니다</h1>
      <p class="choice__body">
        <b>${esc(keyPlayer.name)}</b> (${keyPlayer.position} · OVR ${keyPlayer.baseOVR})에게 이적 요구가 들어왔습니다.
        보내면 자금이 생기고, 붙잡으면 선수가 이번 시즌 내내 흔들립니다.
      </p>
      <div class="options">
        <button class="option option--accept" id="accept-transfer-btn">
          <div class="option__name">보낸다</div>
          <div class="option__effect">이적료 <b>+${acceptProceeds}G</b>를 받고 선수단에서 제외</div>
        </button>
        <button class="option option--reject" id="reject-transfer-btn">
          <div class="option__name">붙잡는다</div>
          <div class="option__effect">선수단은 유지, ${esc(keyPlayer.name)}의 OVR <b>-${rejectOvrPenalty}</b></div>
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
function renderPitch(slotted, formationId) {
  const { slots, coords } = FORMATIONS[formationId];
  const chips = slots.map((pos, i) => {
    const p = slotted[i];
    const [x, y] = coords[i];
    const style = `left:${x}%;top:${y}%`;
    if (!p) {
      return `<div class="slot slot--empty" style="${style}">
        <div class="slot__card"><span class="slot__pos">${pos}</span><b class="slot__ovr">–</b></div>
      </div>`;
    }
    return `<div class="slot${p.offPosition ? ' slot--offpos' : ''}" style="${style};--tier:var(--t-${tierOf(p.baseOVR)})">
      <div class="slot__card">
        <span class="slot__pos">${pos}</span>
        <b class="slot__ovr">${p.baseOVR}</b>
      </div>
      <span class="slot__name">${esc(p.name)}</span>
    </div>`;
  }).join('');

  const offCount = slotted.filter((p) => p && p.offPosition).length;
  const note = offCount
    ? `<p class="pitch-note"><b>●</b> 표시 ${offCount}명은 주 포지션이 아닌 자리에 섰습니다.</p>`
    : '';
  return `<div class="pitch">${chips}</div>${note}`;
}

function renderMarket(banner = '') {
  const { club, manager, staff, squad, funds, chemistry, eventMessage, shopOffer, phase, week, listedForSale } = currentState;
  const maxWeek = phase === 'summer' ? SUMMER_MARKET_WEEKS[1] : WINTER_MARKET_WEEKS[1];
  const phaseLabel = phase === 'summer' ? '여름 이적시장' : '겨울 이적시장';
  const isDeadlineWeek = phase === 'winter' && week === WINTER_MARKET_WEEKS[1];
  const formationId = currentFormation();
  const { lineup, slotted, bench } = pickBestXI(squad, formationId);
  const inXI = new Set(lineup.map((p) => p.id));

  // 스트립은 시너지가 반영된 최종 OVR로 계산한다 — 포메이션을 바꿨을 때
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
  const weekSpan = maxWeek - weekStart + 1;
  const dots = Array.from({ length: weekSpan }, (_, i) => {
    const w = weekStart + i;
    const state = w < week ? 'is-done' : w === week ? 'is-now' : '';
    return `<i class="${state} ${phase === 'winter' ? 'is-winter' : ''}"></i>`;
  }).join('');

  const decay = transactionDecayAmount();
  const decayLabel = decay > 0 ? `적응도 -${decay}` : '적응도 유지';
  const offerHtml = shopOffer.map((c) => {
    const price = cardPrice(c);
    const affordable = funds >= price;
    const tier = tierOf(c.baseOVR);
    // 이 카드를 사면 베스트11 평균이 얼마나 오르는지 — 살지 말지의 실제 근거
    const after = pickBestXI([...squad, toSquadPlayer(c)], formationId);
    const gain = after.lineup.reduce((t, p) => t + p.baseOVR, 0) / after.lineup.length - baseAvg;
    const tags = [
      ...c.playstyleTags.map((t) => `<span class="tag">${TAG_LABELS[t] ?? t}</span>`),
      c.specialTrait ? `<span class="tag tag--trait">${TRAIT_LABELS[c.specialTrait] ?? c.specialTrait}</span>` : '',
    ].join('');
    return `<li class="offer" style="--tier:var(--t-${tier})">
      <div class="offer__id">
        <b class="offer__name">${esc(c.name)}</b>
        <span class="offer__tier">${TIER_LABELS[tier]}</span>
        <span class="offer__price${affordable ? '' : ' is-over'}">${price}<i>G</i></span>
      </div>
      <div class="offer__body">
        <div class="offer__stats">
          <span class="offer__pos">${c.position}</span>
          <b class="offer__ovr">${c.baseOVR}</b>
          <span class="offer__delta ${gain >= 0.05 ? 'is-up' : 'is-flat'}">${gain >= 0.05 ? `팀 +${gain.toFixed(1)}` : '전력 변화 없음'}</span>
          <span class="offer__age">${c.age}세</span>
        </div>
        <div class="tags">${tags}</div>
        <button class="buy" data-buy="${c.id}" ${affordable ? '' : 'disabled'}>
          <span>${affordable ? '영입' : '자금 부족'}</span>
          <span class="buy__cost">-${price}G · ${decayLabel}</span>
        </button>
      </div>
    </li>`;
  }).join('');

  const squadHtml = [...squad]
    .sort((a, b) => b.baseOVR - a.baseOVR)
    .map((p) => {
      const winterBlocked = phase === 'winter' && p.acquiredThisSeason;
      return `<li class="player${inXI.has(p.id) ? ' is-xi' : ''}" style="--tier:var(--t-${tierOf(p.baseOVR)})">
        <b class="player__ovr">${p.baseOVR}</b>
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

  const startWeekEvent = phase === 'summer' && week === SUMMER_MARKET_WEEKS[0] && eventMessage;

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
          <span class="res__val">${funds.toLocaleString('ko-KR')}<i>G</i></span>
        </div>
        <div class="res__item">
          <span class="res__label">적응도</span>
          <span class="res__val">${chemistry.toFixed(1)}</span>
          <div class="chembar${chemistry < 40 ? ' is-low' : ''}"><i style="width:${Math.min(100, chemistry)}%"></i></div>
        </div>
      </div>
    </header>

    <div class="powerstrip">
      ${POSITION_GROUPS.map((g) => {
        const avg = groupAvg(g.positions);
        return `<div class="pw">
          <span class="pw__label">${g.label}</span>
          <span class="pw__val">${avg === null ? '–' : avg.toFixed(0)}</span>
        </div>`;
      }).join('')}
      <div class="pw pw--total">
        <span class="pw__label">팀 전력</span>
        <span class="pw__val">${teamPower.toFixed(0)}</span>
      </div>
    </div>

    ${banner ? `<div class="banner">${esc(banner)}</div>` : ''}
    ${startWeekEvent ? `<div class="banner banner--alert">${esc(eventMessage)}</div>` : ''}

    <section class="panel">
      <div class="panel__head">
        <h2>전술</h2>
        <div class="formations">
          ${Object.keys(FORMATIONS).map((id) => `<button data-formation="${id}" aria-pressed="${id === formationId}">${id}</button>`).join('')}
        </div>
      </div>
      ${renderPitch(slotted, formationId)}
    </section>

    <section class="panel">
      <div class="panel__head">
        <h2>이번 주 드래프트</h2>
        <button class="reroll" id="reroll-btn" ${funds >= rerollCost() ? '' : 'disabled'}>리롤 <b>${rerollCost()}G</b></button>
      </div>
      <ul class="offers">${offerHtml || '<li class="empty">이번 주 매물이 없습니다.</li>'}</ul>
    </section>

    ${listedHtml ? `<section class="panel">
      <div class="panel__head"><h2>이적 명단</h2></div>
      <ul class="listed">${listedHtml}</ul>
    </section>` : ''}

    <section class="panel">
      <div class="panel__head">
        <h2>선수단</h2>
        <span class="panel__count">${squad.length}명</span>
      </div>
      <div class="squad-scroll"><ul class="squad">${squadHtml}</ul></div>
      <p class="pitch-note">감독 ${esc(manager.name)} (${manager.tier})${manager.trait ? ` · ${manager.trait}` : ''} · 코치 ${staff.headCoach.level} · 스카우터 ${staff.headScout.level}</p>
    </section>
  `, `<button class="cta" id="next-week-btn">${week === maxWeek ? (phase === 'summer' ? '전반기 시작' : '후반기 시작') : '다음 주로'}</button>`);

  for (const card of shopOffer) {
    document.querySelector(`[data-buy="${card.id}"]`).onclick = () => buyCard(card);
  }
  for (const p of squad) {
    document.querySelector(`[data-release-immediate="${p.id}"]`).onclick = () => releaseImmediate(p);
    document.querySelector(`[data-release-listed="${p.id}"]`).onclick = () => listForSale(p);
    if (isDeadlineWeek) {
      document.querySelector(`[data-release-deadline="${p.id}"]`).onclick = () => releaseDeadline(p);
    }
  }
  for (const id of Object.keys(FORMATIONS)) {
    document.querySelector(`[data-formation="${id}"]`).onclick = () => {
      currentState.formation = id;
      renderMarket(banner);
    };
  }
  document.getElementById('reroll-btn').onclick = rerollShop;
  document.getElementById('next-week-btn').onclick = nextWeek;

  saveRun(currentState, localStorage);
}

renderClubButtons();
