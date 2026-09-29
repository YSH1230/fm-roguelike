import { CLUBS, buildTierClubOffers, buildLeagueRivals } from '../data/clubs.mjs';
import { saveRun, loadRun, clearRun, withRunDefaults } from '../data/local-save.mjs';
import { generateSquadPool, generateStartingSquad, MOVE_SQUAD_WEIGHTS_BY_TIER } from '../data/generate-player.mjs';
import { generateProceduralManager } from '../data/generate-manager.mjs';
import { assignRandomStaff, generateStaffOffer, generateStaffCandidate } from '../data/staff.mjs';
import { generateManagerOffer } from '../data/manager-shop.mjs';
import { GOD_PLAYERS } from '../data/god-players.mjs';
import { rollPreseasonEvent } from '../data/run-preseason-event.mjs';
import { generateShopOffer } from '../data/draft-shop.mjs';
import { getLeagueTier, getLadderIndex, getNextTier, convertPowerToPoints } from '../engine/league.mjs';
import { judgeRunOutcome, nextMissedTargetCount, computeReputation } from '../engine/run.mjs';
import { simulateChampionsLeague, UCL_RESULT_LABELS, UCL_REWARDS_FUNDS } from '../engine/champions-league.mjs';
import { runHalfSeason, judgeSeasonResult, advanceWeek } from '../engine/season.mjs';
import { resolvePromotionTransferDemand } from '../engine/events.mjs';
import {
  calculateStartingFunds,
  applyCarryoverCap,
  applyCostModifiers,
  computeReleaseProceeds,
  renewalCost,
} from '../engine/economy.mjs';
import { applyTransactionDecay } from '../engine/chemistry.mjs';
import { computePlayerFinalOVR, countEffectiveContinentRequirement } from '../engine/ovr.mjs';
import {
  PLAYSTYLE_TAGS, CONTINENT_TAGS,
  STAFF_LEVELS, STAFF_PRICE_TABLE,
} from '../engine/constants.mjs';
import { computeTeamPower } from '../engine/team-power.mjs';
import { FORMATIONS, DEFAULT_FORMATION, POSITION_GROUPS } from './formations.mjs';
import { renderPortrait } from './portrait.mjs';
import { renderCrest } from './crest.mjs';
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
  // 스펙: 신규 계약은 2년 고정. 매 시즌 시작(startNewSeason)마다 1씩 줄어들고,
  // 0이 된 채로 그 시즌 여름이 끝나면 재계약 안 한 선수는 무료로 이탈한다.
  return { ...card, seasonsAtClub: 0, acquiredThisSeason: true, inBench: false, contractYearsLeft: 2 };
}

// 스쿼드를 한 번에 통째로 생성할 때만 쓴다(런 시작/이적). 전원이 2년으로
// 똑같이 맞춰지면 2시즌마다 스쿼드 전체가 한꺼번에 만료돼 "몇 명 붙잡을지"가
// 아니라 "전원을 다시 살지"가 돼버린다 - 절반은 1년, 절반은 2년으로 미리 흩어둔다.
function staggerContracts(squad) {
  return squad.map((p) => ({ ...p, contractYearsLeft: Math.random() < 0.5 ? 1 : 2 }));
}

// formationId의 슬롯 순서대로 최고 OVR을 채운다. 포지션이 맞는 선수가 없으면
// 남은 최고 OVR로 대타를 세우고 offPosition으로 표시한다(화면에서 금색 점).
// manualOverrides(슬롯 인덱스 -> 선수 id)로 고정한 자리는 자동 선발이 건드리지
// 않는다 - 유저가 전술 탭에서 직접 배치한 선수다.
function pickBestXI(squad, formationId = DEFAULT_FORMATION, manualOverrides = {}) {
  const { slots } = FORMATIONS[formationId] ?? FORMATIONS[DEFAULT_FORMATION];
  const pool = [...squad];
  const used = new Set();
  const forced = {};
  for (const [idxStr, playerId] of Object.entries(manualOverrides)) {
    const idx = Number(idxStr);
    if (!slots[idx]) continue;
    const player = pool.find((p) => p.id === playerId && !used.has(p.id));
    if (player) {
      forced[idx] = player;
      used.add(player.id);
    }
  }
  const lineup = slots.map((pos, i) => {
    if (forced[i]) return { ...forced[i], slotPosition: pos, offPosition: forced[i].position !== pos };
    const byPosition = pool
      .filter((p) => !used.has(p.id) && p.position === pos)
      .sort((a, b) => b.baseOVR - a.baseOVR);
    const fallback = pool.filter((p) => !used.has(p.id)).sort((a, b) => b.baseOVR - a.baseOVR);
    const pick = byPosition[0] ?? fallback[0];
    if (!pick) return null; // 스쿼드가 11명 미만 — 빈 슬롯
    used.add(pick.id);
    return { ...pick, slotPosition: pos, offPosition: pick.position !== pos };
  });
  const bench = pool
    .filter((p) => !used.has(p.id))
    .sort((a, b) => b.baseOVR - a.baseOVR)
    .slice(0, 5)
    .map((p) => ({ ...p, inBench: true }));
  return { lineup: lineup.filter(Boolean), slotted: lineup, bench };
}

// 구단의 이사진 기대치(club.expectationModifier)를 리그 기준선 위에 얹는다.
// engine/league.mjs의 수치(2000판 실측 튜닝)는 그대로 두고 표시·판정에만 쓴다.
function effectiveTier(tierId) {
  const tier = getLeagueTier(tierId);
  const mod = currentState.expectationModifier ?? 0;
  return { ...tier, safePoints: tier.safePoints + mod, targetPoints: tier.targetPoints + mod, championPoints: tier.championPoints + mod };
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
// 전술 탭 "선수 특수 태그" 섹션에 쓰는 효과 설명(engine/ovr.mjs 실제 수치와 짝).
const TRAIT_EFFECT_DESCRIPTIONS = {
  seongGolYouth: '드래프트로 뽑은 유스 출신이면 본인 OVR +3',
  veteranLeader: '33세 이상이 선발이면 라인업 내 23세 이하 전원 OVR +2',
  superSub: '벤치에 있으면 선발 전원 OVR +1 (최대 +2 중첩)',
  hometownHero: '한 구단에서 뛴 시즌마다 본인 OVR +2 (최대 +6)',
  polyglot: '같은 대륙 선수가 있으면 대륙 케미 요구 인원 1명 감면(최소 2명)',
  journeyman: '이번 시즌에 영입됐으면 본인 OVR +4',
};
const CONTINENT_LABELS = {
  europe: '유럽', southAmerica: '남미', africa: '아프리카',
  asiaOceania: '아시아·오세아니아', northCentralAmerica: '북중미',
};
// 팀 케미/특수 태그 배지 안에 그리는 작은 기호(글자 대신 아이콘). 풀네임은
// title(호버)로만 남긴다. crest.mjs/portrait.mjs와 같은 원칙 - 이미지 파일
//없이 인라인 SVG path만으로 그린다.
const PLAYSTYLE_ICON_PATHS = {
  gegenpressing: '<path d="M6 16 L12 9 L18 16"/>',
  falseNine: '<path d="M7 7 H17 L12 17 Z"/>',
  longBallKickAndRush: '<path d="M5 18 L18 6 M12 6 H18 V12"/>',
  tikiTaka: '<circle cx="6" cy="17" r="1.5"/><circle cx="18" cy="17" r="1.5"/><circle cx="12" cy="6" r="1.5"/><path d="M6 17 L12 6 L18 17 Z"/>',
  totalFootball: '<path d="M4 9 H15 M11 5 L15 9 L11 13 M20 15 H9 M13 19 L9 15 L13 11"/>',
  falseFullBack: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/><path d="M5 12 H19"/>',
  buildUpFromBack: '<circle cx="12" cy="18" r="1.6"/><path d="M12 15 V5 M8 9 L12 5 L16 9"/>',
  counterAttack: '<path d="M13 2 L5 14 H11 L9 22 L19 9 H12 Z"/>',
};
const CONTINENT_ICON_PATHS = {
  europe: '<path d="M7 5 C10 4 14 4 16 6 C19 7 18 11 16 12 C18 14 16 18 12 18 C9 19 6 16 7 13 C4 11 5 7 7 5 Z"/>',
  southAmerica: '<path d="M12 3 C15 4 16 7 15 10 C17 12 15 16 13 17 C13 19 11 21 10 19 C9 17 10 14 9 12 C7 10 8 6 10 4 C10 3 11 3 12 3 Z"/>',
  africa: '<path d="M10 3 C14 3 17 6 16 10 C18 12 17 16 14 18 C13 20 10 20 10 18 C8 17 8 14 7 12 C5 10 6 6 9 4 C9 3 10 3 10 3 Z"/>',
  asiaOceania: '<path d="M4 8 C8 5 14 5 18 8 C20 9 19 12 16 12 C17 14 14 16 11 15 C9 16 6 15 6 12 C4 11 3 9 4 8 Z"/><circle cx="19" cy="17" r="1.5"/>',
  northCentralAmerica: '<path d="M6 4 H18 L15 11 C15 13 13 13 13 15 L11 21 L9 15 C9 13 8 12 8 10 Z"/>',
};
const TRAIT_ICON_PATHS = {
  seongGolYouth: '<path d="M12 2 L14.7 8.6 L22 9.3 L16.5 14 L18 21 L12 17.3 L6 21 L7.5 14 L2 9.3 L9.3 8.6 Z"/>',
  veteranLeader: '<rect x="5" y="9" width="14" height="6" rx="1.5"/><path d="M5 12 H19"/>',
  superSub: '<path d="M8 15 L8 5 M8 5 L5 8 M8 5 L11 8 M16 9 L16 19 M16 19 L13 16 M16 19 L19 16"/>',
  hometownHero: '<path d="M4 11 L12 4 L20 11 M6 10 V20 H18 V10"/>',
  polyglot: '<path d="M4 5 H20 V15 H9 L5 19 V15 H4 Z"/>',
  journeyman: '<rect x="4" y="8" width="16" height="11" rx="1.5"/><path d="M9 8 V6 C9 5 10 4 11 4 H13 C14 4 15 5 15 6 V8"/>',
};
function renderTagIcon(paths, id) {
  const inner = paths[id] ?? '<circle cx="12" cy="12" r="6"/>';
  return `<svg class="badgeicon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}
const MANAGER_TIER_LABELS = { rookie: '루키', tactician: '택티션', legendary: '레전더리', god: 'GOD' };
const STAFF_LEVEL_LABELS = { academy: '아카데미', proLicense: '프로 라이선스', veteran: '베테랑', master: '마스터' };
// 선수 카드의 등급 색(--t-*)을 감독/스태프에도 그대로 물린다 - 등급이라는
// 의미를 색으로 나른다는 원칙은 세 종류(선수/감독/스태프) 모두 같다.
const MANAGER_TIER_COLOR = { rookie: 't-local', tactician: 't-bigLeaguer', legendary: 't-legendary', god: 't-god' };
const STAFF_LEVEL_COLOR = { academy: 't-local', proLicense: 't-bigLeaguer', veteran: 't-worldClass', master: 't-legendary' };
const STAFF_ROLE_LABELS = { headCoach: '수석 코치', headScout: '스카우터' };
const MANAGER_TRAIT_LABELS = {
  hairdryer: '헤어드라이어', boardTrust: '보드진의 신임', silverTongue: '화술의 달인',
  youthCallUp: '유스 콜업', reboundArchitect: '리빌딩 장인', firefighter: '소방수',
  crisisManager: '위기 관리형', longTermReign: '장기 집권형', tacticalPurist: '전술 원리주의자',
};
// 감독·스태프 칸(사단 꾸리기)에서 "이 성향이 뭘 하는지" 보여주는 설명.
const MANAGER_TRAIT_DESCRIPTIONS = {
  hairdryer: '영입 즉시 적응도 +20',
  boardTrust: '강등 확정 시 1회 한정 무효화',
  silverTongue: '감독과 같은 대륙·전술 태그 선수 영입비 -30%',
  youthCallUp: '유스 매물 등장 확률 상승',
  reboundArchitect: '거래 1건당 적응도 하락폭 절반',
  firefighter: '안전권은 넘고 목표선은 못 넘은 페이스로 겨울 진입 시 적응도 +30',
  crisisManager: '위기 이벤트 무효화',
  longTermReign: '같은 구단 잔류 시즌마다 적응도 시작값 +3',
  tacticalPurist: '감독의 전술 태그를 라인업에 자동 부스트',
};
const STAFF_ROLE_DESCRIPTIONS = {
  headCoach: '거래 1건당 적응도 하락폭을 등급별로 줄여준다',
  headScout: '매주 매물 수를 늘리고(마스터는 다시 뽑기 비용도 절반)',
};

// 선수단/전술 탭에서 선수 태그(플레이스타일·대륙)를 한눈에 보여준다.
// 팀 케미 패널은 라인업 전체 집계라 개인이 무슨 태그인지는 안 보였다.
function playerTagsHtml(p) {
  const chips = [
    ...(p.playstyleTags ?? []).map((t) => `<span class="tag">${TAG_LABELS[t] ?? t}</span>`),
    p.continentTag ? `<span class="tag tag--continent">${CONTINENT_LABELS[p.continentTag] ?? p.continentTag}</span>` : '',
  ].join('');
  return chips ? `<div class="tags">${chips}</div>` : '';
}

function esc(text) {
  return String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

const screenEl = () => document.getElementById('screen');
const dockEl = () => document.getElementById('dock');

function setScreen(html, dock = '') {
  screenEl().innerHTML = html;
  dockEl().innerHTML = dock;
}

// 전/후반기 결산 직전에 잠깐 "경기가 진행 중"인 느낌을 준다. 실제 경기를
// 시뮬레이션하지는 않으므로(스펙상 결과는 이미 계산되어 있음) 순수 연출.
// 공은 CSS 키프레임으로만 움직인다 - 좌표를 계산해 그릴 이유가 없다.
const SIM_PHRASES = ['킥오프', '중원 싸움', '측면 침투', '코너킥', '결정적 찬스', '역습 시도', '추가시간', '휘슬'];

// 다른 구단은 게임에 존재하지 않는다(리그는 승점 하나로 추상화됨) - 순위판은
// 연출용 가짜 이름이고, 내 구단 승점만 실제 계산값을 향해 올라간다.
// 리그마다 20개 구단 풀(data/clubs.mjs)에서 뽑아 지금 뛰는 등급과 이름 격이 맞는다.
function pickRivals(n) {
  return buildLeagueRivals(currentState.leagueTierId, n);
}

function renderSimulating(clubName, tierLabel, phaseLabel, kitColor, finalPoints, onDone) {
  const isSecondHalf = phaseLabel === '후반기';
  const minuteStart = isSecondHalf ? 45 : 0;
  const minuteEnd = isSecondHalf ? 90 : 45;
  const steps = 10;
  const stepMs = 300;

  const myTarget = Math.max(0, Math.round(finalPoints));
  const rows = [
    { name: clubName, kit: kitColor, mine: true, target: myTarget },
    ...pickRivals(4).map((c) => ({ ...c, mine: false, target: Math.max(0, myTarget + Math.round((Math.random() - 0.5) * 18)) })),
  ];

  // 순위가 바뀌는 게 실제로 눈에 보이게: 이전 tick 대비 오른 숫자는 잠깐
  // 초록으로 반짝이고(is-up), 줄 순서가 바뀌면 FLIP으로 부드럽게 미끄러진다.
  // innerHTML을 통째로 갈아치우면 이 두 가지가 전부 안 보인다 - 예전 버그였다.
  const prevValues = new Map(rows.map((r) => [r.name, 0]));

  const buildStandingsHtml = (i) => {
    const withValue = rows
      .map((r) => ({ ...r, value: i >= steps ? r.target : Math.max(0, Math.round((r.target * i) / steps + (Math.random() - 0.5) * 3)) }))
      .sort((a, b) => b.value - a.value);
    return withValue
      .map((r, idx) => {
        const isUp = r.value > (prevValues.get(r.name) ?? 0);
        prevValues.set(r.name, r.value);
        return `
        <li class="${r.mine ? 'is-mine' : ''}" data-key="${esc(r.name)}">
          <span class="standings__rank">${idx + 1}</span>
          ${renderCrest({ name: r.name, kit: r.kit }, { size: 22 })}
          <span class="standings__name">${esc(r.name)}</span>
          <span class="standings__pts n${isUp ? ' is-up' : ''}">${r.value}</span>
        </li>`;
      })
      .join('');
  };

  // FLIP: 갱신 전 각 행의 위치를 기록해뒀다가, 갱신 후 그 자리에서 시작하는
  // 것처럼 보이게 transform으로 되돌린 다음 0으로 애니메이션한다.
  const updateStandings = (i) => {
    const el = document.getElementById('sim-standings');
    if (!el) return;
    const before = new Map();
    for (const li of el.children) before.set(li.dataset.key, li.getBoundingClientRect().top);
    el.innerHTML = buildStandingsHtml(i);
    for (const li of el.children) {
      const prevTop = before.get(li.dataset.key);
      if (prevTop == null) continue;
      const delta = prevTop - li.getBoundingClientRect().top;
      if (!delta) continue;
      li.style.transition = 'none';
      li.style.transform = `translateY(${delta}px)`;
      requestAnimationFrame(() => {
        li.style.transition = 'transform 320ms var(--ease)';
        li.style.transform = '';
      });
    }
  };

  setScreen(`
    <div class="matchsim" style="--kit:${kitColor}">
      <div class="matchsim__head">
        <span class="matchsim__club">${esc(clubName)} · ${esc(tierLabel)}</span>
        <span class="matchsim__clock" id="sim-clock">${minuteStart}'</span>
      </div>
      <div class="matchsim__pitch">
        <div class="matchsim__pitchLines"></div>
        <div class="matchsim__ball"></div>
      </div>
      <div class="matchsim__ticker">
        <span class="matchsim__dot"></span>
        <span id="sim-phrase">${SIM_PHRASES[0]}</span>
      </div>
      <div class="matchsim__stat">
        <span>점유율</span>
        <div class="chembar"><i id="sim-possession" style="width:50%"></i></div>
      </div>
      <div class="panel">
        <div class="panel__head"><h2>실시간 순위</h2><span class="panel__count">다른 경기 진행 중</span></div>
        <ul class="standings" id="sim-standings">${buildStandingsHtml(0)}</ul>
      </div>
    </div>
  `);

  let i = 0;
  const timer = setInterval(() => {
    i += 1;
    const phraseEl = document.getElementById('sim-phrase');
    const clockEl = document.getElementById('sim-clock');
    const possessionEl = document.getElementById('sim-possession');
    if (phraseEl) phraseEl.textContent = SIM_PHRASES[i % SIM_PHRASES.length];
    if (clockEl) {
      const minute = Math.min(minuteEnd, minuteStart + Math.round(((minuteEnd - minuteStart) * i) / steps));
      clockEl.textContent = `${minute}'`;
    }
    if (possessionEl) possessionEl.style.width = `${Math.round(38 + Math.random() * 28)}%`;
    updateStandings(i);
  }, stepMs);
  setTimeout(() => {
    clearInterval(timer);
    onDone();
  }, steps * stepMs + 300);
}

// 시네마틱 오프닝. 문장이 한 줄씩 순서대로 나타나고, 화면 아무 곳이나 누르면
// 즉시 다음(튜토리얼)으로 넘어간다 - 새 게임을 시작할 때마다 뜨는 화면이라
// 여러 번 보면 지겨워지므로 스킵을 언제나 허용한다.
const STORY_LINES = [
  '아무도 이름을 몰랐다.',
  '관중 없는 5부 리그. 여기서 시작한다.',
  '한 시즌, 한 시즌을 버틴다.',
  '승격. 또 승격.',
  '마침내 1부.',
  '리그 우승, 그다음은 유럽이다.',
  '바닥에서 정상까지.',
  '오늘부터, 이 구단은 당신의 것이다.',
];

function renderStoryIntro() {
  setScreen(`
    <div class="story" id="story-screen">
      ${STORY_LINES.map((line, i) => `<p class="story__line" style="animation-delay:${i * 900}ms">${esc(line)}</p>`).join('')}
      <p class="story__skip" style="animation-delay:${STORY_LINES.length * 900}ms">탭하여 계속</p>
    </div>
  `);
  document.getElementById('story-screen').onclick = () => renderTutorialFlow();
}

// 시즌이 실제로 어떻게 굴러가는지 - 예전엔 구단을 고른 뒤(renderCareerIntro)에만
// 보여줬는데, 그러면 구단 선택 화면이 설명 없이 뚝 떨어진 느낌이었다.
// 구단과 무관한 공통 설명이라 구단 선택보다 앞으로 옮겼다.
function renderTutorialFlow() {
  setScreen(`
    <div class="story story--tutorial" id="tutorial-screen">
      <p class="story__line is-shown">선수, 감독, 스태프를 영입해 팀을 강화하세요.</p>
      <ol class="flowsteps story__steps is-shown">
        <li>여름 이적시장 (8주) — 선수를 사고 판다</li>
        <li>전반기 시뮬레이션 — 결산으로 페이스를 확인</li>
        <li>겨울 이적시장 (4주) — 부족한 자리를 보강</li>
        <li>후반기 시뮬레이션 — 최종 결과 확정</li>
        <li>시즌 결산 — 승격/잔류/해임이 갈림</li>
      </ol>
      <p class="story__skip is-shown">탭하여 계속</p>
    </div>
  `);
  document.getElementById('tutorial-screen').onclick = () => renderClubButtons();
}

function renderClubButtons() {
  const saved = loadRun(localStorage);
  const resume = saved
    ? `<button class="club club--resume" id="resume-btn" style="--kit:${saved.club.kit ?? '#dda63a'}">
         ${renderCrest(saved.club, { size: 40 })}
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
        ${CLUBS.map((club) => {
          const rankTag = club.expectationModifier > 0 ? '탑독' : club.expectationModifier < 0 ? '언더독' : '중위권';
          return `
          <button class="club" data-club="${club.id}" style="--kit:${club.kit}">
            ${renderCrest(club, { size: 40 })}
            <div class="club__body">
              <div class="club__name">${esc(club.name)}</div>
              <div class="club__line"><span class="club__tag">지난 시즌</span><span>${club.lastSeasonRank}위 · ${rankTag}</span></div>
              <div class="club__line"><span class="club__tag club__tag--up">강점</span><span>${esc(club.strength)}</span></div>
              <div class="club__line"><span class="club__tag club__tag--down">약점</span><span>${esc(club.weakness)}</span></div>
              <div class="club__line"><span class="club__tag">요구</span><span>${esc(club.demand.replace('이사진의 요구: ', ''))}</span></div>
            </div>
          </button>`;
        }).join('')}
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
  const rawSquad = staggerContracts(generateStartingSquad().map(toSquadPlayer));
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
  // 이벤트 없음(id === null)이면 팝업을 안 띄운다 - "아무 일도 없었다"는
  // 알림은 알림이 아니라 소음이다. good/bad는 팝업 색만 가른다.
  const eventTone = crisisBlocked ? 'good' : rolled.id === 'ffpAudit' ? 'bad' : rolled.id ? 'good' : null;

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
    eventTone,
    expectationModifier: club.expectationModifier ?? 0, // 이사진 요구치: 시즌 목표선 가감(탑독 +, 언더독 -)
    leagueTierId: 'tier5',
    highestTierId: 'tier5', // 이번 런에서 도달한 최고 리그 (명성 점수용)
    titles: 0, // 우승 횟수
    uclTitles: 0, // 챔피언스리그 우승 횟수 (1부에서만 발생)
    missedTargetCount: 0, // 기대 목표 미달 누적 (스펙 2절: 3회면 해임)
    seasonNumber: 1,
    formation: DEFAULT_FORMATION,
    manualOverrides: {},
    selectedSlot: null,
    tab: 'draft',
    week: SUMMER_MARKET_WEEKS[0],
    phase: 'summer',
    transactedThisWeek: false,
    shopOffer: [],
    managerOffer: generateManagerOffer(3),
    staffOffer: generateStaffOffer(),
    firstHalfPoints: null,
    listedForSale: [], // { card, method, resolveWeek }
    boardTrustUsed: false,
    promotionFundsBonusPending: false,
    freshBudget: false,
    pendingTransferProceeds: 0,
  };
  currentState.shopOffer = generateShopOffer(scoutOfferSize(), currentState.availableGodPlayers, Math.random, currentState.leagueTierId);
  currentState.managerOffer = generateManagerOffer(3);
  currentState.staffOffer = generateStaffOffer();
  renderCareerIntro();
}

// 구단 고르자마자 바로 상점으로 떨어지면 "그냥 시작됐다"는 느낌만 남는다.
// 이번 시즌 목표(승점 게이지)와 시즌이 어떤 순서로 흘러가는지를 한 번은
// 보여주고 시작한다 - 이후 시즌은 이미 아는 내용이라 안 보여준다(시즌 종료
// 화면에서 바로 startNewSeason으로 넘어감, 여기로 안 옴).
// 지금 전력 그대로면 시즌 끝에 몇 점일지 - 팀 전력(65~95대 스쿼드 품질 점수)을
// 승점 눈금 위에 그대로 얹으면 단위가 다른 두 숫자가 우연히 겹쳐 보일 뿐이라,
// 엔진이 실제로 쓰는 변환식으로 승점 단위로 바꿔서 눈금과 같은 축에 놓는다.
const ZONE_VERDICT = {
  champion: '지금 전력이면 우승권입니다.',
  promotion: '지금 전력이면 승격권입니다.',
  safe: '지금 전력이면 안전권입니다.',
  relegation: '지금 전력으로는 강등권입니다.',
};

function renderCareerIntro() {
  const { club, manager, squad } = currentState;
  const tier = effectiveTier(currentState.leagueTierId);
  const scale = tier.championPoints * 1.1;
  const at = (v) => `${Math.min(100, (v / scale) * 100)}%`;
  const { lineup, bench } = pickBestXI(squad, currentFormation());
  const teamPower = computeTeamPower(lineup, bench, manager.tier, currentState.chemistry);
  const leagueAverageOVR = (tier.averageOVR[0] + tier.averageOVR[1]) / 2;
  const projectedPoints = convertPowerToPoints(teamPower, leagueAverageOVR);
  const zone = projectedPoints >= tier.championPoints ? 'champion'
    : projectedPoints >= tier.targetPoints ? 'promotion'
    : projectedPoints >= tier.safePoints ? 'safe'
    : 'relegation';

  setScreen(`
    <button class="backlink" id="back-to-clubs-btn">← 뒤로</button>
    <div class="verdict">
      <div class="verdict__label">커리어 시작</div>
      <div class="verdict__result" style="color:var(--light)">${esc(club.name)}</div>
      <p class="note" style="text-align:center">${tier.label} 감독으로 취임합니다. 12주 여름 이적시장으로 시즌이 시작됩니다.</p>
      ${club.demand ? `<p class="note" style="text-align:center;color:var(--gold)">${esc(club.demand)}</p>` : ''}
      <div class="pointbar">
        <div class="pointbar__fill" style="width:${at(projectedPoints)}"></div>
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
    <div class="panel">
      <div class="panel__head"><h2>이번 시즌 목표</h2></div>
      <p class="note" style="color:${zone === 'relegation' ? 'var(--debit)' : 'var(--turf)'}"><b>${ZONE_VERDICT[zone]}</b> (지금 스쿼드 그대로면 예상 승점 ${projectedPoints.toFixed(0)}점)</p>
      <ul class="summary">
        <li><span>안전권</span><b>${tier.safePoints}점</b></li>
        <li><span>승격권</span><b>${tier.targetPoints}점</b></li>
        <li><span>우승</span><b>${tier.championPoints}점</b></li>
        <li><span>시작 팀 전력</span><b>${teamPower.toFixed(1)}</b></li>
      </ul>
      <p class="note">승점은 전/후반기 합산입니다. 안전권을 넘기지 못하면 해임, 목표를 3시즌 연속 못 넘기면 경질됩니다.</p>
      ${club.weakness ? `<p class="note">약점: ${esc(club.weakness)}. 이 약점을 염두에 두고 시즌을 준비하세요.</p>` : ''}
    </div>
    <div class="panel">
      <div class="panel__head"><h2>감독</h2></div>
      <p class="staffline">
        <span>감독 <b>${esc(manager.name)}</b> ${MANAGER_TIER_LABELS[manager.tier] ?? manager.tier}${manager.trait ? ` / ${MANAGER_TRAIT_LABELS[manager.trait] ?? manager.trait}` : ''}</span>
      </p>
    </div>
  `, '<button class="cta" id="start-season-btn">시즌 시작</button>');

  document.getElementById('start-season-btn').onclick = () => renderMarket();
  document.getElementById('back-to-clubs-btn').onclick = () => renderClubButtons();
}

// 수석 스카우터 등급에 따른 매주 매물 수 (스펙 5.3절: 3→4→4→5)
// 이번 주에 막 교체한 스태프는 아직 효과가 없다(스펙: "교체한 주는 신규
// 스태프 효과 미발동, 소급 없음") - 기본값으로 취급한다.
function isStaffFreshThisWeek(role) {
  return currentState.staff[role].hiredWeek === currentState.week;
}

function scoutOfferSize() {
  if (isStaffFreshThisWeek('headScout')) return SHOP_OFFER_SIZE;
  return SCOUT_SHOP_OFFER_SIZE_BY_LEVEL[currentState.staff.headScout.level] ?? SHOP_OFFER_SIZE;
}

// 마스터 스카우터는 리롤 비용 절반
function rerollCost() {
  if (isStaffFreshThisWeek('headScout')) return SHOP_REROLL_COST;
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
  // 이월은 스펙 2절대로 "구단 잔류 시"만. 구단을 옮기면 남은 돈은 따라오지 않는다.
  const carryover = currentState.freshBudget
    ? 0
    : Math.round(applyCarryoverCap(currentState.funds, grant));
  currentState.freshBudget = false;
  // 순서 주의: 이적료는 이월이 아니라 지급 뒤에 더한다. 지급 전에 더하면
  // 이월 상한(지급액의 30%)에 걸려 버튼에 적힌 금액보다 적게 들어온다.
  const proceeds = currentState.pendingTransferProceeds ?? 0;
  currentState.pendingTransferProceeds = 0;
  currentState.funds = grant + carryover + proceeds;
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
  currentState.eventTone = null;
  currentState.squad = currentState.squad.map((p) => ({
    ...p,
    acquiredThisSeason: false,
    seasonsAtClub: (p.seasonsAtClub ?? 0) + 1,
    contractYearsLeft: Math.max(0, (p.contractYearsLeft ?? 2) - 1),
  }));
  currentState.shopOffer = generateShopOffer(scoutOfferSize(), currentState.availableGodPlayers, Math.random, currentState.leagueTierId);
  currentState.managerOffer = generateManagerOffer(3);
  currentState.staffOffer = generateStaffOffer();

  let banner = `${currentState.club.name}, ${getLeagueTier(currentState.leagueTierId).label} 새 시즌 시작`;
  // 장기 집권형: 같은 구단 잔류 시즌마다 적응도 시작값 +3
  if (currentState.manager.trait === 'longTermReign') {
    currentState.chemistry = Math.min(100, currentState.chemistry + 3);
    banner += ' (장기 집권형: 적응도 +3)';
  }
  // 1부는 리그와 별개로 챔피언스리그가 병행된다 - 시즌 목표에 그 사실을 못 박아둔다.
  if (currentState.leagueTierId === 'tier1') {
    banner += '. 이번 시즌 목표: 리그 우승 + 챔피언스리그';
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
  const coachReduced = isStaffFreshThisWeek('headCoach')
    ? CHEMISTRY_DECAY_PER_TRANSACTION
    : COACH_CHEMISTRY_DECAY_BY_LEVEL[coachLevel] ?? CHEMISTRY_DECAY_PER_TRANSACTION;
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
  currentState.justBoughtIds = [...(currentState.justBoughtIds ?? []), card.id];
  currentState.chemistry = applyTransactionDecay(currentState.chemistry, 1, transactionDecayAmount());
  currentState.transactedThisWeek = true;
  currentState.shopOffer = currentState.shopOffer.filter((c) => c.id !== card.id);
  // GOD 카드는 전 세계 2명뿐 — 영입하면 이번 런에서 다시 등장하지 않게 뺀다
  if (card.id.startsWith('god-')) {
    currentState.availableGodPlayers = currentState.availableGodPlayers.filter((g) => g.id !== card.id);
  }
  renderMarket();
}

// 감독 교체: 선수 영입과 동일하게 아무 때나, 영입가 그대로(위약금 없음).
// 새 감독 영입가 + 지금 감독 위약금(현 감독 영입가의 50%, 계약 해지금).
function managerHireCost(candidate) {
  const severance = Math.round((currentState.manager?.price ?? 0) * 0.5);
  return { price: candidate.price, severance, total: candidate.price + severance };
}

function hireManager(candidate, rowEl = null) {
  const { total, severance } = managerHireCost(candidate);
  if (currentState.funds < total) return;
  // 선수 카드처럼 옆으로 빠져나가는 걸 보여준 뒤 실제로 데려온다.
  if (rowEl && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    rowEl.classList.add('is-leaving');
    setTimeout(() => hireManager(candidate), 160);
    rowEl.style.pointerEvents = 'none';
    return;
  }
  currentState.funds -= total;
  currentState.manager = candidate;
  // 선수 카드처럼 - 데려온 후보는 그 자리에 다시 안 뜬다.
  currentState.managerOffer = currentState.managerOffer.filter((m) => m.id !== candidate.id);
  renderMarket(`${candidate.name} 감독 영입 완료(${candidate.price}G + 위약금 ${severance}G)`);
}

// 스태프 교체: 위약금 없이 즉시, 다만 이번 주는 효과 미발동(hiredWeek로 표시).
function hireStaff(role, level, rowEl = null) {
  const [min, max] = STAFF_PRICE_TABLE[level];
  const cost = Math.round((min + max) / 2);
  if (currentState.funds < cost) return;
  if (rowEl && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    rowEl.classList.add('is-leaving');
    setTimeout(() => hireStaff(role, level), 160);
    rowEl.style.pointerEvents = 'none';
    return;
  }
  const candidate = currentState.staffOffer[`${role}:${level}`];
  currentState.funds -= cost;
  currentState.staff = { ...currentState.staff, [role]: { ...candidate, hiredWeek: currentState.week } };
  // 등급 칸은 고정이라 후보 자체를 뺄 수 없다 - 방금 데려온 사람 대신 그 칸에
  // 새 후보를 뽑아, 이미 영입한 사람이 매물로 다시 뜨지 않게 한다.
  currentState.staffOffer = { ...currentState.staffOffer, [`${role}:${level}`]: generateStaffCandidate(role, level) };
  renderMarket(`${esc(candidate.name)}(${STAFF_ROLE_LABELS[role]}) 영입 완료(${cost}G, 이번 주는 효과 미발동)`);
}

function rerollShop() {
  const cost = rerollCost();
  if (currentState.funds < cost) return;
  currentState.funds -= cost;
  currentState.shopOffer = generateShopOffer(scoutOfferSize(), currentState.availableGodPlayers, Math.random, currentState.leagueTierId);
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
  currentState.justBoughtIds = []; // NEW 표시는 산 주에만 - 다음 주로 넘어가면 지운다
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
  currentState.shopOffer = generateShopOffer(scoutOfferSize(), currentState.availableGodPlayers, Math.random, currentState.leagueTierId);
  currentState.managerOffer = generateManagerOffer(3);
  currentState.staffOffer = generateStaffOffer();
  renderMarket(saleMessage);
}

function boostedTagIdFor(manager) {
  return manager.trait === 'tacticalPurist' ? manager.tacticalTag : null;
}

// 플레이스타일 태그 진행도(고정 3명/5명 문턱, 전술 원리주의자면 1명 감면).
// 상점 카드와 전술 탭 팀 케미 패널이 똑같은 계산을 쓴다.
function playstyleTagProgress(tagId, lineup, boostedTagId) {
  const count = lineup.filter((p) => p.playstyleTags.includes(tagId)).length;
  const boost = tagId === boostedTagId ? 1 : 0;
  const req3 = 3 - boost;
  const req5 = 5 - boost;
  const tier = count >= req5 ? 2 : count >= req3 ? 1 : 0;
  const need = tier === 0 ? req3 : req5;
  return { count, need, tier };
}

function runFirstHalf(saleMessage = '') {
  const { manager } = currentState;

  // 여름 이적시장이 끝나는 시점 = 재계약 데드라인. 안 정한 선수는 무료로 나간다.
  const expired = currentState.squad.filter((p) => (p.contractYearsLeft ?? 2) <= 0);
  if (expired.length) {
    currentState.squad = currentState.squad.filter((p) => (p.contractYearsLeft ?? 2) > 0);
    const returningGods = expired.filter((p) => p.id.startsWith('god-'));
    if (returningGods.length) {
      currentState.availableGodPlayers = [
        ...currentState.availableGodPlayers,
        ...GOD_PLAYERS.filter((g) => returningGods.some((p) => p.id === g.id)),
      ];
    }
    const names = expired.map((p) => p.name).join(', ');
    saleMessage = saleMessage ? `${saleMessage} / 계약 만료로 이탈: ${names}` : `계약 만료로 이탈: ${names}`;
  }

  const { lineup, slotted, bench } = pickBestXI(currentState.squad, currentFormation(), currentState.manualOverrides);
  currentState.firstHalfPoints = runHalfSeason(
    lineup,
    bench,
    manager.tier,
    currentState.chemistry,
    currentState.leagueTierId,
    Math.random,
    boostedTagIdFor(manager)
  );

  const tierLabel = getLeagueTier(currentState.leagueTierId).label;
  renderSimulating(currentState.club.name, tierLabel, '전반기', currentState.club.kit, currentState.firstHalfPoints, () => {
    renderHalfTimeVerdict(saleMessage, lineup, slotted, bench);
  });
}

// 여름시장 다음에 바로 겨울시장 화면이 뜨면 시즌을 건너뛴 것처럼 보인다.
// 시즌 결산 화면처럼 전반기에도 확인 화면을 하나 끼워 넣는다.
function renderHalfTimeVerdict(saleMessage, lineup, slotted, bench) {
  const { manager } = currentState;
  const tier = effectiveTier(currentState.leagueTierId);
  const points = currentState.firstHalfPoints;
  const pace = judgeSeasonResult(points * 2, currentState.leagueTierId, currentState.expectationModifier ?? 0);
  const scale = Math.max(tier.championPoints / 2 * 1.1, points);
  const at = (v) => `${Math.min(100, (v / scale) * 100)}%`;

  setScreen(`
    <div class="verdict verdict--${pace}">
      <div class="verdict__label">${esc(currentState.club.name)} · ${tier.label} 전반기 결산</div>
      <div class="verdict__result">${RESULT_LABELS[pace]} 페이스</div>
      <div class="scoreline"><b>${points.toFixed(0)}</b><span>승점 (전반기)</span></div>
      <div class="pointbar">
        <div class="pointbar__fill" style="width:${at(points)}"></div>
        <div class="pointbar__mark" style="left:${at(tier.safePoints / 2)}"></div>
        <div class="pointbar__mark" style="left:${at(tier.targetPoints / 2)}"></div>
        <div class="pointbar__mark" style="left:${at(tier.championPoints / 2)}"></div>
      </div>
      <div class="pointbar__legend">
        <span style="left:${at(tier.safePoints / 2)}">잔류 ${(tier.safePoints / 2).toFixed(0)}</span>
        <span style="left:${at(tier.targetPoints / 2)}">승격 ${(tier.targetPoints / 2).toFixed(0)}</span>
        <span style="left:${at(tier.championPoints / 2)}">우승 ${(tier.championPoints / 2).toFixed(0)}</span>
      </div>
    </div>
    ${saleMessage ? `<div class="banner">${esc(saleMessage)}</div>` : ''}
    <p class="note">겨울 이적시장에서 스쿼드를 보강하세요(윈터 택스 +${WINTER_TAX_RATIO * 100}%).</p>
    <div class="panel">
      <div class="panel__head"><h2>전반기 라인업</h2><span class="panel__count">${currentFormation()}</span></div>
      ${renderPitch(slotted, currentFormation(), currentState.club.kit)}
    </div>
  `, `<button class="cta" id="to-winter-btn">겨울 이적시장으로</button>`);

  document.getElementById('to-winter-btn').addEventListener('click', () => enterWinterMarket());
}

function enterWinterMarket() {
  const { manager } = currentState;
  currentState.phase = 'winter';
  currentState.week = WINTER_MARKET_WEEKS[0];
  currentState.shopOffer = generateShopOffer(scoutOfferSize(), currentState.availableGodPlayers, Math.random, currentState.leagueTierId);
  currentState.managerOffer = generateManagerOffer(3);
  currentState.staffOffer = generateStaffOffer();

  let banner = `겨울 이적시장이 시작됩니다(윈터 택스 +${WINTER_TAX_RATIO * 100}%).`;

  // 소방수: 안전선은 넘었지만 목표선(승격)에는 못 미치는 페이스면 겨울 진입 시 적응도 +30
  const tier = effectiveTier(currentState.leagueTierId);
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
  const { lineup, slotted, bench } = pickBestXI(currentState.squad, currentFormation(), currentState.manualOverrides);
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
  let result = judgeSeasonResult(totalPoints, currentState.leagueTierId, currentState.expectationModifier ?? 0);
  const tier = effectiveTier(currentState.leagueTierId);

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

  // 챔피언스리그: 1부에서만, 리그 승격/강등과 별개로 매 시즌 병행해서 돈다.
  let uclResultId = null;
  if (currentState.leagueTierId === 'tier1') {
    const teamPower = computeTeamPower(lineup, bench, manager.tier, currentState.chemistry);
    uclResultId = simulateChampionsLeague(teamPower);
    currentState.funds += UCL_REWARDS_FUNDS[uclResultId];
    if (uclResultId === 'champion') currentState.uclTitles += 1;
  }

  const outcome = judgeRunOutcome({
    seasonResult: result,
    leagueTierId: currentState.leagueTierId,
    missedTargetCount: currentState.missedTargetCount,
  });
  const canPromote = outcome.canPromote;

  renderSimulating(currentState.club.name, tier.label, '후반기', currentState.club.kit, totalPoints, () => {
    finishSeasonRender();
  });

  function finishSeasonRender() {
  if (outcome.ended) {
    // 같은 클릭에서 보드진의 신임이 발동하고도 목표 미달로 경질될 수 있다.
    // 그 경우에도 성향이 발동했다는 사실은 알려야 한다.
    renderRunEnd(outcome.reason, totalPoints, boardTrustMessage, uclResultId);
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
    ${uclResultId ? `<div class="banner banner--ucl">챔피언스리그 ${UCL_RESULT_LABELS[uclResultId]}. 상금 +${UCL_REWARDS_FUNDS[uclResultId]}G${uclResultId === 'champion' ? ' · 명성 대폭 상승' : ''}</div>` : ''}
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
}

// 스펙 2절 거취 선택. 오퍼는 항상 3개.
// 현재 구단은 후보에서 뺀다(이적인데 같은 곳이면 의미가 없다).
function renderDestinationChoice(seasonResult, nextTierId) {
  // 이 화면은 promote-btn에서 getNextTier로만 들어오므로 nextTierId는 항상 승격 리그다.
  // 오퍼는 실제로 그 리그에 있는(승격해서 만나게 될) 20개 구단 풀에서 뽑는다 -
  // 예전에는 시작 구단을 그대로 재활용해서 1부에 가도 5부 시절 이름이 나왔다.
  const offers = buildTierClubOffers(nextTierId, 3);
  const nextLabel = getLeagueTier(nextTierId).label;
  const kicker = seasonResult === 'champion' ? '우승 소식에 러브콜이 쇄도합니다' : '활약을 지켜본 구단들의 제안';

  setScreen(`
    <div class="choice">
      <div class="choice__kicker">${kicker}</div>
      <h1 class="choice__title">누구의 제안을<br>받아들일까요</h1>
      <p class="choice__body">
        지금 구단에 남으면 <b>선수단을 그대로</b> 들고 ${nextLabel}로 승격합니다.
        다른 구단의 제안을 받으면 <b>선수단이 전부 초기화</b>되고, 새 선수단은 그 구단의
        체급으로 다시 생성됩니다. 지금까지 키운 전력보다 약할 수 있습니다.
      </p>
      <div class="options">
        <button class="option option--accept option--crest" data-stay="1">
          ${renderCrest(currentState.club, { size: 32 })}
          <div>
            <div class="option__name">${esc(currentState.club.name)}에 남는다</div>
            <div class="option__effect">${nextLabel}로 승격. 선수단 <b>유지</b></div>
          </div>
        </button>
        ${offers.map((c) => `
          <button class="option option--crest" data-move="${c.id}">
            ${renderCrest(c, { size: 32 })}
            <div>
              <div class="option__name">${esc(c.name)}</div>
              <div class="option__effect"><span class="option__tier">${nextLabel}</span> ${esc(c.strength)}. 선수단 <b>초기화</b>, 시작 자금 x${c.startingFundsMultiplier}</div>
            </div>
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
      currentState.expectationModifier = 0; // 새 구단은 이사진 성향 정보가 없다 - 중립으로 리셋
      currentState.leagueTierId = nextTierId;
      if (getLadderIndex(nextTierId) > getLadderIndex(currentState.highestTierId)) {
        currentState.highestTierId = nextTierId;
      }
      // 선수단 초기화. 목적지 리그 체급으로 생성한다(5부 분포로 고정하면 3부
      // 이상에서 강등이 거의 확정이었다). 적응도도 새 팀이므로 기본값으로 돌린다.
      currentState.squad = staggerContracts(generateSquadPool(MOVE_SQUAD_WEIGHTS_BY_TIER[nextTierId]).map(toSquadPlayer));
      currentState.manualOverrides = {}; // 스쿼드가 통째로 바뀌니 예전 수동 배치는 의미가 없다
      // 스쿼드에서 사라진 GOD 카드는 다시 상점에 나올 수 있게 되돌린다.
      // 안 그러면 이미 영입한 GOD이 선수단에서도 사라지고 이번 런에서 영영 못 본다.
      currentState.availableGodPlayers = GOD_PLAYERS.filter(
        (g) => !currentState.squad.some((p) => p.id === g.id)
      );
      currentState.chemistry = CHEMISTRY_START;
      currentState.freshBudget = true; // 새 구단은 이월 없이 시작 자금만(스펙 2절)
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

function renderRunEnd(reason, finalPoints, boardTrustMessage = '', uclResultId = null) {
  const copy = RUN_END[reason];
  const reputation = computeReputation({
    highestTierId: currentState.highestTierId,
    titles: currentState.titles,
    uclTitles: currentState.uclTitles,
  });
  const highest = getLeagueTier(currentState.highestTierId);

  setScreen(`
    <div class="verdict verdict--${reason === 'victory' ? 'champion' : 'relegation'}">
      <div class="verdict__label">${copy.kicker}</div>
      <div class="verdict__result">${copy.title}</div>
      <div class="scoreline"><b>${reputation}</b><span>명성</span></div>
    </div>
    ${boardTrustMessage}
    ${uclResultId ? `<div class="banner banner--ucl">챔피언스리그 ${UCL_RESULT_LABELS[uclResultId]}</div>` : ''}
    <div class="panel">
      <p class="note">${copy.body}</p>
      <ul class="summary">
        <li><span>버틴 시즌</span><b>${currentState.seasonNumber}</b></li>
        <li><span>도달 리그</span><b>${highest.label}</b></li>
        <li><span>우승</span><b>${currentState.titles}</b></li>
        <li><span>챔피언스리그 우승</span><b>${currentState.uclTitles}</b></li>
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
    // 지급 후에 더해야 이월 상한에 깎이지 않는다(grantSeasonFunds 주석 참고).
    currentState.pendingTransferProceeds = acceptProceeds;
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
// interactive면 각 칸이 클릭 가능한 data-slot을 달고 나온다(전술 탭 전용 -
// 결산 화면 등 읽기 전용 피치에는 안 준다).
// finalOVR: playerId -> 케미 보너스가 붙은 최종 OVR (전술 탭에서만 넘어온다).
function renderPitch(slotted, formationId, kit, { interactive = false, selectedSlot = null, finalOVR = null } = {}) {
  const { slots, coords } = FORMATIONS[formationId];
  const chips = slots.map((pos, i) => {
    const p = slotted[i];
    const [x, y] = coords[i];
    const style = `left:${x}%;top:${y}%`;
    const slotAttr = interactive ? `data-slot="${i}"` : '';
    const selected = interactive && selectedSlot === i ? ' is-selected' : '';
    if (!p) {
      return `<div class="slot slot--empty${selected}" style="${style}" ${slotAttr}>
        <div class="slot__card"><span class="slot__ovr n">--</span><span class="slot__pos">${pos}</span></div>
      </div>`;
    }
    const shown = finalOVR ? Math.round(finalOVR.get(p.id) ?? p.baseOVR) : p.baseOVR;
    const boost = shown - p.baseOVR;
    const boostClass = boost >= 3 ? ' is-boosted-strong' : boost >= 1 ? ' is-boosted' : '';
    // 이름은 두 줄째에 작게 - 5~6자 넘어가면 말줄임. 케미로 몇 명이 붙었는지는
    // 이름 없이는 "누가"가 안 보여서 아래 팀 케미 패널과 짝을 맞추려면 필요했다.
    return `<div class="slot${p.offPosition ? ' slot--offpos' : ''}${selected}${boostClass}" style="${style};--tier:var(--t-${tierOf(p.baseOVR)})"
      ${slotAttr} title="${esc(p.name)} · ${p.position} · OVR ${shown}${boost ? ` (+${boost})` : ''}">
      <div class="slot__card">
        <span class="slot__ovr n">${shown}</span>
        ${renderPortrait(p, { size: 34, kit })}
        <span class="slot__pos">${pos}</span>
        <span class="slot__name">${esc(p.name)}</span>
      </div>
    </div>`;
  }).join('');

  const off = slotted.filter((p) => p && p.offPosition).length;
  const note = off
    ? `<p class="note"><b>금색 점선</b> ${off}명은 주 포지션이 아닌 자리에 섰습니다.</p>`
    : '';
  return `<div class="pitch${interactive ? ' pitch--interactive' : ''}">${chips}</div>${note}`;
}

// 전술 탭에서 칸을 선택했을 때 그 자리에 넣을 선수를 고르는 목록.
// 포지션이 맞는 선수를 위로 올리고, 이미 선발인 선수도 옮길 수 있게 그대로 둔다
// (다른 자리로 옮기면 원래 자리는 자동 배치로 돌아간다).
function renderSlotPicker(squad, formationId, selectedSlot, inXI) {
  if (selectedSlot === null || selectedSlot === undefined) return '';
  const pos = FORMATIONS[formationId].slots[selectedSlot];
  const rows = [...squad]
    .sort((a, b) => {
      const matchDiff = (b.position === pos ? 1 : 0) - (a.position === pos ? 1 : 0);
      return matchDiff || b.baseOVR - a.baseOVR;
    })
    .map((p) => `
      <li class="pickrow${p.position === pos ? ' is-match' : ''}" data-pick-slot="${selectedSlot}" data-pick-player="${p.id}">
        ${renderPortrait(p, { size: 30 })}
        <span class="pickrow__name">${esc(p.name)}</span>
        <span class="pickrow__pos">${p.position}</span>
        ${inXI.has(p.id) ? '<span class="tag">선발중</span>' : ''}
        ${playerTagsHtml(p)}
        <b class="pickrow__ovr n">${p.baseOVR}</b>
      </li>`)
    .join('');
  return `<div class="panel picker">
    <div class="panel__head"><h2>${pos} 자리에 넣을 선수</h2></div>
    <ul class="pickrows">${rows}</ul>
  </div>`;
}

// 피파4 팀컬러처럼: 플레이스타일/대륙 태그가 베스트11에 몇 명 있는지 보여주고
// 문턱(기본 3명/5명, 감독·폴리글롯이 있으면 감면)을 넘었는지 색으로 알려준다.
// tagDef.tier3/tier5는 인원수가 아니라 그 인원 채웠을 때 실제로 붙는 OVR
// 보너스 값이다(engine/ovr.mjs) - 배지 설명에 필요 인원과 보너스를 분리해서 쓴다.
function renderChemistryPanel(lineup, bench) {
  const { manager } = currentState;
  const boostedTagId = boostedTagIdFor(manager);

  const playstyleRows = Object.entries(PLAYSTYLE_TAGS)
    .map(([tagId, def]) => {
      const { count, need, tier } = playstyleTagProgress(tagId, lineup, boostedTagId);
      const boost = tagId === boostedTagId ? 1 : 0;
      const req3 = 3 - boost;
      const req5 = 5 - boost;
      const bonus = tier === 2 ? def.tier5 : def.tier3;
      const caption = `${count}/${need} · +${bonus}`;
      const desc = `해당 포지션 선수 기준 · ${req3}명 이상 OVR +${def.tier3}, ${req5}명 이상 OVR +${def.tier5}`
        + (boost ? ' (전술 원리주의자로 요구 인원 1명 감면)' : '');
      return { icon: renderTagIcon(PLAYSTYLE_ICON_PATHS, tagId), label: TAG_LABELS[tagId] ?? tagId, desc, caption, tier };
    })
    .sort((a, b) => b.tier - a.tier);

  const continentRows = Object.entries(CONTINENT_TAGS)
    .map(([tagId, def]) => {
      const count = lineup.filter((p) => p.continentTag === tagId).length;
      const req3 = countEffectiveContinentRequirement(3, lineup, tagId);
      const req5 = countEffectiveContinentRequirement(5, lineup, tagId);
      const tier = count >= req5 ? 2 : count >= req3 ? 1 : 0;
      const need = tier === 0 ? req3 : req5;
      const bonus = tier === 2 ? def.tier5 : def.tier3;
      const caption = `${count}/${need} · +${bonus}`;
      const desc = `포지션 무관 전원 · ${req3}명 이상 OVR +${def.tier3}, ${req5}명 이상 OVR +${def.tier5}`
        + (req3 < 3 ? ' (폴리글롯으로 요구 인원 감면)' : '');
      return { icon: renderTagIcon(CONTINENT_ICON_PATHS, tagId), label: CONTINENT_LABELS[tagId] ?? tagId, desc, caption, tier };
    })
    .sort((a, b) => b.tier - a.tier);

  const badge = (r) => `<li class="chembadge${r.tier ? ` is-tier${r.tier}` : ''}" title="${esc(r.label)} · ${esc(r.desc)}">
    <div class="chembadge__ring">${r.icon}</div>
    <span class="chembadge__label">${esc(r.label)}</span>
    <span class="chembadge__count">${r.caption}</span>
  </li>`;

  // 특수 태그는 지금 뛰는 선발+벤치(16명)만 본다 - 그 밖의 선수는 이번 주
  // 효과가 발동하지 않는 죽은 정보라 노이즈만 된다. 종류별로 묶어서 배지 하나 +
  // 인원수로 보여준다(선수 한 명씩 카드로 나열하던 예전 판보다 훨씬 짧다).
  const xiAndBench = [...lineup, ...bench];
  const traitRows = Object.keys(TRAIT_LABELS)
    .map((traitId) => ({
      traitId,
      holders: xiAndBench.filter((p) => p.specialTrait === traitId),
    }))
    .filter((r) => r.holders.length > 0);

  const traitSection = traitRows.length ? `
    <h3 class="chemgroup__title">선수 특수 태그</h3>
    <ul class="chembadges">
      ${traitRows.map((r) => `
        <li class="chembadge is-tier1" title="${esc(r.holders.map((p) => p.name).join(', '))} · ${esc(TRAIT_EFFECT_DESCRIPTIONS[r.traitId] ?? '')}">
          <div class="chembadge__ring">${renderTagIcon(TRAIT_ICON_PATHS, r.traitId)}</div>
          <span class="chembadge__label">${esc(TRAIT_LABELS[r.traitId])}</span>
          <span class="chembadge__count">${r.holders.length}명</span>
        </li>`).join('')}
    </ul>` : '';

  return `<div class="panel">
    <div class="panel__head"><h2>팀 케미</h2></div>
    <h3 class="chemgroup__title">플레이스타일</h3>
    <ul class="chembadges">${playstyleRows.map(badge).join('')}</ul>
    <h3 class="chemgroup__title">대륙</h3>
    <ul class="chembadges">${continentRows.map(badge).join('')}</ul>
    ${traitSection}
  </div>`;
}

const TABS = [
  { id: 'draft', label: '영입' },
  { id: 'tactics', label: '전술' },
  { id: 'squad', label: '선수단' },
  { id: 'staff', label: '감독·스태프' },
];

// 방출 버튼을 누르면 바로 실행하지 않고 그 자리에서 질문으로 바뀐다.
// 네이티브 confirm()은 일부 웹뷰/미리보기 환경에서 자동으로 취소돼 버려서
// 못 믿는다 - 화면 안에서 직접 확인을 받는다.
function confirmRelease(playerId, question, onConfirm, banner) {
  // .player의 grid 레이아웃 안에서(액션 칸만) 물으면 문장 길이 때문에 옆
  // 칸(이름)이 찌그러진다 - 그 행 전체를 확인 바로 바꿔친다.
  const row = document.querySelector(`[data-row="${playerId}"]`);
  if (!row) return;
  row.classList.add('player--confirm');
  row.innerHTML = `
    <span class="confirm__q">${esc(question)}</span>
    <button class="confirm__yes" data-confirm-yes>확인</button>
    <button class="confirm__no" data-confirm-no>취소</button>
  `;
  row.querySelector('[data-confirm-yes]').onclick = onConfirm;
  row.querySelector('[data-confirm-no]').onclick = () => renderMarket(banner);
}

function renderMarket(banner = '') {
  const { club, manager, staff, squad, funds, chemistry, eventMessage, eventTone, shopOffer, phase, week, listedForSale } = currentState;
  const maxWeek = phase === 'summer' ? SUMMER_MARKET_WEEKS[1] : WINTER_MARKET_WEEKS[1];
  const phaseLabel = phase === 'summer' ? '여름 이적시장' : '겨울 이적시장';
  const isDeadlineWeek = phase === 'winter' && week === WINTER_MARKET_WEEKS[1];
  const formationId = currentFormation();
  const tab = TABS.some((t) => t.id === currentState.tab) ? currentState.tab : 'draft';
  const manualOverrides = currentState.manualOverrides ?? {};
  const { lineup, slotted, bench } = pickBestXI(squad, formationId, manualOverrides);
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
    // 정답(팀 +X.X 델타)은 안 주고 재료만 준다 - 태그 옆에 지금 라인업이
    // 몇 명째인지만 보여주고, "그래서 사야 하는지"는 유저가 판단한다.
    const boostedTagId = boostedTagIdFor(manager);
    const tags = [
      ...c.playstyleTags.map((t) => {
        const { count, need } = playstyleTagProgress(t, lineup, boostedTagId);
        return `<span class="tag">${TAG_LABELS[t] ?? t} <b class="tag__progress">${count}/${need}</b></span>`;
      }),
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

  const starPlayer = [...squad].sort((a, b) => b.baseOVR - a.baseOVR)[0] ?? null;
  const expiredPlayers = squad.filter((p) => (p.contractYearsLeft ?? 2) <= 0);

  const squadHtml = [...squad]
    .sort((a, b) => b.baseOVR - a.baseOVR)
    .map((p) => {
      const winterBlocked = phase === 'winter' && p.acquiredThisSeason;
      const yearsLeft = p.contractYearsLeft ?? 2;
      const contractLabel = yearsLeft <= 0
        ? '<span class="tag tag--expired">계약 만료</span>'
        : `계약 ${yearsLeft}년`;
      return `<li class="player${inXI.has(p.id) ? ' is-xi' : ''}" data-row="${p.id}" style="--tier:var(--t-${tierOf(p.baseOVR)})">
        ${renderPortrait(p, { size: 36, kit: club.kit })}
        <b class="player__ovr n">${p.baseOVR}</b>
        <div>
          <div class="player__name">${esc(p.name)}${currentState.justBoughtIds?.includes(p.id) ? '<span class="tag tag--new">NEW</span>' : ''}</div>
          <div class="player__meta">${p.position} · ${p.age}세 · <b>${p.price}G</b>${inXI.has(p.id) ? ' · 주전' : ''} · ${contractLabel}</div>
          ${playerTagsHtml(p)}
        </div>
        <div class="player__actions" data-actions="${p.id}">
          <button class="release" data-release-immediate="${p.id}" title="회수 0%, ${decayLabel}">즉시 방출</button>
          <button class="release" data-release-listed="${p.id}" ${winterBlocked ? 'disabled title="당해 영입 선수는 겨울 이적명단에 올릴 수 없습니다"' : 'title="1주 뒤 정산"'}>판매 등록</button>
          ${isDeadlineWeek ? `<button class="release release--deadline" data-release-deadline="${p.id}" title="원가의 40% 회수">데드라인 방출</button>` : ''}
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
      </section>
      <section class="panel tabpanel">
        <div class="panel__head"><h2>감독 시장</h2><span class="panel__count">이번 주 후보</span></div>
        <ul class="mgroffers">
          ${currentState.managerOffer.map((m) => {
            const { total, severance } = managerHireCost(m);
            const canHire = funds >= total;
            return `<li class="mgroffer" data-row="mgr-${m.id}" style="--tier:var(--${MANAGER_TIER_COLOR[m.tier] ?? 't-local'})">
              <div class="mgroffer__main">
                ${renderPortrait(m, { size: 40 })}
                <div>
                  <div class="player__name">${esc(m.name)}</div>
                  <div class="player__meta">${MANAGER_TIER_LABELS[m.tier] ?? m.tier} · ${TAG_LABELS[m.tacticalTag] ?? m.tacticalTag}${m.trait ? ` · ${MANAGER_TRAIT_LABELS[m.trait] ?? m.trait}` : ''}</div>
                </div>
              </div>
              <button class="hire" data-hire-manager="${m.id}" ${canHire ? '' : 'disabled'}>
                <span>영입</span>
                <span class="hire__cost">${total}G${severance ? ` <i>(${m.price}+위약금${severance})</i>` : ''}</span>
              </button>
            </li>`;
          }).join('')}
        </ul>
        <p class="note">아무 때나 교체할 수 있지만, 지금 감독을 내보내는 위약금(현 감독 영입가의 50%)이 새 감독 영입가에 더해집니다.</p>
      </section>
      <section class="panel tabpanel">
        <div class="panel__head"><h2>스태프 시장</h2></div>
        ${['headCoach', 'headScout'].map((role) => `
          <h3 class="staffgroup__title">${STAFF_ROLE_LABELS[role]}</h3>
          <ul class="mgroffers">
            ${STAFF_LEVELS.map((level) => {
              const [min, max] = STAFF_PRICE_TABLE[level];
              const cost = Math.round((min + max) / 2);
              const isCurrent = currentState.staff[role].level === level;
              const candidate = currentState.staffOffer[`${role}:${level}`];
              return `<li class="mgroffer${isCurrent ? ' is-current' : ''}" data-row="staff-${role}-${level}" style="--tier:var(--${STAFF_LEVEL_COLOR[level] ?? 't-local'})">
                <div class="mgroffer__main">
                  ${renderPortrait(candidate, { size: 40 })}
                  <div>
                    <div class="player__name">${esc(candidate.name)}${isCurrent ? '<span class="tag tag--new">현재</span>' : ''}</div>
                    <div class="player__meta">${STAFF_LEVEL_LABELS[level]}</div>
                  </div>
                </div>
                <button class="hire" data-hire-staff="${role}:${level}" ${isCurrent || funds < cost ? 'disabled' : ''}>
                  <span>영입</span>
                  <span class="hire__cost">${cost}G</span>
                </button>
              </li>`;
            }).join('')}
          </ul>`).join('')}
        <p class="note">스태프 영입은 위약금 없이 즉시 적용되지만, 영입한 주에는 새 효과가 아직 발동하지 않습니다.</p>
      </section>`,
    tactics: `
      <section class="panel tabpanel">
        <div class="panel__head">
          <h2>포메이션</h2>
          <div class="formations">
            ${Object.keys(FORMATIONS).map((id) => `<button data-formation="${id}" aria-pressed="${id === formationId}">${id}</button>`).join('')}
          </div>
          <button class="reroll" id="reset-lineup-btn" ${Object.keys(manualOverrides).length ? '' : 'disabled'}>오버롤 순 자동 배치</button>
        </div>
        <div class="tactics__manager" style="--tier:var(--${MANAGER_TIER_COLOR[manager.tier] ?? 't-local'})">
          ${renderPortrait(manager, { size: 40 })}
          <div>
            <div class="player__name">${esc(manager.name)} 감독</div>
            <div class="player__meta">${MANAGER_TIER_LABELS[manager.tier] ?? manager.tier}${manager.trait ? ` · ${MANAGER_TRAIT_LABELS[manager.trait] ?? manager.trait}` : ''} · ${TAG_LABELS[manager.tacticalTag] ?? manager.tacticalTag}</div>
          </div>
        </div>
        ${renderPitch(slotted, formationId, club.kit, { interactive: true, selectedSlot: currentState.selectedSlot, finalOVR })}
        <div class="benchstrip">
          <span class="benchstrip__label">벤치</span>
          ${bench.map((p) => `<div class="benchchip" title="${esc(p.name)}">
            ${renderPortrait(p, { size: 28, kit: club.kit })}
            <span class="benchchip__pos">${p.position}</span>
            <b class="benchchip__ovr n">${p.baseOVR}</b>
          </div>`).join('')}
        </div>
        ${renderSlotPicker(squad, formationId, currentState.selectedSlot, inXI)}
        <p class="note">칸을 눌러 넣을 선수를 고르세요. 포메이션을 바꾸면 슬롯 구성이 바뀌어 플레이스타일 시너지 발동 조건이 달라집니다.</p>
      </section>
      ${renderChemistryPanel(lineup, bench)}`,
    squad: `
      <section class="panel tabpanel">
        <div class="panel__head"><h2>스타 선수</h2></div>
        ${!starPlayer ? '<p class="note">선수단이 비어 있습니다.</p>'
          : `<div class="starplayer">
              ${renderPortrait(starPlayer, { size: 48, kit: club.kit })}
              <div>
                <div class="player__name">${esc(starPlayer.name)}</div>
                <div class="player__meta">${starPlayer.position} · ${starPlayer.age}세${starPlayer.specialTrait ? ` · ${TRAIT_LABELS[starPlayer.specialTrait] ?? starPlayer.specialTrait}` : ''}</div>
                ${playerTagsHtml(starPlayer)}
              </div>
              <b class="player__ovr n">${starPlayer.baseOVR}</b>
            </div>`}
      </section>
      ${expiredPlayers.length ? `
      <section class="panel tabpanel panel--warn">
        <div class="panel__head"><h2>계약 만료</h2><span class="panel__count">여름 안에 정하세요</span></div>
        <ul class="squad">${expiredPlayers.map((p) => `
          <li class="player" style="--tier:var(--t-${tierOf(p.baseOVR)})">
            ${renderPortrait(p, { size: 36, kit: club.kit })}
            <b class="player__ovr n">${p.baseOVR}</b>
            <div>
              <div class="player__name">${esc(p.name)}</div>
              <div class="player__meta">${p.position} · 안 정하면 여름 끝에 무료로 나갑니다</div>
            </div>
            <div class="player__actions">
              <button class="renew" data-renew="${p.id}" data-years="1" ${funds >= renewalCost(p.price, 1) ? '' : 'disabled'}>1년<b>${renewalCost(p.price, 1)}G</b></button>
              <button class="renew" data-renew="${p.id}" data-years="2" ${funds >= renewalCost(p.price, 2) ? '' : 'disabled'}>2년<b>${renewalCost(p.price, 2)}G</b></button>
            </div>
          </li>`).join('')}</ul>
      </section>` : ''}
      <section class="panel tabpanel">
        ${listedHtml ? `<div class="panel__head"><h2>이적 명단</h2></div><ul class="listed">${listedHtml}</ul><div style="height:var(--s4)"></div>` : ''}
        <div class="panel__head"><h2>보유 선수</h2></div>
        <ul class="squad">${squadHtml}</ul>
      </section>`,
    staff: `
      <section class="panel tabpanel">
        <div class="panel__head"><h2>감독</h2></div>
        <div class="starplayer" style="--tier:var(--${MANAGER_TIER_COLOR[manager.tier] ?? 't-local'})">
          ${renderPortrait(manager, { size: 48 })}
          <div>
            <div class="player__name">${esc(manager.name)}</div>
            <div class="player__meta">${MANAGER_TIER_LABELS[manager.tier] ?? manager.tier} · ${TAG_LABELS[manager.tacticalTag] ?? manager.tacticalTag} · ${CONTINENT_LABELS[manager.continentTag] ?? manager.continentTag}</div>
            ${manager.trait ? `<div class="note">${MANAGER_TRAIT_LABELS[manager.trait]}: ${MANAGER_TRAIT_DESCRIPTIONS[manager.trait] ?? ''}</div>` : '<div class="note">세부 성향 없음</div>'}
          </div>
        </div>
      </section>
      <section class="panel tabpanel">
        <div class="panel__head"><h2>스태프</h2></div>
        <ul class="squad">
          ${['headCoach', 'headScout'].map((role) => `
            <li class="player" style="--tier:var(--${STAFF_LEVEL_COLOR[staff[role].level] ?? 't-local'})">
              ${renderPortrait(staff[role], { size: 36 })}
              <div style="grid-column:2 / -1">
                <div class="player__name">${esc(staff[role].name ?? '무명')}</div>
                <div class="player__meta">${STAFF_ROLE_LABELS[role]} · ${STAFF_LEVEL_LABELS[staff[role].level] ?? staff[role].level}</div>
                <div class="note">${STAFF_ROLE_DESCRIPTIONS[role]}</div>
              </div>
            </li>`).join('')}
        </ul>
        <p class="note">감독·스태프 영입은 "영입" 탭에서 할 수 있습니다.</p>
      </section>`,
  };

  const showEvent = phase === 'summer' && week === SUMMER_MARKET_WEEKS[0] && eventTone;

  setScreen(`
    <header class="topbar">
      <div class="topbar__id">
        ${renderCrest(club, { size: 36 })}
        <div class="topbar__idText">
          <span class="topbar__club">${esc(club.name)}</span>
          <span class="topbar__phase">${phaseLabel}</span>
        </div>
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

    ${(() => {
      // 포지션 그룹끼리 상대 비교해서 약한 줄/강한 줄에 색을 준다. 팀 전력(다른
      // 스케일의 합성 지표)과 비교하면 왜곡되니 그룹 평균끼리만 비교한다.
      const groupAvgs = POSITION_GROUPS.map((g) => groupAvg(g.positions)).filter((v) => v !== null);
      const meanGroupAvg = groupAvgs.reduce((a, b) => a + b, 0) / (groupAvgs.length || 1);
      const pwClass = (avg) => {
        if (avg === null) return '';
        if (avg - meanGroupAvg >= 1.3) return ' is-strong';
        if (avg - meanGroupAvg <= -1.3) return ' is-weak';
        return '';
      };
      return `<div class="powerstrip">
        ${POSITION_GROUPS.map((g) => {
          const avg = groupAvg(g.positions);
          return `<div class="pw${pwClass(avg)}"><span class="pw__label">${g.label}</span><span class="pw__val n">${avg === null ? '--' : avg.toFixed(0)}</span></div>`;
        }).join('')}
        <div class="pw pw--total"><span class="pw__label">팀 전력</span><span class="pw__val n">${teamPower.toFixed(0)}</span></div>
      </div>`;
    })()}

    ${banner ? `<div class="banner">${esc(banner)}</div>` : ''}

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
    document.querySelectorAll('[data-hire-manager]').forEach((btn) => {
      btn.onclick = () => {
        const candidate = currentState.managerOffer.find((m) => m.id === btn.dataset.hireManager);
        if (candidate) hireManager(candidate, document.querySelector(`[data-row="mgr-${candidate.id}"]`));
      };
    });
    document.querySelectorAll('[data-hire-staff]').forEach((btn) => {
      btn.onclick = () => {
        const [role, level] = btn.dataset.hireStaff.split(':');
        hireStaff(role, level, document.querySelector(`[data-row="staff-${role}-${level}"]`));
      };
    });
  }
  if (tab === 'tactics') {
    for (const id of Object.keys(FORMATIONS)) {
      document.querySelector(`[data-formation="${id}"]`).onclick = () => {
        currentState.formation = id;
        // 슬롯 인덱스가 포메이션마다 다른 의미라 포메이션을 바꾸면 수동 배치는 무효.
        currentState.manualOverrides = {};
        currentState.selectedSlot = null;
        renderMarket(banner);
      };
    }
    document.querySelectorAll('[data-slot]').forEach((el) => {
      el.onclick = () => {
        const idx = Number(el.dataset.slot);
        currentState.selectedSlot = currentState.selectedSlot === idx ? null : idx;
        renderMarket(banner);
      };
    });
    document.querySelectorAll('[data-pick-slot]').forEach((el) => {
      el.onclick = () => {
        const idx = Number(el.dataset.pickSlot);
        const playerId = el.dataset.pickPlayer;
        const next = { ...(currentState.manualOverrides ?? {}) };
        // 이 선수가 이미 다른 칸에 고정돼 있었다면 그 칸은 비운다(자동 배치로 되돌림)
        for (const key of Object.keys(next)) {
          if (next[key] === playerId) delete next[key];
        }
        next[idx] = playerId;
        currentState.manualOverrides = next;
        currentState.selectedSlot = null;
        renderMarket(banner);
      };
    });
    document.getElementById('reset-lineup-btn')?.addEventListener('click', () => {
      currentState.manualOverrides = {};
      currentState.selectedSlot = null;
      renderMarket(banner);
    });
  }
  if (tab === 'squad') {
    for (const p of squad) {
      document.querySelector(`[data-release-immediate="${p.id}"]`).onclick = () => {
        confirmRelease(p.id, `${p.name} 즉시 방출하시겠습니까? (회수 없음)`, () => releaseImmediate(p), banner);
      };
      document.querySelector(`[data-release-listed="${p.id}"]`).onclick = () => {
        confirmRelease(p.id, `${p.name} 이적 명단에 올리시겠습니까?`, () => listForSale(p), banner);
      };
      if (isDeadlineWeek) {
        document.querySelector(`[data-release-deadline="${p.id}"]`).onclick = () => {
          confirmRelease(p.id, `${p.name} 데드라인 방출하시겠습니까? (원가 40% 회수)`, () => releaseDeadline(p), banner);
        };
      }
    }
    document.querySelectorAll('[data-renew]').forEach((btn) => {
      btn.onclick = () => {
        const id = btn.dataset.renew;
        const years = Number(btn.dataset.years);
        const player = currentState.squad.find((p) => p.id === id);
        if (!player) return;
        const cost = renewalCost(player.price, years);
        if (currentState.funds < cost) return;
        currentState.funds -= cost;
        currentState.squad = currentState.squad.map((p) => p.id === id ? { ...p, contractYearsLeft: years } : p);
        renderMarket(`${player.name} 재계약 완료(${years}년, ${cost}G)`);
      };
    });
  }
  document.getElementById('next-week-btn').onclick = nextWeek;

  const eventRoot = document.getElementById('eventmodal-root');
  if (showEvent) {
    const [title, ...rest] = eventMessage.split(': ');
    const detail = rest.join(': ');
    eventRoot.innerHTML = `
      <div class="eventmodal-backdrop">
        <div class="eventmodal eventmodal--${eventTone}">
          <div class="eventmodal__kicker">${eventTone === 'bad' ? '위기 이벤트' : '시즌 이벤트'}</div>
          <div class="eventmodal__title">${esc(title)}</div>
          ${detail ? `<div class="eventmodal__detail">${esc(detail)}</div>` : ''}
          <button class="cta" id="eventmodal-dismiss">확인</button>
        </div>
      </div>`;
    document.getElementById('eventmodal-dismiss').onclick = () => {
      currentState.eventTone = null;
      eventRoot.innerHTML = '';
      saveRun(currentState, localStorage);
    };
  } else {
    eventRoot.innerHTML = '';
  }

  saveRun(currentState, localStorage);
}

renderStoryIntro();
