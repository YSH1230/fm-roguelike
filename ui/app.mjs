import { CLUBS } from '../data/clubs.mjs';
import { generateSquadPool, TIER5_SQUAD_WEIGHTS } from '../data/generate-player.mjs';
import { generateProceduralManager } from '../data/generate-manager.mjs';
import { rollPreseasonEvent } from '../data/run-preseason-event.mjs';
import { getLeagueTier } from '../engine/league.mjs';
import { runFullSeason } from '../engine/season.mjs';
import { calculateStartingFunds, applyCarryoverCap } from '../engine/economy.mjs';
import { CHEMISTRY_START } from '../engine/constants.mjs';

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
  const { lineup, bench } = pickBestXI(squad);

  currentState = { club, squad, manager, lineup, bench, chemistry: CHEMISTRY_START, funds, eventMessage };
  renderSquad();
}

function renderSquad() {
  const { club, manager, lineup, bench, funds, eventMessage } = currentState;
  document.getElementById('run-info').innerHTML = `
    <h2>${club.name} — 감독 ${manager.name} (${manager.tier}, ×${manager.multiplier})</h2>
    <p>시작 자금: ${funds}G · ${eventMessage}</p>
    <h3>선발 라인업</h3>
    <ul>${lineup.map(renderCard).join('')}</ul>
    <h3>벤치</h3>
    <ul>${bench.map(renderCard).join('')}</ul>
    <button id="simulate-btn">시즌 결산 실행</button>
    <div id="result"></div>
  `;
  document.getElementById('simulate-btn').onclick = runSeason;
}

const RESULT_LABELS = {
  champion: '우승권!',
  promotion: '승격권',
  safe: '안전 잔류',
  relegation: '강등 위기',
};

function runSeason() {
  const { manager, lineup, bench, chemistry, funds } = currentState;
  const tier = getLeagueTier('tier5');

  // 스펙 2절: 여름 시장(스쿼드 확정, 이미 완료) → 전반기 결산 → 겨울 시장 → 후반기 결산
  const { firstHalf, secondHalf, totalPoints, result } = runFullSeason(
    lineup,
    bench,
    manager.tier,
    chemistry,
    'tier5'
  );

  const nextSeasonFunds = calculateStartingFunds(0); // 잔류 시 다음 시즌도 5부
  const carryover = applyCarryoverCap(funds, nextSeasonFunds);

  document.getElementById('result').innerHTML = `
    <p>전반기 결산: ${firstHalf.toFixed(1)}점 · 후반기 결산: ${secondHalf.toFixed(1)}점</p>
    <p>시즌 최종 승점: <strong>${totalPoints.toFixed(1)}</strong> / ${tier.championPoints}(우승)</p>
    <p>${RESULT_LABELS[result]} — 안전 ${tier.safePoints} · 승격 ${tier.targetPoints} · 우승 ${tier.championPoints}</p>
    <p>다음 시즌 이월 가능 자금(최대): ${carryover.toFixed(0)}G</p>
  `;
}

renderClubButtons();
