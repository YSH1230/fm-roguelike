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
} from '../engine/constants.mjs';

// 슬라이스는 5부/4부만 구현 (스펙 11절) — 승격 시 다음 단계로, 3부 이상은 여기서 멈춘다
const LEAGUE_LADDER = ['tier5', 'tier4'];

const FORMATION_SLOTS = ['GK', 'CB', 'CB', 'WB', 'WB', 'CMF', 'CMF', 'AMF', 'W', 'W', 'ST'];

// 카드 데이터(정적)를 스쿼드 상태(동적 필드 포함)로 만든다. 새 스쿼드이므로
// 전원 이번 시즌 영입, 잔류 0시즌으로 취급 — 저니맨 태그가 바로 발동한다.
function toSquadPlayer(card) {
  return { ...card, seasonsAtClub: 0, acquiredThisSeason: true, inBench: false };
}

function pickBestXI(squad) {
  const pool = [...squad];
  const used = new Set();
  const lineup = [];
  for (const pos of FORMATION_SLOTS) {
    const byPosition = pool
      .filter((p) => !used.has(p.id) && p.position === pos)
      .sort((a, b) => b.baseOVR - a.baseOVR);
    const fallback = pool.filter((p) => !used.has(p.id)).sort((a, b) => b.baseOVR - a.baseOVR);
    const pick = byPosition[0] ?? fallback[0];
    if (pick) {
      used.add(pick.id);
      lineup.push(pick);
    }
  }
  const bench = pool
    .filter((p) => !used.has(p.id))
    .sort((a, b) => b.baseOVR - a.baseOVR)
    .slice(0, 5)
    .map((p) => ({ ...p, inBench: true }));
  return { lineup, bench };
}

function renderClubButtons() {
  const container = document.getElementById('club-select');
  container.innerHTML = '';

  const saved = loadRun(localStorage);
  if (saved) {
    const resumeBtn = document.createElement('button');
    resumeBtn.textContent = `이어하기 — ${saved.club.name} (${saved.phase === 'summer' ? '여름' : '겨울'} Week ${saved.week})`;
    resumeBtn.onclick = () => {
      currentState = saved;
      renderMarket();
    };
    container.appendChild(resumeBtn);
  }

  for (const club of CLUBS) {
    const btn = document.createElement('button');
    btn.textContent = `${club.name} (강점: ${club.strength} / 약점: ${club.weakness})`;
    btn.onclick = () => startRun(club);
    container.appendChild(btn);
  }
}

function renderCard(p) {
  const tags = p.playstyleTags.length ? p.playstyleTags.join(', ') : '-';
  return `<li>${p.name} · ${p.position} · OVR ${p.baseOVR} · ${tags}${p.specialTrait ? ` · [${p.specialTrait}]` : ''}</li>`;
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
  const { lineup, bench } = pickBestXI(currentState.squad);
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
  const { lineup, bench } = pickBestXI(currentState.squad);
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
    boardTrustMessage = '<p><strong>보드진의 신임 발동: 해임을 면했습니다(1회 소멸).</strong></p>';
  }

  const currentTierIndex = LEAGUE_LADDER.indexOf(currentState.leagueTierId);
  const canPromote = (result === 'promotion' || result === 'champion') && currentTierIndex < LEAGUE_LADDER.length - 1;

  let nextStepHtml;
  if (result === 'relegation') {
    nextStepHtml = `<p><strong>해임 — Run 종료.</strong> 안전 승점(${tier.safePoints})을 넘지 못했습니다.</p>
      <button id="new-run-btn">새 런 시작</button>`;
  } else if (canPromote) {
    nextStepHtml = `<p>승격 보상: 적응도 +${PROMOTION_CHEMISTRY_BONUS}, 자금 +${PROMOTION_FUNDS_BONUS_RATIO * 100}%</p>
      <button id="promote-btn">${LEAGUE_LADDER[currentTierIndex + 1] === 'tier4' ? '4부로' : '다음 리그로'} 승격하고 계속</button>`;
  } else if (result === 'promotion' || result === 'champion') {
    nextStepHtml = `<p>이 슬라이스는 5부·4부까지만 구현되어 있습니다. 3부 이상은 다음 마일스톤에서 이어집니다.</p>
      <button id="new-run-btn">새 런 시작</button>`;
  } else {
    nextStepHtml = `<button id="continue-btn">같은 리그에서 새 시즌 시작</button>`;
  }

  document.getElementById('run-info').innerHTML = `
    <h2>${currentState.club.name} — 시즌 최종 결산</h2>
    ${boardTrustMessage}
    ${saleMessage ? `<p>${saleMessage}</p>` : ''}
    <p>전반기 ${currentState.firstHalfPoints.toFixed(1)}점 · 후반기 ${secondHalf.toFixed(1)}점</p>
    <p>시즌 최종 승점: <strong>${totalPoints.toFixed(1)}</strong> / ${tier.championPoints}(우승)</p>
    <p>${RESULT_LABELS[result]} — 안전 ${tier.safePoints} · 승격 ${tier.targetPoints} · 우승 ${tier.championPoints}</p>
    <p>다음 시즌 이월 가능 자금(최대): ${currentState.funds.toFixed(0)}G</p>
    <h3>최종 라인업</h3>
    <ul>${lineup.map(renderCard).join('')}</ul>
    ${nextStepHtml}
  `;

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
    document.getElementById('run-info').innerHTML = '';
    renderClubButtons();
  });
}

function renderPromotionTransferDemand(keyPlayer) {
  const { acceptProceeds, rejectOvrPenalty } = resolvePromotionTransferDemand(keyPlayer.price);
  document.getElementById('run-info').innerHTML = `
    <h2>승격 전용 위기: 핵심 선수 이적 요구</h2>
    <p>빅클럽이 ${keyPlayer.name}(OVR ${keyPlayer.baseOVR})을 원합니다.</p>
    <button id="accept-transfer-btn">수락 — ${acceptProceeds}G에 방출</button>
    <button id="reject-transfer-btn">거부 — 이번 시즌 OVR -${rejectOvrPenalty}</button>
  `;
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

function renderMarket(banner = '') {
  const { club, manager, staff, squad, funds, chemistry, eventMessage, shopOffer, phase, week, listedForSale } = currentState;
  const maxWeek = phase === 'summer' ? SUMMER_MARKET_WEEKS[1] : WINTER_MARKET_WEEKS[1];
  const phaseLabel = phase === 'summer' ? '여름 이적시장' : '겨울 이적시장';
  const isDeadlineWeek = phase === 'winter' && week === WINTER_MARKET_WEEKS[1];

  const offerHtml = shopOffer
    .map((c) => {
      const price = cardPrice(c);
      const affordable = funds >= price;
      return `<li>${c.name} · ${c.position} · OVR ${c.baseOVR} · ${price}G
        <button data-buy="${c.id}" ${affordable ? '' : 'disabled'}>구매</button></li>`;
    })
    .join('');

  const squadHtml = [...squad]
    .sort((a, b) => b.baseOVR - a.baseOVR)
    .map((p) => {
      const winterBlocked = phase === 'winter' && p.acquiredThisSeason;
      return `<li>${p.name} · ${p.position} · OVR ${p.baseOVR} · ${p.price}G
        <button data-release-immediate="${p.id}">즉시 방출(0%)</button>
        <button data-release-listed="${p.id}" ${winterBlocked ? 'disabled title="당해 영입 선수는 겨울 이적명단 등재 불가"' : ''}>이적 명단 등재(1주 소모)</button>
        ${isDeadlineWeek ? `<button data-release-deadline="${p.id}">데드라인 매각(40%)</button>` : ''}
      </li>`;
    })
    .join('');
  const listedHtml = listedForSale.map((l) => `<li>${l.card.name} (${l.resolveWeek}주차에 회수 예정)</li>`).join('');

  document.getElementById('run-info').innerHTML = `
    <h2>${club.name} — ${phaseLabel} (Week ${week}/${maxWeek})</h2>
    <p>감독: ${manager.name} (${manager.tier}, ×${manager.multiplier}${manager.trait ? `, [${manager.trait}]` : ''})</p>
    <p>스태프: 수석 코치(${staff.headCoach.level}) · 수석 스카우터(${staff.headScout.level})</p>
    ${banner ? `<p><strong>${banner}</strong></p>` : ''}
    ${phase === 'summer' && week === SUMMER_MARKET_WEEKS[0] && eventMessage ? `<p>${eventMessage}</p>` : ''}
    <p>보유 자금: ${funds}G · 적응도: ${chemistry.toFixed(1)}</p>
    <h3>이번 주 드래프트</h3>
    <ul>${offerHtml || '<li>매물 없음</li>'}</ul>
    <button id="reroll-btn" ${funds >= rerollCost() ? '' : 'disabled'}>리롤 (${rerollCost()}G)</button>
    <button id="next-week-btn">다음 주로</button>
    <h3>보유 선수단 (${squad.length}명)</h3>
    <ul>${squadHtml}</ul>
    ${listedHtml ? `<h3>이적 명단 대기 중</h3><ul>${listedHtml}</ul>` : ''}
  `;
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
  document.getElementById('reroll-btn').onclick = rerollShop;
  document.getElementById('next-week-btn').onclick = nextWeek;

  saveRun(currentState, localStorage);
}

renderClubButtons();
