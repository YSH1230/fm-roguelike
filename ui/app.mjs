import { CLUBS } from '../data/clubs.mjs';
import { generateSquadPool, TIER5_SQUAD_WEIGHTS } from '../data/generate-player.mjs';
import { generateProceduralManager } from '../data/generate-manager.mjs';
import { rollPreseasonEvent } from '../data/run-preseason-event.mjs';
import { generateShopOffer } from '../data/draft-shop.mjs';
import { getLeagueTier } from '../engine/league.mjs';
import { runHalfSeason, judgeSeasonResult, advanceWeek } from '../engine/season.mjs';
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
} from '../engine/constants.mjs';

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

  // 초기 정비기(Week 1~3) 이벤트: 자금·스쿼드가 바뀔 수 있다
  const { funds, squad, message: eventMessage } = rollPreseasonEvent(rawSquad, baseFunds);
  const manager = generateProceduralManager('tactician');

  currentState = {
    club,
    squad,
    manager,
    chemistry: CHEMISTRY_START,
    funds,
    eventMessage,
    week: SUMMER_MARKET_WEEKS[0],
    phase: 'summer',
    transactedThisWeek: false,
    shopOffer: generateShopOffer(SHOP_OFFER_SIZE),
    firstHalfPoints: null,
    listedForSale: [], // { card, method, resolveWeek }
  };
  renderMarket();
}

function cardPrice(card) {
  const winterModifier = currentState.phase === 'winter' ? [WINTER_TAX_RATIO] : [];
  return applyCostModifiers(card.price, winterModifier);
}

function buyCard(card) {
  const price = cardPrice(card);
  if (currentState.funds < price) return;
  currentState.funds -= price;
  currentState.squad = [...currentState.squad, toSquadPlayer(card)];
  currentState.chemistry = applyTransactionDecay(currentState.chemistry, 1, CHEMISTRY_DECAY_PER_TRANSACTION);
  currentState.transactedThisWeek = true;
  currentState.shopOffer = currentState.shopOffer.filter((c) => c.id !== card.id);
  renderMarket();
}

function rerollShop() {
  if (currentState.funds < SHOP_REROLL_COST) return;
  currentState.funds -= SHOP_REROLL_COST;
  currentState.shopOffer = generateShopOffer(SHOP_OFFER_SIZE);
  renderMarket();
}

// 방출 3단계 (스펙 7절): 즉시(0%) / 이적 명단(1주 소모, 여름·겨울 범위 회수율) / Week12 데드라인(40%, 소모 없음)
function releaseImmediate(card) {
  currentState.squad = currentState.squad.filter((p) => p.id !== card.id);
  currentState.chemistry = applyTransactionDecay(currentState.chemistry, 1, CHEMISTRY_DECAY_PER_TRANSACTION);
  currentState.transactedThisWeek = true;
  renderMarket();
}

function listForSale(card) {
  const method = currentState.phase === 'summer' ? 'listedSummer' : 'listedWinter';
  // 겨울 이적명단은 당해 영입 선수를 받지 않는다 (스펙 7절)
  if (method === 'listedWinter' && card.acquiredThisSeason) return;
  currentState.squad = currentState.squad.filter((p) => p.id !== card.id);
  currentState.listedForSale.push({ card, method, resolveWeek: currentState.week + 1 });
  currentState.chemistry = applyTransactionDecay(currentState.chemistry, 1, CHEMISTRY_DECAY_PER_TRANSACTION);
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
    runFirstHalf();
    return;
  }
  if (currentState.phase === 'winter' && currentState.week > WINTER_MARKET_WEEKS[1]) {
    runSecondHalfAndFinish();
    return;
  }
  currentState.shopOffer = generateShopOffer(SHOP_OFFER_SIZE);
  renderMarket(saleMessage);
}

function runFirstHalf() {
  const { lineup, bench } = pickBestXI(currentState.squad);
  currentState.firstHalfPoints = runHalfSeason(lineup, bench, currentState.manager.tier, currentState.chemistry, 'tier5');
  currentState.phase = 'winter';
  currentState.week = WINTER_MARKET_WEEKS[0];
  currentState.shopOffer = generateShopOffer(SHOP_OFFER_SIZE);
  renderMarket(`전반기 결산: ${currentState.firstHalfPoints.toFixed(1)}점. 겨울 이적시장이 시작됩니다(윈터 택스 +${WINTER_TAX_RATIO * 100}%).`);
}

const RESULT_LABELS = { champion: '우승권!', promotion: '승격권', safe: '안전 잔류', relegation: '강등 위기' };

function runSecondHalfAndFinish() {
  const { lineup, bench } = pickBestXI(currentState.squad);
  const secondHalf = runHalfSeason(lineup, bench, currentState.manager.tier, currentState.chemistry, 'tier5');
  const totalPoints = currentState.firstHalfPoints + secondHalf;
  const result = judgeSeasonResult(totalPoints, 'tier5');
  const tier = getLeagueTier('tier5');
  const nextSeasonFunds = calculateStartingFunds(0);
  const carryover = applyCarryoverCap(currentState.funds, nextSeasonFunds);

  document.getElementById('run-info').innerHTML = `
    <h2>${currentState.club.name} — 시즌 최종 결산</h2>
    <p>전반기 ${currentState.firstHalfPoints.toFixed(1)}점 · 후반기 ${secondHalf.toFixed(1)}점</p>
    <p>시즌 최종 승점: <strong>${totalPoints.toFixed(1)}</strong> / ${tier.championPoints}(우승)</p>
    <p>${RESULT_LABELS[result]} — 안전 ${tier.safePoints} · 승격 ${tier.targetPoints} · 우승 ${tier.championPoints}</p>
    <p>다음 시즌 이월 가능 자금(최대): ${carryover.toFixed(0)}G</p>
    <h3>최종 라인업</h3>
    <ul>${lineup.map(renderCard).join('')}</ul>
  `;
}

function renderMarket(banner = '') {
  const { club, squad, funds, chemistry, eventMessage, shopOffer, phase, week, listedForSale } = currentState;
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
    ${banner ? `<p><strong>${banner}</strong></p>` : ''}
    ${phase === 'summer' && week === SUMMER_MARKET_WEEKS[0] ? `<p>${eventMessage}</p>` : ''}
    <p>보유 자금: ${funds}G · 적응도: ${chemistry.toFixed(1)}</p>
    <h3>이번 주 드래프트</h3>
    <ul>${offerHtml || '<li>매물 없음</li>'}</ul>
    <button id="reroll-btn" ${funds >= SHOP_REROLL_COST ? '' : 'disabled'}>리롤 (${SHOP_REROLL_COST}G)</button>
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
}

renderClubButtons();
