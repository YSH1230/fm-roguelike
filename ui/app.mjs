// 확인용 미리보기(#uclDemo=win): 저장소를 메모리로 갈아끼워서 저장/기록이 절대 남지 않는다.
const UCL_DEMO = new URLSearchParams(location.hash.slice(1)).get('uclDemo');
if (UCL_DEMO) {
  const mem = new Map();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k), clear: () => mem.clear() },
  });
}
import { buildStartClubOffers, buildLeagueRivals } from '../data/clubs.mjs';
import { saveRun, loadRun, clearRun, withRunDefaults } from '../data/local-save.mjs';
import {
  loadRecords, saveRecords, recordRunStart, recordPromotion, recordSeason, recordUcl, recordRunEnd,
  uclReached, ACHIEVEMENTS, unlockedIds, newlyUnlocked,
} from '../data/records.mjs';
import { generateSquadPool, generateStartingSquad, generateEmergencyYouth } from '../data/generate-player.mjs';
import { generateProceduralManager } from '../data/generate-manager.mjs';
import { assignRandomStaff, generateStaffOffer, generateStaffCandidate } from '../data/staff.mjs';
import { generateManagerOffer } from '../data/manager-shop.mjs';
import { GOD_PLAYERS } from '../data/god-players.mjs';
import { rollSeasonEvent, describeChoice, resolveChoice } from '../data/season-events.mjs';
import { drawDemandOffer, getDemand, evaluateDemand, DIFFICULTY_LABELS } from '../data/board-demands.mjs';
import { generateShopOffer } from '../data/draft-shop.mjs';
import { getLeagueTier, getLadderIndex, getNextTier, convertPowerToPoints } from '../engine/league.mjs';
import { judgeRunOutcome, nextMissedTargetCount, seasonPrestige, demandPrestige, uclPrestige, retirePrestige, gradeOf, titleProgress } from '../engine/run.mjs';
import {
  createUcl, advanceUcl, uclRanking, nameOf, teamOf, tieAggregate, generateShootout,
  UCL_RESULT_LABELS, UCL_REWARDS_FUNDS, UCL_STAGE_LABELS, UCL_STYLE_LABELS, UCL_LEAGUE_DAYS, UCL_DIRECT_SPOTS, UCL_PLAYOFF_SPOTS,
} from '../engine/champions-league.mjs';
import { runHalfSeason, judgeSeasonResult, advanceWeek, boardGoalPoints, boardReward } from '../engine/season.mjs';
import { resolvePromotionTransferDemand } from '../engine/events.mjs';
import {
  calculateStartingFunds,
  fundsScale,
  applyCarryoverCap,
  recallFunds,
  applyCostModifiers,
  computeReleaseProceeds,
  generateSaleOffers,
  calculatePlayerPrice,
} from '../engine/economy.mjs';
import { applyTransactionDecay, chemistryMultiplier } from '../engine/chemistry.mjs';
import { computePlayerFinalOVR, computePlayerBonusBreakdown } from '../engine/ovr.mjs';
import {
  PLAYSTYLE_TAGS, POSITIONS,
  STAFF_LEVELS, STAFF_PRICE_TABLE,
} from '../engine/constants.mjs';
import { computeTeamPower, computeAverageOVR } from '../engine/team-power.mjs';
import { optimizeLineup, missingSlots } from '../engine/lineup.mjs';
import { simulateLeagueTable, rankingAt, finalRankFromTable, MATCHES_PER_HALF } from '../engine/half-results.mjs';
import { ageSquad, ageTrend, agePriceMult } from '../engine/aging.mjs';
import { FORMATIONS, DEFAULT_FORMATION, POSITION_GROUPS } from './formations.mjs';
import { renderPortrait, appearanceOf } from './portrait.mjs';
import { pixelMatchHtml } from './pixel.mjs';
import { track, telemetryOn, telemetryConfigured, setTelemetry } from './telemetry.mjs';
import { renderCrest } from './crest.mjs';
import { showSpot, clearSpot } from './tutorial.mjs';
import { stadiumHtml, stadiumLevel } from './stadium.mjs';
import { loadFlags, updateFlags, isUnlocked, unlockForSeason, UNLOCK_LABEL } from '../data/flags.mjs';
import {
  CHEMISTRY_START,
  CHEMISTRY_DECAY_PER_TRANSACTION,
  SHOP_OFFER_SIZE,
  SHOP_REROLL_COST,
  SUMMER_MARKET_WEEKS,
  HARMONY_START_SEASON,
  squadCapFor,
  SLUMP_OVR_PENALTY,
  WINTER_MARKET_WEEKS,
  WINTER_TAX_RATIO,
  TRAIT_PRICE_MULT, PLAYER_PRICE_TABLE,
  WINTER_FUNDS_RATIO,
  PROMOTION_CHEMISTRY_BONUS,
  PROMOTION_STAY_FUNDS_RATIO,
  REPUTATION_STREAK_BONUS,
  COACH_CHEMISTRY_DECAY_BY_LEVEL,
  SCOUT_SHOP_OFFER_SIZE_BY_LEVEL, SCOUT_TARGETS_BY_LEVEL, SCOUT_QUALITY_BOOST_BY_LEVEL, SCOUT_REROLL_DISCOUNT_BY_LEVEL, ADVANCED_TAGS,
  PROMOTION_TRANSFER_DEMAND_CHANCE,
  PLAYER_TIERS,
  MISSED_TARGET_LIMIT,
  STAGNATION_FUNDS_PENALTY_PER_MISS,
  SAME_LEAGUE_FUNDS_RATIO,
  HOMETOWN_RELEASE_CHEMISTRY_PENALTY,
  SEONGGOL_TRANSFER_DEMAND_CHANCE,
  SEONGGOL_REJECT_OVR_PENALTY,
  MANAGER_TIER_MULTIPLIER,
  LEAGUE_EXPECTED_MANAGER,
  COACH_UNIT_BONUS_BY_LEVEL, COACH_UNIT_LABELS, COACH_FOCUS_ORDER,
  BOARD_REWARD_FUNDS_PER_POINT,
  BOARD_REWARD_FUNDS_CAP,
  BOARD_REWARD_CHEMISTRY,
  BOARD_DEMAND_REWARD,
} from '../engine/constants.mjs';


// 카드 데이터(정적)를 스쿼드 상태(동적 필드 포함)로 만든다. 새 스쿼드이므로
// 전원 이번 시즌 영입, 잔류 0시즌으로 취급 — 저니맨 태그가 바로 발동한다.
function toSquadPlayer(card) {
  return { ...card, seasonsAtClub: 0, acquiredThisSeason: true, inBench: false };
}

// 지금 포메이션이 요구하는 포지션 중 스쿼드에 아예 없는 것들(계약 만료·방출로
// 다 빠져나간 경우). 전술 탭에 경고를 미리 띄울 때와 실제로 채울 때 둘 다 쓴다.
// 한 포지션에 슬롯이 둘이면(CB 2명 등) 부족한 인원만큼 여러 번 나온다.
function missingPositions(squad, formationId) {
  return missingSlots(squad, FORMATIONS[formationId].slots);
}

// 포지션 공백을 오프포지션 대타로 억지로 메우는 대신 유스를 긴급 콜업한다.
// 시즌 시뮬레이션 직전(runFirstHalf/runSecondHalfAndFinish)에 호출해서
// 실제로 경기를 뛰기 전에 자리를 채운다.
function ensurePositionCoverage() {
  const missing = missingPositions(currentState.squad, currentFormation());
  if (!missing.length) return [];
  const callUps = missing.map((pos) => toSquadPlayer(generateEmergencyYouth(pos)));
  currentState.squad = [...currentState.squad, ...callUps];
  return callUps.map((p) => `${p.name}(${p.position})`);
}

const BENCH_SIZE = 5;

// formationId의 슬롯 순서대로 최고 OVR을 채운다. 포지션이 맞는 선수가 없으면
// 그 포지션 선수가 없으면 공석으로 둔다(오프포지션 대타 없음) - 이적시장이
// 끝나도 비어 있으면 ensurePositionCoverage가 최저 능력치 유스를 콜업한다.
// manualOverrides(슬롯 인덱스 -> 선수 id)로 고정한 자리는 자동 선발이 건드리지
// 않는다 - 유저가 전술 탭에서 직접 배치한 선수다. benchOverrides도 같은 방식
// (벤치 슬롯 0~4 -> 선수 id)으로 벤치 구성도 직접 고를 수 있다.
function pickBestXI(squad, formationId = DEFAULT_FORMATION, manualOverrides = {}, benchOverrides = {}) {
  const { slots } = FORMATIONS[formationId] ?? FORMATIONS[DEFAULT_FORMATION];
  const pool = [...squad];
  const used = new Set();
  const forced = {};
  for (const [idxStr, playerId] of Object.entries(manualOverrides)) {
    const idx = Number(idxStr);
    if (!slots[idx]) continue;
    const player = pool.find((p) => p.id === playerId && !used.has(p.id));
    // 본래 포지션 슬롯에만 고정 가능 - 예전 세이브의 다른 포지션 고정은 무시한다.
    if (player && player.position === slots[idx]) {
      forced[idx] = player;
      used.add(player.id);
    }
  }
  const lineup = slots.map((pos, i) => {
    if (forced[i]) return { ...forced[i], slotPosition: pos, offPosition: forced[i].position !== pos };
    const byPosition = pool
      .filter((p) => !used.has(p.id) && p.position === pos)
      .sort((a, b) => b.baseOVR - a.baseOVR);
    const pick = byPosition[0];
    if (!pick) return null; // 그 포지션 선수 없음 — 공석
    used.add(pick.id);
    return { ...pick, slotPosition: pos, offPosition: pick.position !== pos };
  });

  const forcedBench = {};
  for (const [idxStr, playerId] of Object.entries(benchOverrides)) {
    const idx = Number(idxStr);
    if (idx < 0 || idx >= BENCH_SIZE) continue;
    const player = pool.find((p) => p.id === playerId && !used.has(p.id));
    if (player) {
      forcedBench[idx] = player;
      used.add(player.id);
    }
  }
  const leftover = pool.filter((p) => !used.has(p.id)).sort((a, b) => b.baseOVR - a.baseOVR);
  const bench = Array.from({ length: BENCH_SIZE }, (_, i) => forcedBench[i] ?? leftover.shift())
    .filter(Boolean)
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

// 이사진이 이번 시즌 요구하는 승점(안전선~승격선 사이). 리그와 구단 기대치만으로
// 정해지니 따로 저장하지 않고 필요할 때 계산한다.
// 팀 전력 계산에 들어가는 리그/스태프 요소(감독 리그 적합도, 수석 코치 직접 효과)
function powerExtras() {
  return { leagueTierId: currentState.leagueTierId };
}
function currentBoardGoal() {
  return boardGoalPoints(effectiveTier(currentState.leagueTierId));
}
function seasonBaseGrant() {
  return calculateStartingFunds(getLadderIndex(currentState.leagueTierId)) * currentState.club.startingFundsMultiplier;
}
const BOARD_RULE_TEXT = `목표를 넘긴 승점 1점당 다음 시즌 자금 +${BOARD_REWARD_FUNDS_PER_POINT * 100}%(최대 +${BOARD_REWARD_FUNDS_CAP * 100}%), 한 점이라도 넘기면 적응도 +${BOARD_REWARD_CHEMISTRY}.`;

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
  pass: '패스', dribble: '개인기', physical: '피지컬',
};
const TRAIT_LABELS = {
  starPower: '스타 기질', seongGolYouth: '성골 유스', veteranLeader: '베테랑 리더', superSub: '슈퍼 서브',
  hometownHero: '지역 영웅', journeyman: '저니맨',
};
// 전술 탭 "선수 특수 태그" 섹션에 쓰는 효과 설명(engine/ovr.mjs 실제 수치와 짝).
const TRAIT_EFFECT_DESCRIPTIONS = {
  starPower: '선발이면 본인 OVR +10',
  seongGolYouth: '유스 출신 본인 OVR +10',
  veteranLeader: '33세 이상이 선발이면 선발 23세 이하 전원 +3, 거래당 적응도 하락 −1',
  superSub: '벤치에 있으면 선발 전원 OVR +1',
  hometownHero: '뛴 시즌마다 본인 OVR +4 (최대 +12)',
  journeyman: '이번 시즌 영입이면 본인 OVR +8',
};
// 평균 나이(소수 첫째 자리). 노화·은퇴로 선수단이 갈리는 흐름을 한눈에 보게 한다.
function avgAge(players) {
  return players.length ? (players.reduce((sum, p) => sum + p.age, 0) / players.length).toFixed(1) : '-';
}
// 시즌 시작 몸값 재계산: 성장한 선수는 비싸지고(갱신비 상승) 노쇠한 선수는 싸진다. GOD 카드와 무료 영입(0G)은 그대로.
function repricePlayer(p) {
  if (!p.price || p.id.startsWith('god-')) return p;
  const tier = tierOf(p.baseOVR);
  const range = PLAYER_PRICE_TABLE[tier];
  if (!range) return p;
  const base = Math.min(range[1], Math.max(range[0], calculatePlayerPrice(tier, p.baseOVR)));
  return { ...p, price: Math.round(base * (TRAIT_PRICE_MULT[p.specialTrait] ?? 1) * agePriceMult(p.age)) };
}
const TRAIT_DOWNSIDE_TEXT = {
  starPower: '영입가 ×1.5',
  seongGolYouth: '시즌이 끝나면 30% 확률로 이적 요구 (수락=자유계약으로 이탈, 거부=OVR −3)',
  veteranLeader: '대가 없음',
  superSub: '벤치에 고정(선발 출전 불가)',
  hometownHero: '방출·판매하면 팀 적응도 −8',
  journeyman: '대가 없음',
};
// 팀 케미/특수 태그 배지 안에 그리는 작은 기호(글자 대신 아이콘). 풀네임은
// title(호버)로만 남긴다. crest.mjs/portrait.mjs와 같은 원칙 - 이미지 파일
//없이 인라인 SVG path만으로 그린다.
const PLAYSTYLE_ICON_PATHS = {
  // 기본기
  pass: '<circle cx="5" cy="17" r="2.2"/><circle cx="19" cy="17" r="2.2"/><path d="M6.5 13.5 C9 6 15 6 17.5 13.5"/><path d="M14.2 12.2 L17.6 13.8 L18.4 10.2"/>',
  dribble: '<path d="M3 6 C6 2.5 8 9 11 6 C13.5 3.5 14 10 12.5 12.5"/><circle cx="17.5" cy="16.5" r="3.6"/><path d="M17.5 14.2 L19.3 15.6 L18.6 17.8 L16.4 17.8 L15.7 15.6 Z"/>',
  physical: '<path d="M2.5 10 V14 M5.5 8 V16 M18.5 8 V16 M21.5 10 V14 M5.5 12 H18.5"/>',
  // 보통
  longBallKickAndRush: '<path d="M3 20 C7 2 17 2 20 12"/><circle cx="20.2" cy="15" r="2.6"/><path d="M3 20 L6.5 17.5"/>',
  falseFullBack: '<circle cx="5" cy="18" r="2"/><circle cx="12" cy="18" r="2"/><circle cx="19" cy="18" r="2"/><path d="M19 14.5 C19 10 16.5 8.5 13 8.5"/><path d="M14.8 6.4 L12.6 8.5 L14.8 10.6"/>',
  buildUpFromBack: '<path d="M4.5 21 V15.5 H19.5 V21"/><path d="M12 13 V4.5"/><path d="M8.2 8.2 L12 4.5 L15.8 8.2"/>',
  counterAttack: '<path d="M13.5 2 L5.5 13.2 H11 L10 22 L18.5 10.2 H12.8 Z"/>',
  // 어려움
  gegenpressing: '<circle cx="12" cy="12" r="2.4"/><path d="M12 3 V7.5 M9.8 5.4 L12 7.6 L14.2 5.4"/><path d="M12 21 V16.5 M9.8 18.6 L12 16.4 L14.2 18.6"/><path d="M3 12 H7.5 M5.4 9.8 L7.6 12 L5.4 14.2"/><path d="M21 12 H16.5 M18.6 9.8 L16.4 12 L18.6 14.2"/>',
  falseNine: '<circle cx="12" cy="12" r="9" stroke-dasharray="2.6 2.4"/><text x="12" y="16.4" font-size="12" font-weight="800" text-anchor="middle" fill="currentColor" stroke="none" font-family="Anton, sans-serif">9</text>',
  tikiTaka: '<circle cx="12" cy="5" r="2.2"/><circle cx="5" cy="18" r="2.2"/><circle cx="19" cy="18" r="2.2"/><path d="M11 7.2 L6 15.8 M13 7.2 L18 15.8 M7.5 18 H16.5"/>',
  totalFootball: '<path d="M20 12 A8 8 0 0 1 6 17.3"/><path d="M4 12 A8 8 0 0 1 18 6.7"/><path d="M18.2 2.8 V7 H14"/><path d="M5.8 21.2 V17 H10"/>',
};
const TRAIT_ICON_PATHS = {
  scout: '<circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="1.8"/><path d="M12 2 V5 M12 19 V22 M2 12 H5 M19 12 H22"/>',
  starPower: '<path d="M12 3 L14 9 H20 L15 13 L17 19 L12 15 L7 19 L9 13 L4 9 H10 Z"/>',
  seongGolYouth: '<path d="M12 2 L14.7 8.6 L22 9.3 L16.5 14 L18 21 L12 17.3 L6 21 L7.5 14 L2 9.3 L9.3 8.6 Z"/>',
  veteranLeader: '<rect x="5" y="9" width="14" height="6" rx="1.5"/><path d="M5 12 H19"/>',
  superSub: '<path d="M8 15 L8 5 M8 5 L5 8 M8 5 L11 8 M16 9 L16 19 M16 19 L13 16 M16 19 L19 16"/>',
  hometownHero: '<path d="M4 11 L12 4 L20 11 M6 10 V20 H18 V10"/>',
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
  reboundArchitect: '리빌딩 장인', firefighter: '소방수',
  crisisManager: '위기 관리형', longTermReign: '장기 집권형', tacticalPurist: '전술 원리주의자',
};
// 감독·스태프 칸(사단 꾸리기)에서 "이 성향이 뭘 하는지" 보여주는 설명.
const MANAGER_TRAIT_DESCRIPTIONS = {
  hairdryer: '영입 즉시 적응도 +20',
  boardTrust: '강등을 1회 면제',
  silverTongue: '감독 선호 전술 태그 선수 영입비 -30%',
  reboundArchitect: '거래당 적응도 하락 절반',
  firefighter: '위기 페이스로 겨울 진입 시 적응도 +30',
  crisisManager: '위기 이벤트 무효화',
  longTermReign: '잔류 시즌마다 적응도 +3',
  tacticalPurist: '선호 전술이 발동했을 때 적응도 보너스 2배(+20)',
};
// 스태프 능력을 문장 대신 짧은 칩으로. 자세한 뜻은 칩에 마우스를 올리면(title) 나온다.
function staffChips(role, level) {
  const chip = (text, title = '') => `<span class="chip chip--plain" title="${esc(title)}">${text}</span>`;
  if (role === 'headCoach') {
    const v = COACH_CHEMISTRY_DECAY_BY_LEVEL[level];
    const units = COACH_UNIT_BONUS_BY_LEVEL[level] ?? [];
    return chip(v === 0 ? '거래 적응도 유지' : `거래당 적응도 −${v}`, '영입·방출 한 건마다 떨어지는 적응도')
      + units.map((b, i) => chip(`${['주력', '2순위', '3순위'][i]} +${b}`, '코치가 고른 주력 유닛부터 선수 OVR을 올려 줍니다')).join('');
  }
  const t = SCOUT_TARGETS_BY_LEVEL[level];
  return chip(`매물 ${SCOUT_SHOP_OFFER_SIZE_BY_LEVEL[level]}장`)
    + (SCOUT_QUALITY_BOOST_BY_LEVEL[level] ? chip(`상위 카드 +${Math.round(SCOUT_QUALITY_BOOST_BY_LEVEL[level] * 100)}%`, '톱클래스 이상 카드가 나올 확률') : '')
    + (SCOUT_REROLL_DISCOUNT_BY_LEVEL[level] ? chip(`리롤 −${Math.round(SCOUT_REROLL_DISCOUNT_BY_LEVEL[level] * 100)}%`, '다시 뽑기 비용 할인') : '')
    + (t.tag ? chip(t.combined ? '목표 태그+포지션' : t.exclusive ? '목표 태그/포지션' : '목표 태그', '매주 1장 보장') : '');
}

// 영입 탭 > 감독 목록
function draftManagerHtml(funds) {
  return `<ul class="mgroffers">${currentState.managerOffer.map((m) => {
    const { total } = managerHireCost(m);
    const trait = m.trait && MANAGER_TRAIT_LABELS[m.trait]
      ? `<span class="chip chip--plain" title="${esc(MANAGER_TRAIT_DESCRIPTIONS[m.trait] ?? '')}">${MANAGER_TRAIT_LABELS[m.trait]}</span>` : '';
    return `<li class="mgroffer" data-row="mgr-${m.id}" style="--tier:var(--${MANAGER_TIER_COLOR[m.tier] ?? 't-local'})">
      ${renderPortrait(m, { size: 40 })}
      <div class="mgroffer__body">
        <div class="player__name">${esc(m.name)}</div>
        <div class="chips">${managerChipsHtml(m, false)}${trait}</div>
      </div>
      <button class="hire" data-hire-manager="${m.id}" ${funds >= total ? '' : 'disabled'} title="영입비 ${m.price}G + 현 감독 위약금">
        <span>영입</span><b class="n">${total}G</b>
      </button>
    </li>`;
  }).join('')}</ul>`;
}

// 영입 탭 > 스태프 목록(코치/스카우터)
function draftStaffHtml(funds) {
  return ['headCoach', 'headScout'].map((role) => `
    <h3 class="staffgroup__title">${STAFF_ROLE_LABELS[role]}</h3>
    <ul class="mgroffers">${STAFF_LEVELS.filter((level) => currentState.staffOffer[`${role}:${level}`]).map((level) => {
      const cost = Math.round(STAFF_PRICE_TABLE[level].reduce((x, y) => x + y, 0) / 2);
      const isCurrent = currentState.staff[role].level === level;
      const candidate = currentState.staffOffer[`${role}:${level}`];
      return `<li class="mgroffer${isCurrent ? ' is-current' : ''}" data-row="staff-${role}-${level}" style="--tier:var(--${STAFF_LEVEL_COLOR[level] ?? 't-local'})">
        ${renderPortrait(candidate, { size: 40, role: role === 'headScout' ? 'scout' : 'coach' })}
        <div class="mgroffer__body">
          <div class="player__name">${esc(candidate.name)} <small class="staff__level">${STAFF_LEVEL_LABELS[level]}${isCurrent ? ' · 현재' : ''}</small></div>
          <div class="chips">${staffChips(role, level)}</div>
        </div>
        <button class="hire" data-hire-staff="${role}:${level}" ${isCurrent || funds < cost ? 'disabled' : ''}>
          <span>영입</span><b class="n">${cost}G</b>
        </button>
      </li>`;
    }).join('')}</ul>`).join('');
}

// 등급별로 뭐가 얼마나 좋아지는지 한 줄. 코치 수치는 "거래 1건당 적응도 하락".
function staffBenefit(role, level) {
  if (role === 'headCoach') {
    const v = COACH_CHEMISTRY_DECAY_BY_LEVEL[level];
    const units = COACH_UNIT_BONUS_BY_LEVEL[level] ?? [];
    return (v === 0 ? '거래해도 적응도 유지' : `거래당 적응도 −${v}`)
      + (units.length ? ` · 유닛 보너스 ${units.map((b, i) => `${['주력', '2순위', '3순위'][i]} +${b}`).join(' · ')}` : '');
  }
  const n = SCOUT_SHOP_OFFER_SIZE_BY_LEVEL[level];
  const boost = SCOUT_QUALITY_BOOST_BY_LEVEL[level];
  const disc = SCOUT_REROLL_DISCOUNT_BY_LEVEL[level];
  const t = SCOUT_TARGETS_BY_LEVEL[level];
  const target = !t.tag ? '' : t.exclusive ? ' · 목표 태그 또는 목표 포지션 1장 보장' : t.combined ? ' · 목표 태그와 목표 포지션을 동시에 만족하는 선수 1장 보장' : ' · 목표 태그 1장 보장';
  return `매물 ${n}장${boost ? ` · 톱클래스 이상 카드 +${Math.round(boost * 100)}%` : ''}${disc ? ` · 다시 뽑기 −${Math.round(disc * 100)}%` : ''}${target}`;
}
const MANAGER_TIER_MULTIPLIER_TEXT = {
  rookie: '팀 전력 배율 ×1.00', tactician: '팀 전력 배율 ×1.05',
  legendary: '팀 전력 배율 ×1.12', god: '팀 전력 배율 ×1.20',
};
// 감독 카드에 쓰는 요약 칩(등급·배율 / 전술 / 대륙)과 성향 한 줄.
function managerChipsHtml(m, wrap = true) {
  const tag = `<span class="chip chip--plain" title="감독이 선호하는 전술: 여름·겨울 시장이 끝날 때 라인업에서 발동하면 적응도 +${MANAGER_HARMONY_BONUS}, 못 켜면 −${MANAGER_HARMONY_PENALTY}">${renderTagIcon(PLAYSTYLE_ICON_PATHS, m.tacticalTag)}${TAG_LABELS[m.tacticalTag] ?? m.tacticalTag}</span>`;
  const tier = `<span class="chip chip--plain chip--tier">${MANAGER_TIER_LABELS[m.tier] ?? m.tier} ${MANAGER_TIER_MULTIPLIER_TEXT[m.tier]?.replace('팀 전력 배율 ', '') ?? ''}</span>`;
  return wrap ? `<div class="chips">${tier}${tag}</div>` : tier + tag;
}
function managerTraitHtml(m) {
  return m.trait && MANAGER_TRAIT_LABELS[m.trait]
    ? `<p class="traitline"><b>${MANAGER_TRAIT_LABELS[m.trait]}</b> ${MANAGER_TRAIT_DESCRIPTIONS[m.trait] ?? ''}</p>`
    : '<p class="traitline traitline--none">세부 성향 없음</p>';
}

// 이적시장이 끝나는 시점(여름: 전반기 직전, 겨울: 후반기 직전)의 라인업으로 각각 한 번 체크한다.
// 감독의 전술 태그 케미가 그때 안 켜져 있으면 "선호하는 선수단을 못 꾸렸다"는
// 뜻이라 불화, 켜져 있으면 전술이 자리잡았다는 뜻이라 보너스 - 새 수치 체계
// 없이 이미 있는 적응도(케미스트리)를 그대로 밀고 올린다.
const MANAGER_HARMONY_PENALTY = 15;
const MANAGER_HARMONY_BONUS = 10;
// 사임 때 자금이 모자라도 판이 막히지 않게 늘 고를 수 있는 임시 감독(무료·루키·세부 성향 없음, 위약금도 없음).
function makeTempManager() {
  const m = generateProceduralManager('rookie');
  return { ...m, name: `${m.name}(임시)`, price: 0, trait: null, temp: true };
}
// 시뮬레이션 직전에 감독 평가(전술 완성/불화/면제) 결과를 팝업으로 확실히 보여 준다.
// 예전에는 결과 문구가 후반기엔 시즌 결산 배너에만 떠서 놓치기 쉬웠다.
function showHarmonyNotice(message, onContinue) {
  if (!message) { onContinue(); return; }
  const bad = message.startsWith('감독과의 불화:');
  const [title, ...rest] = message.split(': ');
  const root = document.getElementById('eventmodal-root');
  if (!root) { onContinue(); return; }
  root.innerHTML = `
    <div class="eventmodal-backdrop">
      <div class="eventmodal eventmodal--${bad ? 'bad' : 'good'}">
        <div class="eventmodal__kicker">감독 평가 · 시즌 시뮬레이션 직전</div>
        <div class="eventmodal__title">${esc(bad ? '감독과의 불화' : title)}</div>
        <div class="eventmodal__detail">${esc(bad ? rest.join(': ') : (rest.join(': ') || ''))}</div>
        <button class="cta" id="harmony-continue">시뮬레이션 시작</button>
      </div>
    </div>`;
  document.getElementById('harmony-continue').onclick = () => { root.innerHTML = ''; onContinue(); };
}
function applyManagerTacticalHarmony(lineup) {
  const { manager } = currentState;
  const { tier } = playstyleTagProgress(manager.tacticalTag, lineup);
  const tagLabel = TAG_LABELS[manager.tacticalTag] ?? manager.tacticalTag;
  if (tier === 0) {
    if (currentState.seasonNumber < HARMONY_START_SEASON) return ''; // 감독 탭이 열리기 전에는 벌칙도 사임도 없다
    if (currentState.harmonyShield) {
      currentState.harmonyShield = false;
      return `감독과의 불화 면제: 전술 분석관이 ${manager.name} 감독과의 갈등을 막아 줬습니다`;
    }
    currentState.chemistry = Math.max(0, currentState.chemistry - MANAGER_HARMONY_PENALTY);
    currentState.harmonyStreak = (currentState.harmonyStreak ?? 0) + 1;
    const base = `감독과의 불화: ${manager.name} 감독이 선호하는 전술(${tagLabel})에 맞는 선수단을 못 꾸렸습니다. 적응도 -${MANAGER_HARMONY_PENALTY}`;
    if (currentState.harmonyStreak >= 2) {
      currentState.pendingResignation = { temp: makeTempManager() };
      return `${base}. 불화가 2번 이어져 ${manager.name} 감독이 사임을 통보했습니다`;
    }
    return `${base} (한 번 더 이어지면 감독이 사임합니다)`;
  }
  currentState.harmonyStreak = 0;
  const bonus = manager.trait === 'tacticalPurist' ? MANAGER_HARMONY_BONUS * 2 : MANAGER_HARMONY_BONUS;
  currentState.chemistry = Math.min(100, currentState.chemistry + bonus);
  return `전술 완성: ${manager.name} 감독이 선호하는 전술(${tagLabel})이 라인업에서 발동했습니다. 적응도 +${bonus}`;
}

// 선수단/전술 탭에서 선수 태그를 전부(플레이스타일·대륙·특수 성향) 한눈에 보여준다.
// 팀 케미 패널은 라인업 전체 집계라 개인이 무슨 태그인지는 안 보였다.
// 플레이스타일은 등급(기본기/보통/어려움)을 색 농도로 구분한다. 어려울수록 진하다.
function playerTagsHtml(p) {
  const chips = [
    ...(p.playstyleTags ?? []).map((t) => `<span class="tag tag--${PLAYSTYLE_TAGS[t]?.grade ?? 'basic'}" title="${esc((PLAYSTYLE_TAGS[t]?.positions ?? []).join('·'))}">${TAG_LABELS[t] ?? t}</span>`),
    p.specialTrait ? `<span class="tag tag--trait" title="${esc(TRAIT_EFFECT_DESCRIPTIONS[p.specialTrait] ?? '')}">${TRAIT_LABELS[p.specialTrait] ?? p.specialTrait}</span>` : '',
  ].join('');
  return chips ? `<div class="tags">${chips}</div>` : '';
}

// 선수의 태그를 아이콘 한 줄로(플레이스타일 → 대륙 → 특수). active에 든 태그는 초록(지금 보너스 중).
function tagInfoText(kind, id) {
  if (kind === 'play') {
    const def = PLAYSTYLE_TAGS[id];
    const { req, values } = playstyleTagProgress(id, []);
    return `${TAG_LABELS[id] ?? id}: ${tagLadderText(req, values)} (${def.positions.join('·')} 포지션만 셈)`;
  }
  return `${TRAIT_LABELS[id] ?? id}: ${TRAIT_EFFECT_DESCRIPTIONS[id] ?? ''}. 대가: ${TRAIT_DOWNSIDE_TEXT[id] ?? ''}`;
}
// 선수의 태그를 아이콘 한 줄로(플레이스타일 → 대륙 → 특수). active에 든 태그는 초록(지금 보너스 중).
// 눌러서 설명을 볼 수 있게 data-tag-info에 문장을 싣는다(선수단 탭에서 처리).
function tagIconsHtml(p, active = null) {
  const on = (id) => (active && active.has(id) ? ' is-on' : '');
  const btn = (kind, id) => `data-tag-info="${esc(tagInfoText(kind, id))}" role="button" tabindex="0"`;
  const play = (p.playstyleTags ?? []).map((t) => `<i class="ticon ticon--g-${PLAYSTYLE_TAGS[t]?.grade ?? 'basic'}${on(t)}" title="${esc(TAG_LABELS[t] ?? t)}" ${btn('play', t)}>${renderTagIcon(PLAYSTYLE_ICON_PATHS, t)}</i>`).join('');
  const trait = p.specialTrait ? `<i class="ticon ticon--trait" title="${esc(TRAIT_LABELS[p.specialTrait] ?? '')}" ${btn('trait', p.specialTrait)}>${renderTagIcon(TRAIT_ICON_PATHS, p.specialTrait)}</i>` : '';
  return `<span class="ticons">${play}${trait}</span>`;
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

// 전/후반기 시뮬레이션: 경기장 위에서 공이 오가는 연출은 그대로 두고, 아래 순위표는
// 실제 승점 기반이다. 내 승점은 이미 계산된 시즌 결과이고, 다른 19팀은 리그 기준선에 맞춰
// 깔린 승점(engine/half-results.mjs)이라 라운드마다 순위가 진짜로 바뀐다.
// 화면을 누르면 빨리 감기.
// ctx.table/rivals: 미리 만든 순위표와 상대 구단(후반기는 전반기 것을 이어받아 시즌 누적으로 보여 준다).
// ctx.second: 후반기 여부(라벨만 바뀐다 - 승점은 이미 전반기 누적이 반영돼 있다).
// 시뮬레이션 화면에서 내 포메이션과 내 선발 11명을 그대로 보여주기 위한 배치.
function myPixelLineup() {
  try {
    const fid = currentFormation();
    const f = FORMATIONS[fid];
    const { slotted } = pickBestXI(currentState.squad, fid, currentState.manualOverrides, currentState.benchOverrides);
    return f.coords.map((coord, i) => ({ coord, slot: f.slots[i], ...(slotted[i] ? appearanceOf(slotted[i]) : {}) }));
  } catch (e) {
    return null; // 배치를 못 읽으면 기본 배치로
  }
}

function renderSimulating(clubName, tierLabel, phaseLabel, kitColor, finalPoints, onDone, ctx = {}) {
  const N = MATCHES_PER_HALF;
  const tier = effectiveTier(currentState.leagueTierId);
  const second = !!ctx.second;
  const table = ctx.table ?? simulateLeagueTable(finalPoints, tier);
  const rivals = ctx.rivals ?? buildLeagueRivals(currentState.leagueTierId, N).map((c) => ({ name: c.name, kit: c.kit }));
  const info = new Map(table.map((t, i) => [t.id, t.id === 'me' ? { name: clubName, kit: kitColor } : rivals[i - 1] ?? { name: `상대 ${i}`, kit: '#4a5a52' }]));
  const pointsOf = new Map(table.map((t) => [t.id, t.cumulative]));
  const baseOf = new Map(table.map((t) => [t.id, t.base ?? 0]));
  const SHOWN = 6; // 상위 6팀 + 내가 그 밖이면 내 순위 한 줄

  // 순위가 바뀌는 게 실제로 눈에 보이게: 이전 라운드 대비 오른 승점은 잠깐 초록으로
  // 반짝이고(is-up), 줄 순서가 바뀌면 FLIP으로 부드럽게 미끄러진다.
  const prevPoints = new Map();
  const buildStandingsHtml = (round) => {
    const order = rankingAt(table, round || 1);
    const rankOf = (id) => order.indexOf(id) + 1;
    let ids = order.slice(0, SHOWN);
    if (!ids.includes('me')) ids = [...ids.slice(0, SHOWN - 1), 'me'];
    return ids.map((id) => {
      const pts = round ? pointsOf.get(id)[round - 1] : baseOf.get(id);
      const isUp = pts > (prevPoints.get(id) ?? baseOf.get(id));
      prevPoints.set(id, pts);
      const { name, kit } = info.get(id);
      return `<li class="${id === 'me' ? 'is-mine' : ''}" data-key="${id}">
        <span class="standings__rank">${rankOf(id)}</span>
        ${renderCrest({ name, kit }, { size: 22 })}
        <span class="standings__name">${esc(name)}</span>
        <span class="standings__pts n${isUp ? ' is-up' : ''}">${pts}</span>
      </li>`;
    }).join('');
  };

  // FLIP: 갱신 전 각 행의 위치를 기록해뒀다가, 갱신 후 그 자리에서 시작하는
  // 것처럼 보이게 transform으로 되돌린 다음 0으로 애니메이션한다.
  const updateStandings = (round) => {
    const el = document.getElementById('sim-standings');
    if (!el) return;
    const before = new Map();
    for (const li of el.children) before.set(li.dataset.key, li.getBoundingClientRect().top);
    el.innerHTML = buildStandingsHtml(round);
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
        <span class="matchsim__club">${esc(clubName)} · ${esc(tierLabel)} · ${esc(phaseLabel)}</span>
        <span class="matchsim__clock" id="sim-clock">0/${N}</span>
      </div>
      <div class="matchsim__pitch pxpitch" id="sim-pitch">
        ${pixelMatchHtml(kitColor, { home: myPixelLineup() })}
      </div>
      <div class="matchsim__ticker">
        <span class="matchsim__dot"></span>
        <span id="sim-phrase">킥오프</span>
      </div>
      <div class="panel">
        <div class="panel__head"><h2>${second ? '시즌 누적 순위' : '실시간 순위'}</h2><span class="panel__count">${second ? '전반기 승점 포함' : '승점'}</span></div>
        <ul class="standings" id="sim-standings">${buildStandingsHtml(0)}</ul>
      </div>
      <p class="note" style="text-align:center">화면을 누르면 빨리 감기</p>
    </div>
  `);

  const xi = pickBestXI(currentState.squad, currentFormation(), currentState.manualOverrides, currentState.benchOverrides).lineup;
  currentState.mvp ??= {};
  const pickMvp = () => {
    const weights = xi.map((p) => Math.max(1, p.baseOVR - 40) ** 2);
    let r = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < xi.length; i++) { r -= weights[i]; if (r <= 0) { currentState.mvp[xi[i].id] = (currentState.mvp[xi[i].id] ?? 0) + 1; return xi[i]; } }
    return xi[0] ?? null;
  };
  let round = 0;
  let delay = 430;
  let prevRank = rankingAt(table, 0).indexOf('me') + 1;
  document.querySelector('.matchsim').onclick = () => { delay = 40; };

  const step = () => {
    if (round >= N) { setTimeout(onDone, 700); return; }
    round += 1;
    const rank = rankingAt(table, round).indexOf('me') + 1;
    const move = prevRank - rank;
    prevRank = rank;
    const clock = document.getElementById('sim-clock');
    if (clock) clock.textContent = `${round}/${N}`;
    const phrase = document.getElementById('sim-phrase');
    const myPts = pointsOf.get('me')[round - 1];
    const gained = myPts - (round > 1 ? pointsOf.get('me')[round - 2] : baseOf.get('me'));
    const verdict = gained >= 3 ? '승' : gained >= 1 ? '무' : '패';
    const moveText = move > 0 ? `▲${move}` : move < 0 ? `▼${-move}` : '';
    // 승리한 라운드마다 선발 중 한 명이 MVP(OVR이 높을수록 잘 뽑힌다)
    const mvp = gained >= 3 ? pickMvp() : null;
    // 운명의 라운드: 시즌 막판 승격선·강등선 근처
    const fate = second && round >= N - 2 && ((!ctx.isTop && rank >= 2 && rank <= 5) || (rank >= 15 && rank <= 18));
    if (phrase) {
      phrase.textContent = `${fate ? '운명의 라운드 · ' : ''}${round}라운드 ${verdict} · ${rank}위${moveText ? `(${moveText})` : ''}${mvp ? ` · MVP ${mvp.name.split(' ').slice(-1)[0]}` : ''}`;
      phrase.closest('.matchsim__ticker')?.classList.toggle('is-fate', fate);
    }
    updateStandings(round);
    if (move > 0) { const pitch = document.getElementById('sim-pitch'); pitch?.classList.add('is-up'); setTimeout(() => pitch?.classList.remove('is-up'), 700); }
    setTimeout(step, delay);
  };
  setTimeout(step, 500);
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
  document.getElementById('story-screen').onclick = () => renderClubButtons();
}

// ---------- 역대 기록 / 업적 / 트로피 ----------
// 런과 별개로 쌓이는 기록(data/records.mjs). 갱신하면서 새로 풀린 업적은 토스트로 알린다.
function updateRecords(fn) {
  const before = loadRecords(localStorage);
  const after = fn(before);
  saveRecords(localStorage, after);
  const fresh = newlyUnlocked(before, after);
  if (fresh.length) showAchievementToast(fresh);
  return after;
}

function showAchievementToast(list) {
  const el = document.createElement('div');
  el.className = 'achtoast';
  el.innerHTML = list.map((a) => `<div class="achtoast__item"><span>🏅 업적 달성</span><b>${esc(a.label)}</b><small>${esc(a.desc)}</small></div>`).join('');
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('is-out'), 4200);
  setTimeout(() => el.remove(), 4800);
}

// ---------- 명성 점수 ----------
// 시즌이 끝날 때마다 점수가 쌓이고(engine/run.mjs), 런 중에도 헤더에 보인다.
// 런 종료 때 등급·내 기록 순위·칭호가 붙는다.
const PRESTIGE_LABELS = {
  league: '리그 성적', surplus: '안전 승점 초과', combo: '연속 승격·우승', streak: '연속 우승 보너스',
  demand: '이사진 요구 달성', ucl: '챔피언스리그', double: '더블', retire: '커리어 완결',
};
const PRESTIGE_ROW_ORDER = ['league', 'surplus', 'combo', 'streak', 'demand', 'ucl', 'double', 'retire'];
function prestigeState() {
  return (currentState.prestige ??= { total: 0, rows: {}, combo: 0, titleStreak: 0, beat: false });
}
// 점수를 더한다. 이번 런이 내 최고 기록을 처음 넘기는 순간 알려 준다.
function awardPrestige(rows) {
  const p = prestigeState();
  const best = loadRecords(localStorage).bestScore ?? 0;
  let sum = 0;
  for (const r of rows) { p.rows[r.id] = (p.rows[r.id] ?? 0) + r.value; p.total += r.value; sum += r.value; }
  if (best > 0 && !p.beat && p.total > best) {
    p.beat = true;
    const el = document.createElement('div');
    el.className = 'achtoast';
    el.innerHTML = `<div class="achtoast__item"><span>★ 내 최고 기록 경신</span><b>명성 ${p.total}점</b><small>이전 최고 ${best}점을 넘었습니다</small></div>`;
    document.body.appendChild(el);
    setTimeout(() => el.classList.add('is-out'), 4200);
    setTimeout(() => el.remove(), 4800);
  }
  return sum;
}

// 우승 트로피 연출(전체 화면). kind: 'league' | 'ucl'. lines: 우승까지의 여정(챔스) 같은 보조 문구.
// 챔피언스리그는 암전 → 불꽃놀이 → 트로피가 올라오는 시상식 순서로 길게 보여준다.
function showTrophy({ kind, title, sub, lines = [], reward = '' }, onClose = () => {}) {
  const el = document.createElement('div');
  el.className = `trophy trophy--${kind}`;
  const confetti = Array.from({ length: kind === 'ucl' ? 46 : 28 }, (_, i) => `<i style="--x:${Math.round(Math.random() * 100)}%;--d:${(2.4 + Math.random() * 2.4).toFixed(2)}s;--w:${(Math.random() * 2.2).toFixed(2)}s;--c:${['#dda63a', '#f0ead9', '#4ca86a', '#5b9bd5', '#e2564d'][i % 5]}"></i>`).join('');
  // 불꽃놀이: 터지는 점마다 14개 불똥이 사방으로 퍼진다(CSS 변수로 방향/거리).
  const bursts = kind === 'ucl' ? Array.from({ length: 6 }, (_, b) => {
    const x = 12 + Math.round(Math.random() * 76); const y = 6 + Math.round(Math.random() * 24);
    const color = ['#f6d77a', '#8fd0ff', '#ff9c8f', '#9af0b5', '#ffffff', '#f6d77a'][b];
    const sparks = Array.from({ length: 14 }, (_, s) => `<i style="--a:${Math.round((360 / 14) * s)}deg;--r:${46 + Math.round(Math.random() * 26)}px"></i>`).join('');
    return `<div class="trophy__burst" style="left:${x}%;top:${y}%;--c:${color};--w:${(1.1 + b * 0.55).toFixed(2)}s">${sparks}</div>`;
  }).join('') : '';
  el.innerHTML = `
    <div class="trophy__rays"></div>
    <div class="trophy__fireworks">${bursts}</div>
    <div class="trophy__confetti">${confetti}</div>
    <div class="trophy__body">
      <svg class="trophy__cup" viewBox="0 0 100 100" aria-hidden="true">
        <defs><linearGradient id="trophyGold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6d77a"/><stop offset="0.55" stop-color="#dda63a"/><stop offset="1" stop-color="#9c6a17"/></linearGradient></defs>
        <path d="M30 14 H70 V38 C70 52 62 60 50 62 C38 60 30 52 30 38 Z" fill="url(#trophyGold)"/>
        <path d="M30 20 H17 C17 37 24 43 33 45 M70 20 H83 C83 37 76 43 67 45" fill="none" stroke="url(#trophyGold)" stroke-width="4" stroke-linecap="round"/>
        <rect x="45" y="62" width="10" height="14" fill="url(#trophyGold)"/>
        <rect x="31" y="76" width="38" height="9" rx="2" fill="url(#trophyGold)"/>
        <path d="M40 20 C40 34 42 44 47 52" fill="none" stroke="#fff6cf" stroke-opacity="0.55" stroke-width="3" stroke-linecap="round"/>
      </svg>
      <div class="trophy__kicker">${kind === 'ucl' ? 'CHAMPIONS OF EUROPE' : 'CHAMPION'}</div>
      <h2 class="trophy__title">${esc(title)}</h2>
      <p class="trophy__sub">${esc(sub)}</p>
      ${lines.length ? `<ul class="trophy__journey">${lines.map((l, i) => `<li style="--i:${i}">${esc(l)}</li>`).join('')}</ul>` : ''}
      ${reward ? `<p class="trophy__reward">${esc(reward)}</p>` : ''}
      <button class="cta" id="trophy-close">계속</button>
    </div>`;
  document.body.appendChild(el);
  el.querySelector('#trophy-close').onclick = () => { el.remove(); onClose(); };
}

// 선수 등급 팝업: 어떤 등급이 있는지만 낮은 순서대로 보여주고, 누른 카드의 등급을 강조한다.
function showTierInfo(current) {
  const ids = [...Object.keys(PLAYER_TIERS), 'god'];
  const rows = ids.map((id, i) => `<li class="tiermodal__row${id === current ? ' is-now' : ''}" style="--tier:var(--t-${id})"><i class="n">${i + 1}</i><b>${TIER_LABELS[id]}</b>${id === current ? '<span>이 선수</span>' : ''}</li>`).join('');
  const el = document.createElement('div');
  el.className = 'tiermodal';
  el.innerHTML = `<div class="tiermodal__card">
      <h2>선수 등급</h2>
      <ul class="tiermodal__list">${rows}</ul>
      <p class="note">아래로 갈수록 높은 등급입니다.</p>
      <button class="cta" id="tiermodal-close">닫기</button>
    </div>`;
  document.body.appendChild(el);
  const close = () => el.remove();
  el.querySelector('#tiermodal-close').onclick = close;
  el.onclick = (e) => { if (e.target === el) close(); };
}

const LEAGUE_NAMES = { tier5: '5부', tier4: '4부', tier3: '3부', tier2: '2부', tier1: '1부' };
const UCL_RESULT_SHORT = { league: '리그 단계', playoff: '플레이오프', r16: '16강', qf: '8강', sf: '4강', final: '준우승', champion: '우승' };

function renderRecords() {
  const r = loadRecords(localStorage);
  const have = new Set(unlockedIds(r));
  const stat = (label, value) => `<div class="recstat"><span>${label}</span><b class="n">${value}</b></div>`;
  const groups = ['커리어', '리그', '챔피언스리그', '명예'];
  const achHtml = groups.map((g) => `
    <h3 class="chemgroup__title">${g}</h3>
    <ul class="ach">
      ${ACHIEVEMENTS.filter((a) => a.group === g).map((a) => {
        const on = have.has(a.id);
        const prog = a.progress ? a.progress(r) : null;
        return `<li class="ach__item${on ? ' is-on' : ''}">
          <span class="ach__icon">${on ? '🏆' : '🔒'}</span>
          <div><b>${esc(a.label)}</b><small>${esc(a.desc)}</small>${prog && !on ? `<em>${prog[0]} / ${prog[1]}</em>` : ''}</div>
        </li>`;
      }).join('')}
    </ul>`).join('');
  const hist = [...r.history].reverse().slice(0, 12).map((h) => `<li>
      <span class="n">${h.season}시즌</span><span>${esc(h.club)} · ${LEAGUE_NAMES[h.tierId]}</span>
      <b>${h.result === 'champion' ? '우승' : h.rank ? `${h.rank}위` : ''}</b>
      ${h.ucl ? `<em>챔스 ${UCL_RESULT_SHORT[h.ucl]}</em>` : ''}
    </li>`).join('');

  setScreen(`
    <div class="records">
      <button class="backlink" id="records-back">← 뒤로</button>
      <h1 class="records__title">기록 · 업적</h1>
      <div class="panel">
        <div class="panel__head"><h2>역대 기록</h2></div>
        <div class="recstats">
          ${stat('시작한 런', r.runs)}${stat('치른 시즌', r.seasons)}${stat('승격', r.promotions)}${stat('최고 리그', LEAGUE_NAMES[r.highestTier])}
          ${stat('최고 명성 점수', r.bestScore ?? 0)}${stat('칭호', titleProgress(r.careerScore ?? 0).title)}${stat('최장 런(시즌)', r.longestRun ?? 0)}${stat('최장 연속 우승', r.bestStreak ?? 0)}${stat('최다 승점', r.maxPoints ?? 0)}
        </div>
      </div>
      <div class="panel">
        <div class="panel__head"><h2>내 기록 TOP 10</h2><span class="panel__count">누적 <b class="n">${r.careerScore ?? 0}</b>점</span></div>
        ${(r.topRuns ?? []).length ? `<ol class="toprun">${r.topRuns.map((x, i) => `<li><span class="n">${i + 1}</span><b>${x.score}</b><i class="grade-chip grade--${gradeOf(x.score)}">${gradeOf(x.score)}</i><span>${esc(x.club)} · ${LEAGUE_NAMES[x.tierId] ?? ''} · ${x.seasons}시즌</span></li>`).join('')}</ol>` : '<p class="note">아직 끝낸 런이 없습니다.</p>'}
      </div>
      <div class="panel">
        <div class="panel__head"><h2>리그 우승</h2></div>
        <div class="recstats recstats--five">
          ${Object.entries(LEAGUE_NAMES).reverse().map(([id, name]) => stat(name, r.titles[id])).join('')}
        </div>
      </div>
      <div class="panel">
        <div class="panel__head"><h2>챔피언스리그</h2><span class="panel__count">진출 ${r.uclEntries}회</span></div>
        <div class="recstats recstats--five">
          ${stat('우승', r.ucl.champion)}${stat('준우승', r.ucl.final)}${stat('4강', r.ucl.sf)}${stat('8강', r.ucl.qf)}${stat('16강', r.ucl.r16)}
        </div>
        <p class="note">리그·챔스 더블 ${r.doubles}회 · 16강 이상 ${uclReached(r, 'r16')}회</p>
      </div>
      <div class="panel">
        <div class="panel__head"><h2>업적</h2><span class="panel__count">${have.size} / ${ACHIEVEMENTS.length}</span></div>
        ${achHtml}
      </div>
      ${hist ? `<div class="panel"><div class="panel__head"><h2>최근 시즌</h2></div><ul class="rechist">${hist}</ul></div>` : ''}
    </div>
  `);
  document.getElementById('records-back').onclick = () => renderClubButtons();
}

function renderClubButtons() {
  const clubs = buildStartClubOffers(); // 강·중·약 구단이 런마다 다르게 뽑힌다
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
${(() => {
        const rec = loadRecords(localStorage);
        const tp = titleProgress(rec.careerScore ?? 0);
        const bg = rec.bestScore ? gradeOf(rec.bestScore) : null;
        return `<div class="rankcard">
          <div class="rankcard__top"><b>${esc(tp.title)}</b><span>${bg ? `최고 ${rec.bestScore}점 <i class="grade-chip grade--${bg}">${bg}</i>` : '첫 런을 시작해 보세요'}</span></div>
          <div class="rankbar"><i style="width:${Math.round(tp.progress * 100)}%"></i></div>
          <small>${tp.next ? `다음 칭호 ${esc(tp.next)}까지 ${tp.remaining}점` : '최고 칭호'}</small>
        </div>`;
      })()}
      <button class="reroll start__records" id="records-btn">🏆 기록 · 업적</button>
      ${telemetryConfigured() ? `<p class="note start__telemetry">플레이 통계가 익명으로 수집됩니다(이름 등 개인정보 없음). <button type="button" class="linkbtn" id="telemetry-toggle">${telemetryOn() ? '끄기' : '켜기'}</button></p>` : ''}
      <div class="clubs">
        ${resume}
        ${clubs.map((club, i) => `
          <button class="club" data-club="${club.id}" style="--kit:${club.kit}">
            ${renderCrest(club, { size: 40 })}
            <div class="club__body">
              <div class="club__name">${esc(club.name)}<small class="club__klass">${club.klassLabel}</small>${i === clubs.findIndex((c) => c.klass === 'mid') ? '<em class="club__rec">처음이라면 추천</em>' : ''}</div>
              <div class="club__line"><span class="club__tag club__tag--up">강점</span><span>${esc(club.strength)}</span></div>
              <div class="club__line"><span class="club__tag club__tag--down">약점</span><span>${esc(club.weakness)}</span></div>
            </div>
          </button>`).join('')}
      </div>
      <p class="start__copy">© 2026 유시헌 · 모든 권리 보유</p>
    </div>
  `);

  document.getElementById('records-btn')?.addEventListener('click', renderRecords);
  document.getElementById('telemetry-toggle')?.addEventListener('click', (e) => {
    setTelemetry(!telemetryOn());
    e.currentTarget.textContent = telemetryOn() ? '끄기' : '켜기';
  });
  document.getElementById('resume-btn')?.addEventListener('click', () => {
    currentState = withRunDefaults(saved, DEFAULT_FORMATION); // 구버전 세이브 호환
    if (currentState.ucl) renderUcl(); else renderMarket();
  });
  for (const club of clubs) {
    document.querySelector(`[data-club="${club.id}"]`).onclick = () => startRun(club);
  }
}

let currentState = null;

function startRun(club) {
  updateRecords(recordRunStart);
  const baseFunds = Math.round(calculateStartingFunds(0) * club.startingFundsMultiplier * fundsScale('tier5', 1));
  const rawSquad = generateStartingSquad().map(toSquadPlayer).map(stripLockedTags);
  // 시작 감독은 루키(배율 ×1.00) - 예전엔 택티션(×1.05)이라 시작하자마자
  // 공짜 보너스가 붙어서, 시장을 한 번도 안 만져도(12주 내내 "다음 주로"만
  // 눌러도) 5부에서 77%가 잔류했다(직접 실측). "바닥에서 시작한다"는
  // 오프닝 서사와도 루키 쪽이 더 맞는다.
  const manager = generateProceduralManager('rookie');
  const staff = assignRandomStaff();

  // 초기 정비기(Week 1~3) 이벤트: 자금·스쿼드가 바뀔 수 있다.
  // 위기 관리형 감독은 위기 이벤트(FFP 긴급 감사)를 무효화한다.
  // 헤어드라이어: 영입 즉시 적응도 +20
  const startChemistry = manager.trait === 'hairdryer' ? Math.min(100, CHEMISTRY_START + 20) : CHEMISTRY_START;
  const rolled = rollSeasonEvent(
    { squad: rawSquad, funds: baseFunds, chemistry: startChemistry, baseFunds, crisisImmune: manager.trait === 'crisisManager', manager, recent: [] },
    'summer'
  );
  const { funds, squad, chemistry, message: eventMessage } = rolled;
  // 이벤트 없음(id === null)이면 팝업을 안 띄운다 - "아무 일도 없었다"는
  // 알림은 알림이 아니라 소음이다. good/bad는 팝업 색만 가른다.
  const eventTone = rolled.tone;

  currentState = {
    club,
    squad,
    manager,
    staff,
    availableGodPlayers: [...GOD_PLAYERS], // 이번 런에서 아직 영입 안 한 GOD 카드
    scoutTargetTag: null, // 스카우터 목표 태그(보통·어려움 태그 중 하나)
    scoutTargetPos: null, // 스카우터 목표 포지션(베테랑 이상)
    eventChoice: rolled.choice ?? null, // 선택형 이벤트(고르기 전까지 저장)
    eventHistory: rolled.id ? [rolled.id] : [], // 최근 이벤트(같은 게 반복되지 않게 가중치를 낮춘다)
    harmonyStreak: 0, // 감독 불화 연속 횟수(2번이면 감독 사임)
    harmonyShield: !!rolled.state?.harmonyShield, // 전술 분석관: 다음 불화 1회 면제
    nextGrantBonus: 0, // 스폰서 장기 계약: 다음 시즌 지급액 가산 비율
    pendingResignation: null, // 감독 자진 사임: 새 감독을 선임해야 한다
    chemistry,
    funds,
    eventMessage,
    eventTone,
    expectationModifier: club.expectationModifier ?? 0, // 이사진 요구치: 시즌 목표선 가감(탑독 +, 언더독 -)
    leagueTierId: 'tier5',
    highestTierId: 'tier5', // 이번 런에서 도달한 최고 리그 (명성 점수용)
    titles: 0, // 우승 횟수
    uclTitles: 0, // 챔피언스리그 우승 횟수 (1부에서만 발생)
    titlesByTier: {}, // 리그별 우승 횟수(명예 점수)
    titleStreak: 0, // 지금 연속 리그 우승 횟수
    streakPoints: 0, // 연속 우승 보너스 누적(명예 점수)
    uclResults: {}, // 챔피언스리그 결과별 횟수(명예 점수)
    doubles: 0, // 더블 횟수
    prestige: { total: 0, rows: {}, combo: 0, titleStreak: 0, beat: false }, // 명성 점수(이번 런)
    missedTargetCount: 0, // 기대 목표 미달 누적 (스펙 2절: 3회면 해임)
    seasonNumber: 1,
    startedAt: Date.now(), // 첫 영입까지 걸린 시간 통계용
    telemetryRun: Math.random().toString(36).slice(2, 8),
    formation: DEFAULT_FORMATION,
    manualOverrides: {},
    benchOverrides: {},
    selectedSlot: null,
    tab: 'draft',
    week: SUMMER_MARKET_WEEKS[0],
    phase: 'summer',
    transactedThisWeek: false,
    shopOffer: [],
    managerOffer: generateManagerOffer(3, Math.random, manager.id, 'tier5'),
    staffOffer: generateStaffOffer(Math.random, 'tier5'),
    firstHalfPoints: null,
    listedForSale: [], // { card, method, resolveWeek }
    boardDemand: null, // 이번 시즌 고른 이사진 요구 카드 { cardId, difficulty }
    seasonTrack: { spent: 0, winterTransactions: 0, income: 0, start: funds }, // 요구 카드 판정 + 자금 흐름 표시용
    boardTrustUsed: false,
    promotionFundsBonusPending: false,
    freshBudget: false,
    pendingTransferProceeds: 0,
  };
  currentState.shopOffer = newShopOffer();
  currentState.managerOffer = generateManagerOffer(3, Math.random, currentState.manager?.id, currentState.leagueTierId);
  currentState.staffOffer = generateStaffOffer(Math.random, currentState.leagueTierId);
  if (!loadFlags().tutorialDone) ensureUpgradeOffer();
  renderNaming();
}

// ---------- 튜토리얼(모두에게 한 번, 건너뛸 수 있다) ----------
// 0 목표 → 1 영입 → 2 태그 → 3 전술 탭 → 4 전술 화면 → 5 다음 주로 → 6 전반기 결산 → 끝
const tutStep = () => { const f = loadFlags(); return f.tutorialDone ? -1 : f.tutorialStep; };
function tutSet(step) {
  updateFlags((f) => { f.tutorialStep = step; if (step > 6) f.tutorialDone = true; return f; });
  track('tutorial', { step });
}
function tutSkip() {
  const step = tutStep();
  updateFlags((f) => { f.tutorialDone = true; return f; });
  track('tutorial', { skip: step });
  clearSpot();
}
function tutorialTick(where) {
  const step = tutStep();
  if (step < 0 || document.querySelector('#eventmodal-root .eventmodal')) { clearSpot(); return; }
  const go = (n) => () => { tutSet(n); tutorialTick(where); };
  if (where === 'intro') {
    if (step === 0) showSpot({ selector: '.goalline', text: '이 점수 밑으로 떨어지면 해임이에요. 우선 이 위로 버티는 게 목표예요.', ok: '확인', onOk: go(1), onSkip: tutSkip });
    return;
  }
  if (where === 'half') {
    showSpot({ selector: '.verdict', text: '전반기 결산이에요. 목표 페이스와 비교해 보고, 겨울 시장에서 보강하세요.', ok: '확인', onOk: go(7), onSkip: tutSkip });
    return;
  }
  const onTactics = currentState.tab === 'tactics';
  if (step === 1) {
    const pick = currentState.shopOffer.find((c) => hasUpgrade([c]));
    showSpot({ selector: pick ? `[data-buy="${pick.id}"]:not([disabled])` : '.deal__buy:not([disabled])', text: '지금 선발보다 강한 선수예요. 영입해 보세요.', onSkip: tutSkip });
  } else if (step === 2) {
    if (!showSpot({ selector: '#tagpanel-toggle', text: '이게 기본기 태그예요. 같은 태그를 가진 선수가 모일수록 팀이 강해져요.', ok: '확인', onOk: go(3), onSkip: tutSkip })) { tutSet(3); tutorialTick(where); }
  } else if (step === 3) showSpot({ selector: '[data-tab="tactics"]', text: '전술 탭에서 선발 11명을 볼 수 있어요.', onSkip: tutSkip });
  else if (step === 4) {
    if (onTactics) showSpot({ selector: '.pitch', text: '선발은 자동으로 정해져요. 선수를 눌러 직접 바꿀 수도 있어요.', ok: '확인', onOk: go(5), onSkip: tutSkip });
    else { tutSet(3); tutorialTick(where); }
  } else if (step === 5) showSpot({ selector: '#next-week-btn', text: '다음 주로 넘기면 시즌이 진행돼요. 8주 뒤 전반기가 시작됩니다.', onSkip: tutSkip });
  else clearSpot();
}

const KIT_CHOICES = ['#ccff00', '#ff6a3d', '#3aa0ff', '#ffd23a', '#c06bff', '#f2f2f2'];

// 구단주(단장) 이름, 구단 이름(미리 채워짐), 유니폼 색. 전부 건너뛸 수 있다. 이름은 화면 문구에만 쓰고 통계로는 보내지 않는다.
function renderNaming() {
  const { club } = currentState;
  let kit = club.kit;
  setScreen(`
    <div class="verdict">
      <div class="verdict__label">취임</div>
      <div class="verdict__result" style="color:var(--light);font-size:var(--fs-title)">구단을 소개해 주세요</div>
    </div>
    <div class="panel naming">
      <label class="naming__field"><span>구단주 이름</span><input id="owner-input" maxlength="12" autocomplete="off" placeholder="비워 두어도 됩니다"></label>
      <label class="naming__field"><span>구단 이름</span><input id="club-input" maxlength="20" autocomplete="off" value="${esc(club.name)}"></label>
      <div class="naming__kits" role="group" aria-label="유니폼 색">${KIT_CHOICES.map((k) => `<button type="button" class="kitdot${k === kit ? ' is-on' : ''}" data-kit="${k}" style="--kit:${k}" aria-label="유니폼 색 ${k}"></button>`).join('')}</div>
    </div>
  `, '<button class="cta" id="naming-next">다음</button><button class="reroll" id="naming-skip" style="margin-top:var(--s2);width:100%">건너뛰기</button>');
  document.querySelectorAll('[data-kit]').forEach((b) => {
    b.onclick = () => {
      kit = b.dataset.kit;
      document.querySelectorAll('[data-kit]').forEach((x) => x.classList.toggle('is-on', x === b));
    };
  });
  const done = (apply) => {
    if (apply) {
      const owner = document.getElementById('owner-input').value.trim().slice(0, 12);
      const name = document.getElementById('club-input').value.trim().slice(0, 20);
      currentState.ownerName = owner;
      currentState.club = { ...club, name: name || club.name, kit };
    }
    renderCareerIntro();
  };
  document.getElementById('naming-next').onclick = () => done(true);
  document.getElementById('naming-skip').onclick = () => done(false);
}

// 첫 런의 첫 영입 후보에는 살 수 있고 지금 선발보다 강한 카드가 반드시 1장 있다(튜토리얼에서 "영입해 보세요"가 막히지 않게).
function hasUpgrade(offer) {
  const { lineup } = pickBestXI(currentState.squad, currentFormation());
  return offer.some((c) => !c.id.startsWith('god-') && cardPrice(c) <= currentState.funds
    && lineup.some((p) => p.position === c.position && c.baseOVR > p.baseOVR));
}
function ensureUpgradeOffer() {
  for (let i = 0; i < 40 && !hasUpgrade(currentState.shopOffer); i++) currentState.shopOffer = newShopOffer();
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

// 이사진 요구 카드 3장(쉬움/보통/어려움) 중 하나를 고르는 화면. 안 골라도 되고,
// 못 채워도 페널티는 없다 - 달성하면 다음 시즌 자금 보너스만 붙는다.
function demandCardHtml(card, attr) {
  const reward = Math.round(BOARD_DEMAND_REWARD[card.difficulty] * 100);
  return `<button class="demandcard demandcard--${card.difficulty}" ${attr}="${card.id}">
    <span class="demandcard__level">${DIFFICULTY_LABELS[card.difficulty]}</span>
    <span class="demandcard__text">${esc(card.text)}</span>
    <b class="demandcard__reward">+${reward}%<small>달성 시 다음 시즌 자금</small></b>
  </button>`;
}

function renderDemandChoice(bias, onDone) {
  const offer = drawDemandOffer(Math.random, bias, currentState.leagueTierId);
  setScreen(`
    <div class="verdict">
      <div class="verdict__label">이사진 요구</div>
      <div class="verdict__result" style="color:var(--light);font-size:var(--fs-title)">${esc(currentState.club.name)}</div>
      <p class="note" style="text-align:center">이사진이 시즌 목표와 별개로 조건을 하나 제시합니다. 하나를 고르세요. 달성하면 보너스가 있고, 못 해도 불이익은 없습니다.</p>
    </div>
    <div class="demandcards">${offer.map((c) => demandCardHtml(c, 'data-demand')).join('')}</div>
  `, '<button class="reroll" id="skip-demand-btn">요구 없이 시작</button>');
  document.querySelectorAll('[data-demand]').forEach((el) => {
    el.onclick = () => {
      const card = getDemand(el.dataset.demand);
      currentState.boardDemand = { cardId: card.id, difficulty: card.difficulty };
      onDone();
    };
  });
  document.getElementById('skip-demand-btn').onclick = () => { currentState.boardDemand = null; onDone(); };
}

function renderCareerIntro() {
  const { club, manager, squad } = currentState;
  const tier = effectiveTier(currentState.leagueTierId);
  const scale = tier.championPoints * 1.1;
  const at = (v) => `${Math.min(100, (v / scale) * 100)}%`;
  const { lineup, bench } = pickBestXI(squad, currentFormation());
  const teamPower = computeTeamPower(lineup, bench, manager.tier, currentState.chemistry, null, powerExtras());
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
      <p class="goalline"><b>${tier.safePoints}점</b> 밑이면 해임입니다</p>
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
    <details class="more">
    <summary>자세히 보기</summary>
    <div class="panel">
      <div class="panel__head"><h2>이번 시즌 목표</h2></div>
      <p class="note" style="color:${zone === 'relegation' ? 'var(--debit)' : 'var(--turf)'}"><b>${ZONE_VERDICT[zone]}</b> (지금 스쿼드 그대로면 예상 승점 ${projectedPoints.toFixed(0)}점)</p>
      <ul class="summary">
        <li><span>안전권</span><b>${tier.safePoints}점</b></li>
        <li><span>승격권</span><b>${tier.targetPoints}점</b></li>
        <li><span>우승</span><b>${tier.championPoints}점</b></li>
        <li><span><b>이사진 목표</b></span><b>${currentBoardGoal()}점</b></li>
        <li><span>시작 팀 전력</span><b>${teamPower.toFixed(1)}</b></li>
      </ul>
      <p class="note"><b>이사진 목표 ${currentBoardGoal()}점.</b> ${BOARD_RULE_TEXT}</p>
      <p class="note">승점은 전/후반기 합산입니다. 안전권을 넘기지 못하면 해임, 목표를 3시즌 연속 못 넘기면 경질됩니다.</p>
      ${club.weakness ? `<p class="note">약점: ${esc(club.weakness)}. 이 약점을 염두에 두고 시즌을 준비하세요.</p>` : ''}
    </div>
    <div class="panel">
      <div class="panel__head"><h2>감독</h2></div>
      <p class="staffline">
        <span>감독 <b>${esc(manager.name)}</b> ${MANAGER_TIER_LABELS[manager.tier] ?? manager.tier}${manager.trait ? ` / ${MANAGER_TRAIT_LABELS[manager.trait] ?? manager.trait}` : ''}</span>
      </p>
    </div>
    </details>
  `, '<button class="cta" id="start-season-btn">시즌 시작</button>');

  // 첫 시즌에는 이사진 요구를 고르지 않는다(2시즌부터 등장).
  tutorialTick('intro');
  document.getElementById('start-season-btn').onclick = () => (isUnlocked('board') ? renderDemandChoice(currentState.club.demandBias ?? {}, () => renderMarket()) : renderMarket());
  document.getElementById('back-to-clubs-btn').onclick = () => renderClubButtons();
}

// 수석 스카우터 등급에 따른 매주 매물 수 (스펙 5.3절: 3→4→4→5)
// 이번 주에 막 교체한 스태프는 아직 효과가 없다(스펙: "교체한 주는 신규
// 스태프 효과 미발동, 소급 없음") - 기본값으로 취급한다.
function isStaffFreshThisWeek(role) {
  return currentState.staff[role].hiredWeek === currentState.week;
}

// 스카우터 목표(태그/포지션): 이번 주 새로 영입한 스카우터가 아니면 등급이 허락하는 목표를 매주 1장씩 보장받는다.
function scoutCaps() {
  if (isStaffFreshThisWeek('headScout')) return SCOUT_TARGETS_BY_LEVEL.academy;
  return SCOUT_TARGETS_BY_LEVEL[currentState.staff.headScout.level] ?? SCOUT_TARGETS_BY_LEVEL.academy;
}
function scoutTargetSlots() {
  return scoutCaps().tag && currentState.scoutTargetTag ? 1 : 0;
}
// 아직 열리지 않은 태그(보통/어려움)와 특수 성향은 새로 만드는 선수에게 붙이지 않는다. GOD 카드는 그대로 둔다.
function stripLockedTags(card) {
  if (card.id?.startsWith('god-')) return card;
  const flags = loadFlags();
  const open = (t) => {
    const g = PLAYSTYLE_TAGS[t]?.grade ?? 'basic';
    return g === 'basic' || flags.unlocked[g];
  };
  const out = { ...card, playstyleTags: (card.playstyleTags ?? []).filter(open) };
  if (card.specialTrait && !flags.unlocked.traits) {
    out.price = Math.round(card.price / (TRAIT_PRICE_MULT[card.specialTrait] ?? 1));
    out.specialTrait = null;
  }
  return out;
}

function newShopOffer() {
  const slots = scoutTargetSlots();
  const position = scoutCaps().position ? currentState.scoutTargetPos ?? null : null;
  const boost = isStaffFreshThisWeek('headScout') ? 0 : SCOUT_QUALITY_BOOST_BY_LEVEL[currentState.staff.headScout.level] ?? 0;
  return generateShopOffer(scoutOfferSize(), currentState.availableGodPlayers, Math.random, currentState.leagueTierId,
    slots ? currentState.scoutTargetTag : null, slots, position, boost, scoutCaps().combined).map(stripLockedTags);
}
function scoutOfferSize() {
  if (isStaffFreshThisWeek('headScout')) return SHOP_OFFER_SIZE;
  return SCOUT_SHOP_OFFER_SIZE_BY_LEVEL[currentState.staff.headScout.level] ?? SHOP_OFFER_SIZE;
}

// 스카우터 등급이 높을수록 다시 뽑기 비용이 싸진다
function rerollCost() {
  if (isStaffFreshThisWeek('headScout')) return SHOP_REROLL_COST;
  return Math.round(SHOP_REROLL_COST * (1 - (SCOUT_REROLL_DISCOUNT_BY_LEVEL[currentState.staff.headScout.level] ?? 0)));
}

// 스펙 2절: 시즌마다 자금을 지급하고, 남은 돈은 그 위에 이월한다(상한 30%).
// 지급 시점을 여기로 모은 이유: 다음 시즌 리그와 구단은 거취 선택이 끝나야
// 확정되고, 잔류/이적/승격 위기 세 경로가 전부 startNewSeason으로 합류한다.
// 예전에는 후반기 결산에서 현재 리그 기준으로 이월 상한만 걸었다 - 지급이
// 아예 없어서 2시즌부터 무일푼이었고, 승격 시 상한이 한 단계 낮게 잡혔다.
function grantSeasonFunds() {
  const base = calculateStartingFunds(getLadderIndex(currentState.leagueTierId))
    * currentState.club.startingFundsMultiplier * fundsScale(currentState.leagueTierId, currentState.seasonNumber);
  // 새 구단(선수단 초기화)은 전액, 승격해서 선수단을 유지하면 70%, 같은 리그에 남으면 60%.
  // 잔류 시즌엔 선수단을 많이 갈 필요가 없어서 큰돈이 필요 없다.
  const promoted = currentState.freshBudget
    ? base
    : currentState.promotionFundsBonusPending
      ? base * PROMOTION_STAY_FUNDS_RATIO
      : base * SAME_LEAGUE_FUNDS_RATIO;
  // 승격 못 하고 같은 리그에 눌러앉을수록(목표 미달 누적) 이사진이 지갑을
  // 닫는다. 승격하면 missedTargetCount가 0으로 리셋되니 이 페널티도 같이 풀린다.
  const stagnationPenalty = Math.max(0, 1 - currentState.missedTargetCount * STAGNATION_FUNDS_PENALTY_PER_MISS);
  const grant = Math.round(promoted * stagnationPenalty * (1 + (currentState.nextGrantBonus ?? 0)));
  currentState.nextGrantBonus = 0;
  currentState.promotionFundsBonusPending = false;
  // 이월은 "구단 잔류 시"만, 그것도 작게. 남은 돈 중 상한을 넘는 몫은 구단이 운영 명분으로 회수한다.
  // 구단을 옮기면 남은 돈은 따라오지 않는다.
  const leftover = currentState.freshBudget ? 0 : currentState.funds;
  const recall = recallFunds(leftover, grant);
  const carryover = currentState.freshBudget ? 0 : recall.carried;
  currentState.fundsReport = { leftover: Math.round(leftover), carried: carryover, recalled: recall.recalled, items: recall.items, grant };
  currentState.freshBudget = false;
  // 순서 주의: 이적료는 이월이 아니라 지급 뒤에 더한다. 지급 전에 더하면
  // 이월 상한(지급액의 30%)에 걸려 버튼에 적힌 금액보다 적게 들어온다.
  const proceeds = currentState.pendingTransferProceeds ?? 0;
  currentState.pendingTransferProceeds = 0;
  currentState.funds = grant + carryover + proceeds;
}

// 시즌 이벤트를 굴려 상태에 반영한다(여름 시작/겨울 진입). 이벤트가 없으면 팝업도 없다.
function applySeasonEvent(phase) {
  const r = rollSeasonEvent(
    {
      squad: currentState.squad, funds: currentState.funds, chemistry: currentState.chemistry,
      baseFunds: seasonBaseGrant(), crisisImmune: currentState.manager.trait === 'crisisManager',
      manager: currentState.manager, recent: currentState.eventHistory ?? [],
    },
    phase,
    Math.random,
    currentState.club.eventBias ?? {}
  );
  currentState.squad = r.squad;
  currentState.funds = r.funds;
  currentState.chemistry = r.chemistry;
  currentState.eventMessage = r.message;
  currentState.eventTone = r.tone;
  currentState.eventChoice = r.choice;
  Object.assign(currentState, r.state);
  if (r.id) currentState.eventHistory = [...(currentState.eventHistory ?? []), r.id].slice(-4);
}

// 선택형 이벤트: 선택지 계산에 쓰는 현재 상태
const eventCtx = () => ({
  squad: currentState.squad, funds: currentState.funds, chemistry: currentState.chemistry,
  baseFunds: seasonBaseGrant(), manager: currentState.manager,
});
function resolveEventChoice(optionIndex) {
  const r = resolveChoice(currentState.eventChoice, optionIndex, eventCtx());
  currentState.squad = r.squad;
  currentState.funds = r.funds;
  currentState.chemistry = r.chemistry;
  Object.assign(currentState, r.state);
  if (r.leaving) returnGodToPool(r.leaving);
  currentState.eventChoice = null;
  currentState.eventTone = null;
  renderMarket(r.message);
}

// 승격/잔류 후 같은 구단으로 새 시즌 시작 — 스펙 4절: 선수단 유지, 시장 상태만 초기화
function startNewSeason() {
  grantSeasonFunds();
  // 지난 시즌 이사진 목표 초과 보상(있으면) - 팝업에 결과를 같이 띄운다.
  const review = currentState.pendingBoardReview ?? null;
  currentState.pendingBoardReview = null;
  if (review) {
    currentState.funds += review.funds + (review.demand?.achieved ? review.demand.funds : 0);
    if (review.funds > 0) currentState.chemistry = Math.min(100, currentState.chemistry + review.chemistry);
  }
  currentState.boardDemand = null;
  currentState.seasonTrack = { spent: 0, winterTransactions: 0, income: 0, start: currentState.funds };
  currentState.seasonNumber += 1;
  const unlockedNow = unlockForSeason(currentState.seasonNumber);
  currentState.week = SUMMER_MARKET_WEEKS[0];
  currentState.phase = 'summer';
  currentState.transactedThisWeek = false;
  currentState.firstHalfPoints = null;
  currentState.listedForSale = [];
  currentState.squad = currentState.squad.map((p) => ({
    ...p,
    acquiredThisSeason: false,
    boughtThisSeason: false,
    seasonsAtClub: (p.seasonsAtClub ?? 0) + 1,
  }));
  // 포지션 공백 때우려고 콜업한 긴급 유스는 한 시즌만 뛰고 계약이 끝난다.
  const youthLeft = currentState.squad.filter((p) => p.emergencyYouth);
  currentState.squad = currentState.squad.filter((p) => !p.emergencyYouth);
  // 가격 재계산은 나이를 먹은 뒤(아래 aged) 한 번에 한다.
  // 나이 한 살: 어린 선수는 크고 서른 줄부터 떨어지며, 은퇴할 선수는 떠난다. 변화는 브리핑 팝업에서 알린다.
  const aged = ageSquad(currentState.squad.map((p) => (p.slump ? { ...p, baseOVR: p.baseOVR + p.slump, slump: 0 } : p)));
  currentState.squad = aged.squad.map(repricePlayer); // OVR이 바뀌었으니 몸값(재계약비·판매가)도 현재 OVR 기준으로 다시 매긴다
  const agingReport = { changes: aged.changes, retired: aged.retired, youthLeft: youthLeft.map((p) => ({ name: p.name, position: p.position })) };
  applySeasonEvent('summer'); // 지난 시즌 이벤트 문구는 여기서 새로 덮어쓴다
  currentState.shopOffer = newShopOffer();
  currentState.managerOffer = generateManagerOffer(3, Math.random, currentState.manager?.id, currentState.leagueTierId);
  currentState.staffOffer = generateStaffOffer(Math.random, currentState.leagueTierId);

  let banner = `${currentState.club.name}, ${getLeagueTier(currentState.leagueTierId).label} 새 시즌 시작`;
  if (currentState.missedTargetCount > 0) {
    const cut = Math.round(currentState.missedTargetCount * STAGNATION_FUNDS_PENALTY_PER_MISS * 100);
    banner += `. 승격 실패 누적 ${currentState.missedTargetCount}회로 시즌 자금 -${cut}%`;
  }
  // 장기 집권형: 같은 구단 잔류 시즌마다 적응도 시작값 +3
  if (currentState.manager.trait === 'longTermReign') {
    currentState.chemistry = Math.min(100, currentState.chemistry + 3);
    banner += ' (장기 집권형: 적응도 +3)';
  }
  // 1부는 리그와 별개로 챔피언스리그가 병행된다 - 시즌 목표에 그 사실을 못 박아둔다.
  if (currentState.leagueTierId === 'tier1') {
    banner += '. 이번 시즌 목표: 리그 우승 + 챔피언스리그';
  }
  const transferDemand = currentState.pendingTransferDemand ?? null;
  currentState.pendingTransferDemand = null;
  const fundsReport = currentState.fundsReport ?? null;
  currentState.seasonBriefing = { unlocked: unlockedNow, transferDemand, aging: agingReport, fundsReport, review, demandOffer: drawDemandOffer(Math.random, currentState.club.demandBias ?? {}, currentState.leagueTierId).map((c) => c.id), goal: currentBoardGoal(), tierLabel: getLeagueTier(currentState.leagueTierId).label, seasonNumber: currentState.seasonNumber };
  renderMarket(banner);
}

function cardPrice(card) {
  const modifiers = [];
  if (currentState.phase === 'winter') modifiers.push(WINTER_TAX_RATIO);
  // 화술의 달인: 감독 선호 전술 태그 카드는 영입비 -30%
  const { manager } = currentState;
  if (manager.trait === 'silverTongue' && card.playstyleTags.includes(manager.tacticalTag)) {
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
  // 선발 베테랑 리더(33세 이상): 거래당 적응도 하락 −1
  const { lineup } = pickBestXI(currentState.squad, currentFormation(), currentState.manualOverrides, currentState.benchOverrides);
  const captainRelief = lineup.some((p) => p.specialTrait === 'veteranLeader' && p.age >= 33) ? 1 : 0;
  return Math.max(0, Math.min(managerReduced, coachReduced) - captainRelief);
}

// 지역 영웅 대가: 방출·판매하면 팬이 반발해 팀 적응도가 깎인다.
function hometownExitPenalty(card) {
  if (card.specialTrait === 'hometownHero') {
    currentState.chemistry = Math.max(0, currentState.chemistry - HOMETOWN_RELEASE_CHEMISTRY_PENALTY);
  }
}

// 한 주의 첫 거래는 적응도가 깎이지 않는다. 교체 영입(영입+내보내기)은 한 건으로 센다.
function tradeDecay() {
  const amount = currentState.transactedThisWeek ? transactionDecayAmount() : 0;
  currentState.transactedThisWeek = true;
  return amount;
}

// 정원이 찼을 때: 새 선수 대신 내보낼 선수를 고른다(판매 등록 또는 즉시 방출).
function showSquadFullPicker(card) {
  const root = document.getElementById('eventmodal-root');
  const list = [...currentState.squad].sort((a, b) => a.baseOVR - b.baseOVR);
  root.innerHTML = `
    <div class="eventmodal-backdrop">
      <div class="eventmodal outpick">
        <div class="eventmodal__title">정원 ${squadCapFor(currentState.seasonNumber)}명이 찼습니다</div>
        <p class="eventmodal__detail">${esc(card.name)} 대신 내보낼 선수를 고르세요.</p>
        <ul class="outpick__list">${list.map((p) => `<li style="--tier:var(--t-${tierOf(p.baseOVR)})">
          <b class="n">${p.baseOVR}</b><span>${esc(p.name)}<small>${p.position} · ${p.age}세</small></span>
          <button class="act" data-out="list:${p.id}" ${p.boughtThisSeason ? 'disabled' : ''}>판매 등록</button>
          <button class="act act--warn" data-out="drop:${p.id}" ${p.boughtThisSeason ? 'disabled' : ''}>방출</button>
        </li>`).join('')}</ul>
        <button class="reroll" id="out-cancel" style="margin-top:var(--s2);width:100%">취소</button>
      </div>
    </div>`;
  root.querySelectorAll('[data-out]').forEach((btn) => {
    btn.onclick = () => {
      const [mode, ...rest] = btn.dataset.out.split(':');
      root.innerHTML = '';
      buyCard(card, null, { mode, id: rest.join(':') });
    };
  });
  document.getElementById('out-cancel').onclick = () => { root.innerHTML = ''; };
}

function buyCard(card, rowEl = null, outgoing = null) {
  const price = cardPrice(card);
  if (currentState.funds < price) return;
  if (!outgoing && currentState.squad.length >= squadCapFor(currentState.seasonNumber)) {
    showSquadFullPicker(card);
    return;
  }
  // 카드가 상점에서 빠져나가는 걸 보여준 뒤 다시 그린다.
  if (rowEl && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    rowEl.classList.add('is-leaving');
    setTimeout(() => buyCard(card), 160);
    rowEl.style.pointerEvents = 'none';
    return;
  }
  currentState.funds -= price;
  currentState.seasonTrack.spent += price;
  if (currentState.phase === 'winter') currentState.seasonTrack.winterTransactions += 1;
  const out = outgoing ? currentState.squad.find((p) => p.id === outgoing.id) : null;
  if (out) {
    if (outgoing.mode === 'list') listPlayer(out);
    else {
      hometownExitPenalty(out);
      currentState.squad = currentState.squad.filter((p) => p.id !== out.id);
      returnGodToPool(out);
    }
  }
  const tagTiers = () => {
    const { lineup } = pickBestXI(currentState.squad, currentFormation(), currentState.manualOverrides, currentState.benchOverrides);
    return Object.fromEntries(Object.keys(PLAYSTYLE_TAGS).map((t) => [t, playstyleTagProgress(t, lineup).tier]));
  };
  const tiersBefore = tagTiers();
  currentState.squad = [...currentState.squad, { ...toSquadPlayer(card), boughtThisSeason: true }];
  const tiersAfter = tagTiers();
  const activated = Object.keys(tiersAfter).filter((t) => tiersAfter[t] > tiersBefore[t])
    .map((t) => `${TAG_LABELS[t] ?? t} +${PLAYSTYLE_TAGS[t].values[tiersAfter[t] - 1]}`);
  currentState.tagToast = activated.length ? `태그 발동! ${activated.join(', ')}` : '';
  currentState.justBoughtIds = [...(currentState.justBoughtIds ?? []), card.id];
  currentState.chemistry = applyTransactionDecay(currentState.chemistry, 1, tradeDecay());
  currentState.shopOffer = currentState.shopOffer.filter((c) => c.id !== card.id);
  // GOD 카드는 전 세계 2명뿐 — 영입하면 이번 런에서 다시 등장하지 않게 뺀다
  if (card.id.startsWith('god-')) {
    currentState.availableGodPlayers = currentState.availableGodPlayers.filter((g) => g.id !== card.id);
  }
  if (!currentState.firstBuyTracked) {
    currentState.firstBuyTracked = true;
    track('first_buy', { run: currentState.telemetryRun, sec: Math.round((Date.now() - (currentState.startedAt ?? Date.now())) / 1000), s: currentState.seasonNumber });
  }
  if (tutStep() === 1) tutSet(2);
  const toast = currentState.tagToast;
  currentState.tagToast = '';
  renderMarket(toast);
}

// 감독 교체: 선수 영입과 동일하게 아무 때나, 영입가 그대로(위약금 없음).
// 새 감독 영입가 + 지금 감독 위약금(현 감독 영입가의 50%, 계약 해지금).
function managerHireCost(candidate) {
  if (candidate.temp) return { price: 0, severance: 0, total: 0 };
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

// 감독 자진 사임 후 새 감독 선임: 영입비 + 위약금(현 감독 영입가의 50%)을 낸다. 임시 감독만 무료.
function hireReplacement(candidate) {
  const { total, severance } = managerHireCost(candidate);
  if (currentState.funds < total) return;
  currentState.funds -= total;
  currentState.manager = candidate;
  currentState.managerOffer = currentState.managerOffer.filter((m) => m.id !== candidate.id);
  currentState.pendingResignation = null;
  currentState.harmonyStreak = 0;
  renderMarket(`${candidate.name} 감독 선임 완료(영입비 ${candidate.price}G${severance ? ` + 위약금 ${severance}G` : ''})`);
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
  currentState.staff = {
    ...currentState.staff,
    [role]: { ...candidate, hiredWeek: currentState.week, ...(role === 'headCoach' ? { focus: currentState.staff.headCoach.focus ?? 'midfield' } : {}) },
  };
  // 등급 칸은 고정이라 후보 자체를 뺄 수 없다 - 방금 데려온 사람 대신 그 칸에
  // 새 후보를 뽑아, 이미 영입한 사람이 매물로 다시 뜨지 않게 한다.
  currentState.staffOffer = { ...currentState.staffOffer, [`${role}:${level}`]: generateStaffCandidate(role, level) };
  renderMarket(`${esc(candidate.name)}(${STAFF_ROLE_LABELS[role]}) 영입 완료(${cost}G, 이번 주는 효과 미발동)`);
}

function rerollShop() {
  const cost = rerollCost();
  if (currentState.funds < cost) return;
  currentState.funds -= cost;
  currentState.shopOffer = newShopOffer();
  renderMarket();
}

// 선수단 탭 교체: 같은 포지션 슬롯끼리 바꾼다(전술 탭의 수동 배치와 같은 manualOverrides를 쓴다).
function setSlotOverride(slotIndex, playerId) {
  const next = Object.fromEntries(Object.entries(currentState.manualOverrides ?? {}).filter(([, id]) => id !== playerId));
  currentState.manualOverrides = { ...next, [slotIndex]: playerId };
}
function swapIntoLineup(playerId) {
  const p = currentState.squad.find((x) => x.id === playerId);
  if (!p) return;
  const formationId = currentFormation();
  const { slots } = FORMATIONS[formationId];
  const { slotted } = pickBestXI(currentState.squad, formationId, currentState.manualOverrides, currentState.benchOverrides);
  const idxs = slots.map((pos, i) => (pos === p.position ? i : -1)).filter((i) => i >= 0);
  if (!idxs.length) { renderMarket(`${formationId}에는 ${p.position} 자리가 없습니다`); return; }
  const target = [...idxs].sort((a, b) => (slotted[a]?.baseOVR ?? -1) - (slotted[b]?.baseOVR ?? -1))[0];
  const out = slotted[target];
  setSlotOverride(target, playerId);
  renderMarket(`${p.name} 선발 투입${out ? `, ${out.name} 벤치로` : ''}`);
}
function swapOutOfLineup(playerId) {
  const formationId = currentFormation();
  const { slots } = FORMATIONS[formationId];
  const { slotted } = pickBestXI(currentState.squad, formationId, currentState.manualOverrides, currentState.benchOverrides);
  const i = slotted.findIndex((x) => x?.id === playerId);
  if (i < 0) return;
  const taken = new Set(slotted.filter(Boolean).map((x) => x.id));
  const repl = currentState.squad.filter((x) => x.position === slots[i] && !taken.has(x.id)).sort((a, b) => b.baseOVR - a.baseOVR)[0];
  if (!repl) { renderMarket(`교체할 ${slots[i]} 선수가 없습니다`); return; }
  setSlotOverride(i, repl.id);
  renderMarket(`${repl.name} 선발 투입, ${slotted[i].name} 벤치로`);
}

// GOD 카드는 전 세계 2명이라, 방출·판매·이적으로 선수단을 떠나면(계약 만료와 같게) 다시 상점에 나온다.
function returnGodToPool(card) {
  if (!card?.id?.startsWith('god-') || currentState.availableGodPlayers.some((g) => g.id === card.id)) return;
  const god = GOD_PLAYERS.find((g) => g.id === card.id);
  if (god) currentState.availableGodPlayers = [...currentState.availableGodPlayers, god];
}

// 방출 3단계 (스펙 7절): 즉시(0%) / 이적 명단(1주 소모, 여름·겨울 범위 회수율) / Week12 데드라인(40%, 소모 없음)
// 2시즌부터는 등록하면 오퍼가 오고(기다리면 새 오퍼로 바뀜), 마감까지 안 팔리면 태업한다.
function listPlayer(card) {
  hometownExitPenalty(card);
  const method = currentState.phase === 'summer' ? 'listedSummer' : 'listedWinter';
  // 겨울 이적명단은 당해 영입 선수를 받지 않는다 (스펙 7절)
  if (currentState.phase === 'winter') currentState.seasonTrack.winterTransactions += 1;
  currentState.squad = currentState.squad.filter((p) => p.id !== card.id);
  const entry = { card, method, resolveWeek: currentState.week + 1 };
  if (currentState.seasonNumber >= 2) entry.offers = generateSaleOffers(card.price, card.baseOVR, method);
  currentState.listedForSale.push(entry);
}

function listForSale(card) {
  if (card.boughtThisSeason) return;
  listPlayer(card);
  currentState.chemistry = applyTransactionDecay(currentState.chemistry, 1, tradeDecay());
  renderMarket();
}

function acceptSaleOffer(cardId, amount) {
  const l = currentState.listedForSale.find((x) => x.card.id === cardId);
  if (!l || !l.offers?.includes(amount)) return;
  currentState.listedForSale = currentState.listedForSale.filter((x) => x !== l);
  returnGodToPool(l.card);
  currentState.funds += amount;
  currentState.seasonTrack.income += amount;
  renderMarket(`${l.card.name} 이적 확정: ${amount}G`);
}

// 이벤트·유스 콜업·태업 복귀로 정원을 넘으면 시장 마감 때 선발·벤치가 아닌 낮은 OVR부터 자동 방출한다(긴급 유스는 제외).
function enforceSquadCap() {
  const over = currentState.squad.filter((p) => !p.emergencyYouth).length - squadCapFor(currentState.seasonNumber);
  if (over <= 0) return '';
  const { lineup, bench } = pickBestXI(currentState.squad, currentFormation(), currentState.manualOverrides, currentState.benchOverrides);
  const keep = new Set([...lineup, ...bench].map((p) => p.id));
  const out = currentState.squad.filter((p) => !p.emergencyYouth && !keep.has(p.id)).sort((a, b) => a.baseOVR - b.baseOVR).slice(0, over);
  const ids = new Set(out.map((p) => p.id));
  out.forEach(returnGodToPool);
  currentState.squad = currentState.squad.filter((p) => !ids.has(p.id));
  return out.length ? `정원 초과로 방출: ${out.map((p) => p.name).join(', ')}` : '';
}

function releaseDeadline(card) {
  if (card.boughtThisSeason) return;
  hometownExitPenalty(card);
  currentState.squad = currentState.squad.filter((p) => p.id !== card.id);
  returnGodToPool(card);
  const proceeds = computeReleaseProceeds(card.price, 'deadline');
  currentState.funds += proceeds;
  currentState.seasonTrack.income += proceeds;
  renderMarket();
}

function resolveListedSales() {
  const marketOver = (currentState.phase === 'summer' && currentState.week > SUMMER_MARKET_WEEKS[1])
    || (currentState.phase === 'winter' && currentState.week > WINTER_MARKET_WEEKS[1]);
  const slumpMessages = [];
  // 오퍼 방식(2시즌~): 시장이 끝나면 태업하고 복귀, 아니면 새 오퍼로 교체
  currentState.listedForSale = currentState.listedForSale.flatMap((l) => {
    if (!l.offers) return [l];
    if (!marketOver) return [{ ...l, offers: generateSaleOffers(l.card.price, l.card.baseOVR, l.method) }];
    currentState.squad = [...currentState.squad, { ...l.card, baseOVR: Math.max(1, l.card.baseOVR - SLUMP_OVR_PENALTY), slump: SLUMP_OVR_PENALTY, boughtThisSeason: false }];
    slumpMessages.push(`${l.card.name} 태업(안 팔려서 복귀, OVR -${SLUMP_OVR_PENALTY})`);
    return [];
  });
  const due = currentState.listedForSale.filter((l) => !l.offers && l.resolveWeek === currentState.week);
  currentState.listedForSale = currentState.listedForSale.filter((l) => l.offers || l.resolveWeek !== currentState.week);
  const messages = due.map((l) => {
    returnGodToPool(l.card); // 정산이 끝나면 선수단 밖으로 완전히 나간 것
    const proceeds = computeReleaseProceeds(l.card.price, l.method);
    currentState.funds += proceeds;
    currentState.seasonTrack.income += proceeds;
    return `${l.card.name} 방출 완료: ${proceeds}G 회수`;
  });
  return [...messages, ...slumpMessages].join(' / ');
}

// 주차가 넘어갔다는 걸 알려주는 짧은 화면 플래시. 시장 화면은 통째로
// innerHTML을 갈아치우는 구조라 CSS 트랜지션이 안 먹는다(엘리먼트가 아예
// 사라졌다 새로 생김) - 그 사이에 독립된 오버레이를 잠깐 띄운다.
// 전/후반기 시뮬레이션으로 넘어가는 주는 renderSimulating이 이미 연출을
// 맡고 있어서 여기서 또 플래시할 필요가 없다.
function flashWeekTransition(label, onDone) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    onDone();
    return;
  }
  const el = document.createElement('div');
  el.className = 'weekflash';
  el.textContent = label;
  document.body.appendChild(el);
  setTimeout(() => {
    el.remove();
    onDone();
  }, 260);
}

// 반기 전술 방향(2시즌 해금): 기대 승점은 그대로, 공격은 기복이 크고 수비는 안정적이다.
function askDirection(onPick) {
  if (!isUnlocked('direction')) { currentState.direction = 'balance'; onPick(); return; }
  const root = document.getElementById('eventmodal-root');
  root.innerHTML = `
    <div class="eventmodal-backdrop">
      <div class="eventmodal eventmodal--goal">
        <div class="eventmodal__kicker">${currentState.phase === 'summer' ? '전반기' : '후반기'} 전술 방향</div>
        <div class="eventmodal__title">이번 반기를 어떻게 치를까요?</div>
        <div class="dirpick">
          <button class="reroll" data-dir="attack">공격 <small>대박 또는 쪽박</small></button>
          <button class="reroll" data-dir="balance">균형 <small>보통</small></button>
          <button class="reroll" data-dir="defense">수비 <small>안정적</small></button>
        </div>
      </div>
    </div>`;
  root.querySelectorAll('[data-dir]').forEach((b) => {
    b.onclick = () => { currentState.direction = b.dataset.dir; root.innerHTML = ''; onPick(); };
  });
}

function nextWeek() {
  currentState.chemistry = advanceWeek(currentState.chemistry, currentState.transactedThisWeek);
  currentState.transactedThisWeek = false;
  currentState.justBoughtIds = []; // NEW 표시는 산 주에만 - 다음 주로 넘어가면 지운다
  currentState.week += 1;
  const saleMessage = resolveListedSales();

  if (currentState.phase === 'summer' && currentState.week > SUMMER_MARKET_WEEKS[1]) {
    askDirection(() => runFirstHalf(saleMessage));
    return;
  }
  if (currentState.phase === 'winter' && currentState.week > WINTER_MARKET_WEEKS[1]) {
    askDirection(() => runSecondHalfAndFinish(saleMessage));
    return;
  }
  currentState.shopOffer = newShopOffer();
  currentState.managerOffer = generateManagerOffer(3, Math.random, currentState.manager?.id, currentState.leagueTierId);
  currentState.staffOffer = generateStaffOffer(Math.random, currentState.leagueTierId);
  renderMarket(saleMessage);
}

// 수석 코치 효과(등급 + 주력 유닛). 엔진의 coach 인자로 들어가 선수 OVR에 유닛 보너스로 더해진다.
function coachFor() {
  const c = currentState.staff.headCoach;
  return { level: c.level, focus: c.focus ?? 'midfield' };
}

// 플레이스타일 태그 진행도(문턱은 태그 등급별, engine/constants.mjs).
// 상점 카드와 전술 탭 팀 케미 패널이 똑같은 계산을 쓴다.
// tier = 넘은 문턱 수(0~5), need = 다음에 채워야 할 인원(다 넘었으면 마지막 문턱).
function playstyleTagProgress(tagId, lineup) {
  // 센 사람 = 보너스 받는 사람: 수혜 포지션에 서 있는 보유자만 센다.
  const count = lineup.filter((p) => p.playstyleTags.includes(tagId) && PLAYSTYLE_TAGS[tagId].positions.includes(p.position)).length;
  const req = PLAYSTYLE_TAGS[tagId].thresholds;
  const tier = req.filter((n) => count >= n).length;
  const need = req[Math.min(tier, req.length - 1)];
  return { count, need, tier, req, values: PLAYSTYLE_TAGS[tagId].values };
}
// "3명 +6 · 5명 +10 · ..." 형태의 단계표 문구
const tagLadderText = (req, values) => req.map((n, i) => `${n}명 +${values[i]}`).join(' · ');

// 19경기로 만들 수 없는 56점과 57점 이상은 55점으로 맞춘다(승 18·무 1이 최대).
const roundHalfPoints = (p) => Math.min(55, Math.round(p));

function runFirstHalf(saleMessage = '') {
  const { manager } = currentState;

  const capMsg = enforceSquadCap();
  if (capMsg) saleMessage = saleMessage ? `${saleMessage} / ${capMsg}` : capMsg;
  const callUps = ensurePositionCoverage();
  if (callUps.length) {
    const msg = `포지션 공백으로 유스 긴급 콜업: ${callUps.join(', ')}`;
    saleMessage = saleMessage ? `${saleMessage} / ${msg}` : msg;
  }

  const { lineup, slotted, bench } = pickBestXI(currentState.squad, currentFormation(), currentState.manualOverrides, currentState.benchOverrides);
  const harmonyMsg = applyManagerTacticalHarmony(lineup);
  if (harmonyMsg) saleMessage = saleMessage ? `${saleMessage} / ${harmonyMsg}` : harmonyMsg;

  // 승점은 정수로 쓴다: 화면에 보이는 승점과 승/강등 판정에 쓰는 승점이 같아야 한다.
  currentState.firstHalfPoints = roundHalfPoints(runHalfSeason(
    lineup,
    bench,
    manager.tier,
    currentState.chemistry,
    currentState.leagueTierId,
    Math.random,
    coachFor(),
    currentState.direction ?? 'balance'
  ));

  // 이 시즌의 순위표를 전반기에 만들어 두고, 후반기는 그 위에 이어서 쌓는다(상대 구단도 그대로).
  const table = simulateLeagueTable(currentState.firstHalfPoints, effectiveTier(currentState.leagueTierId));
  const rivals = buildLeagueRivals(currentState.leagueTierId, MATCHES_PER_HALF).map((c) => ({ name: c.name, kit: c.kit }));
  currentState.seasonRivals = rivals;
  currentState.firstHalfBase = Object.fromEntries(table.map((t) => [t.id, t.cumulative.at(-1)]));

  const tierLabel = getLeagueTier(currentState.leagueTierId).label;
  showHarmonyNotice(harmonyMsg, () => renderSimulating(currentState.club.name, tierLabel, '전반기', currentState.club.kit, currentState.firstHalfPoints, () => {
    renderHalfTimeVerdict(saleMessage, lineup, slotted, bench);
  }, { table, rivals }));
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
    <p class="note">이사진 목표 <b>${currentBoardGoal()}점</b> - 전반기 ${points.toFixed(0)}점(목표 페이스 ${(currentBoardGoal() / 2).toFixed(0)}점).</p>
    <p class="note">겨울 이적시장에서 스쿼드를 보강하세요(윈터 택스 +${WINTER_TAX_RATIO * 100}%).</p>
    <div class="panel">
      <div class="panel__head"><h2>전반기 라인업</h2><span class="panel__count">${currentFormation()}</span></div>
      ${renderPitch(slotted, currentFormation(), currentState.club.kit)}
    </div>
  `, `<button class="cta" id="to-winter-btn">겨울 이적시장으로</button>`);

  document.getElementById('to-winter-btn').addEventListener('click', () => { clearSpot(); enterWinterMarket(); });
  tutorialTick('half');
}

function enterWinterMarket() {
  const { manager } = currentState;
  currentState.phase = 'winter';
  currentState.week = WINTER_MARKET_WEEKS[0];
  // 여름에 산 선수는 겨울부터 판매할 수 있다.
  currentState.squad = currentState.squad.map((p) => ({ ...p, boughtThisSeason: false }));
  currentState.shopOffer = newShopOffer();
  currentState.managerOffer = generateManagerOffer(3, Math.random, currentState.manager?.id, currentState.leagueTierId);
  currentState.staffOffer = generateStaffOffer(Math.random, currentState.leagueTierId);

  // 겨울 지원금: 여름에 쓴 돈이 바닥나도 후반기 보강이 가능하게 시즌 지급액의
  // 일부를 얹는다(이월 상한과 무관한 별도 지급).
  const winterGrant = Math.round(
    calculateStartingFunds(getLadderIndex(currentState.leagueTierId))
      * currentState.club.startingFundsMultiplier * fundsScale(currentState.leagueTierId, currentState.seasonNumber) * WINTER_FUNDS_RATIO
  );
  currentState.funds += winterGrant;
  applySeasonEvent('winter');
  let banner = `겨울 이적시장이 시작됩니다(윈터 택스 +${WINTER_TAX_RATIO * 100}%). 겨울 지원금 +${winterGrant}G.`;

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

const RESULT_LABELS = { champion: '우승', promotion: '승격권', safe: '안전 잔류', relegation: '강등 위기' };
// 시즌이 끝난 뒤의 "확정된 결과"는 페이스 예측과 달리 애매하게 두면 안 된다 -
// 우승/승격/강등처럼 실제로 일어난 일을 그대로 말한다("~권"은 아직 안 정해진
// 가능성을 말할 때 쓰는 말이라 확정 결과에는 안 맞는다).
const FINAL_RESULT_LABELS = { champion: '우승', promotion: '승격', safe: '잔류', relegation: '강등' };

// 챔피언스리그 화면. 리그 시즌이 끝난 뒤 "경기 시작" 버튼으로 내 경기를 한 번씩 진행한다.
// 경기를 시작하면 전/후반이 나뉜 경기 진행 화면(공 연출 + 득점 이벤트)이 먼저 나오고,
// 끝나면 순위표(리그 단계)와 토너먼트 대진표가 갱신된다.
const crestOf = (t, size = 22) => renderCrest({ name: t.name, kit: t.kit }, { size });

// 내 팀 득점자 이름(라인업 공격/미드 선수, 포지션 가중). 상대 득점은 이름 없이 표시한다.
function myScorerPool() {
  const { lineup } = pickBestXI(currentState.squad, currentFormation(), currentState.manualOverrides, currentState.benchOverrides);
  const weight = { ST: 4, W: 3, AMF: 3, CMF: 2, DMF: 1, WB: 1 };
  return lineup.flatMap((p) => Array(weight[p.position] ?? 0).fill(p.name));
}

// 챔피언스리그 경기 진행 화면: 입장 연출 → 전반 → 하프타임 → 후반(막판 슬로모션·추가시간) →
// (승부차기) → 결과 카드. 득점은 "GOAL!" 배너와 화면 섬광, 실점은 붉은 섬광과 흔들림.
// 화면을 누르면 빨리 감기.
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

function playUclMatch(state, prev, onDone) {
  const m = state.last;
  const me = teamOf(state, 'me');
  const opp = teamOf(state, m.oppId);
  const pool = myScorerPool();
  const scorerOf = (side) => (side === 'me' && pool.length ? pool[Math.floor(Math.random() * pool.length)] : '');
  const events = m.events.map((e) => ({ ...e, who: scorerOf(e.side) }));
  const knockout = prev.stage !== 'league';
  const venueText = m.home === null ? '중립 경기' : m.home ? '홈 경기' : '원정 경기';
  const isFinal = m.label.startsWith('결승');

  // 이 경기의 무게를 한 줄로(입장 연출에 쓴다)
  const stakes = (() => {
    if (isFinal) return '우승을 가리는 단판 승부';
    if (knockout) {
      const t = prev.ties.find((x) => x.a === 'me' || x.b === 'me');
      if (t && t.legs.length === 1) {
        const meIsA = t.a === 'me';
        const mine = meIsA ? t.legs[0].ga : t.legs[0].gb; const theirs = meIsA ? t.legs[0].gb : t.legs[0].ga;
        return `2차전 · 1차전 ${mine}:${theirs}${mine > theirs ? ' 리드' : mine < theirs ? ' 열세' : ' 동률'} · 합계로 결정`;
      }
      return '1차전 · 합계 스코어로 결정';
    }
    return `${UCL_LEAGUE_DAYS}라운드 중 ${prev.day + 1}라운드`;
  })();

  setScreen(`
    <div class="uclmatch${isFinal ? ' is-final' : ''}" style="--kit:${me.kit}">
      <div class="uclmatch__intro" id="um-intro">
        <div class="uclmatch__introstage">${esc(m.label)}</div>
        <div class="uclmatch__introteams">
          <div class="is-left">${crestOf(me, 64)}<b>${esc(me.name)}</b></div>
          <span>VS</span>
          <div class="is-right">${crestOf(opp, 64)}<b>${esc(opp.name)}</b></div>
        </div>
        <div class="uclmatch__introvenue">${venueText} · ${esc(stakes)}</div>
        ${m.fortress ? '<div class="uclmatch__introfort">⚠ 원정팀의 무덤 — 적응도 절반</div>' : ''}
      </div>
      <div class="uclmatch__stage">${esc(m.label)} · ${venueText}</div>
      <div class="uclmatch__board">
        <div class="uclmatch__team">${crestOf(me, 34)}<b>${esc(me.name)}</b></div>
        <div class="uclmatch__score n"><span id="um-me">0</span><i>:</i><span id="um-opp">0</span></div>
        <div class="uclmatch__team">${crestOf(opp, 34)}<b>${esc(opp.name)}</b></div>
      </div>
      <div class="uclmatch__clock" id="um-clockwrap"><span id="um-phase">킥오프</span><b id="um-min" class="n">0'</b></div>
      <div class="matchsim__pitch uclmatch__pitch" id="um-pitch">
        <div class="matchsim__pitchLines"></div>
        <div class="matchsim__ball"></div>
        <div class="uclmatch__banner" id="um-banner"></div>
        <div class="uclmatch__flash" id="um-flash"></div>
        <div class="uclmatch__ht" id="um-ht"></div>
      </div>
      <div class="uclmatch__shootout" id="um-shootout" hidden></div>
      <ul class="uclmatch__feed" id="um-feed">${m.fortress ? '<li class="is-note">⚠ 원정팀의 무덤 — 적응도 절반</li>' : ''}</ul>
      <div id="um-end"></div>
      <p class="note" style="text-align:center">화면을 누르면 빨리 감기</p>
    </div>
  `);

  let fast = false;
  document.querySelector('.uclmatch').onclick = () => { fast = true; };
  const wait = (ms) => sleepMs(fast ? Math.min(ms, 30) : ms);
  const feed = (html, cls = '') => {
    const ul = document.getElementById('um-feed');
    if (ul) ul.insertAdjacentHTML('afterbegin', `<li class="${cls}">${html}</li>`);
  };
  const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  const flash = (cls) => {
    const el = document.getElementById('um-flash');
    const pitch = document.getElementById('um-pitch');
    if (!el) return;
    el.className = `uclmatch__flash ${cls}`;
    void el.offsetWidth;
    el.classList.add('is-on');
    if (cls === 'is-concede') { pitch.classList.remove('is-shake'); void pitch.offsetWidth; pitch.classList.add('is-shake'); }
  };
  const banner = (text, sub, cls) => {
    const el = document.getElementById('um-banner');
    if (!el) return;
    el.className = `uclmatch__banner ${cls}`;
    el.innerHTML = `<b>${esc(text)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}`;
    void el.offsetWidth;
    el.classList.add('is-on');
  };

  (async () => {
    // ---- 입장 ----
    await wait(2000);
    document.getElementById('um-intro')?.classList.add('is-out');
    await wait(500);
    document.getElementById('um-intro')?.remove();
    feed('킥오프', 'is-note');
    set('um-phase', '전반');

    let myGoals = 0; let oppGoals = 0;
    const playMinute = async (minute, label) => {
      set('um-min', label ?? `${minute}'`);
      for (const e of events.filter((x) => x.minute === minute)) {
        if (e.side === 'me') myGoals += 1; else oppGoals += 1;
        set('um-me', String(myGoals)); set('um-opp', String(oppGoals));
        const score = document.querySelector('.uclmatch__score');
        score?.classList.add('is-goal');
        setTimeout(() => score?.classList.remove('is-goal'), 800);
        if (e.side === 'me') {
          flash('is-goal');
          banner('GOAL!', `${minute}' ${e.who || me.name}`, 'is-goal');
          feed(`<b class="n">${minute}'</b> ⚽ ${esc(e.who || me.name)}`, 'is-me');
        } else {
          flash('is-concede');
          banner('실점', `${minute}' ${opp.name}`, 'is-concede');
          feed(`<b class="n">${minute}'</b> ⚽ ${esc(opp.name)} 득점`, 'is-opp');
        }
        await wait(1100);
      }
    };

    // ---- 전반 ----
    for (let minute = 1; minute <= 45; minute++) { await playMinute(minute); await wait(62); }
    // ---- 하프타임 ----
    set('um-phase', '하프타임');
    const ht = document.getElementById('um-ht');
    if (ht) { ht.innerHTML = `<span>HALF TIME</span><b class="n">${myGoals} : ${oppGoals}</b>`; ht.classList.add('is-on'); }
    feed(`하프타임 ${myGoals} : ${oppGoals}`, 'is-note');
    await wait(1700);
    ht?.classList.remove('is-on');
    set('um-phase', '후반');
    // ---- 후반 (막판 접전이면 슬로모션) ----
    const close = () => Math.abs(myGoals - oppGoals) <= 1;
    for (let minute = 46; minute <= 90; minute++) {
      const late = minute >= 80 && (close() || knockout);
      document.getElementById('um-clockwrap')?.classList.toggle('is-late', late);
      await playMinute(minute);
      await wait(late ? 190 : 62);
    }
    // ---- 추가시간 ----
    const stoppage = 1 + Math.floor(Math.random() * 4);
    feed(`추가시간 +${stoppage}분`, 'is-note');
    for (let s = 1; s <= stoppage; s++) { set('um-min', `90+${s}'`); await wait(520); }
    document.getElementById('um-clockwrap')?.classList.remove('is-late');
    set('um-phase', '종료');
    feed(`경기 종료 ${m.me} : ${m.opp}`, 'is-note');

    // ---- 승부차기 ----
    if (m.pens) {
      const box = document.getElementById('um-shootout');
      const sh = generateShootout(m.pens);
      box.hidden = false;
      box.innerHTML = `<div class="uclmatch__shootouttitle">승부차기</div>
        <div class="uclmatch__kicks"><span>${esc(me.name)}</span><div id="sk-me"></div></div>
        <div class="uclmatch__kicks"><span>${esc(opp.name)}</span><div id="sk-opp"></div></div>`;
      await wait(900);
      for (const k of sh.kicks) {
        document.getElementById(k.side === 'me' ? 'sk-me' : 'sk-opp')?.insertAdjacentHTML('beforeend', `<i class="${k.scored ? 'is-in' : 'is-out'}">${k.scored ? '●' : '✕'}</i>`);
        await wait(750);
      }
      banner(m.pens === 'me' ? '승부차기 승리!' : '승부차기 패배', `${sh.me} : ${sh.opp}`, m.pens === 'me' ? 'is-goal' : 'is-concede');
      await wait(1200);
    }

    // ---- 결과 카드 ----
    const won = m.pens ? m.pens === 'me' : m.me > m.opp;
    const draw = !m.pens && m.me === m.opp;
    const champion = state.stage === 'done' && state.result === 'champion';
    const out = state.stage === 'done' && !champion;
    const advanced = !out && !champion && state.stage !== prev.stage;
    const rank = uclRanking(state).indexOf('me') + 1;
    let head; let sub; let tone;
    if (champion) { head = '유럽 정상!'; sub = '챔피언스리그 우승'; tone = 'win'; }
    else if (out) { head = `${UCL_STAGE_LABELS[prev.stage]}에서 멈췄습니다`; sub = '아쉬운 탈락'; tone = 'lose'; }
    else if (advanced) { head = `${UCL_STAGE_LABELS[state.stage]} 진출!`; sub = '다음 라운드로'; tone = 'win'; }
    else if (state.stage === 'league') { head = won ? '승리' : draw ? '무승부' : '패배'; sub = `리그 단계 현재 ${rank}위`; tone = won ? 'win' : draw ? 'draw' : 'lose'; }
    else { head = won ? '1차전 승리' : draw ? '1차전 무승부' : '1차전 패배'; sub = '2차전에서 합계로 결정됩니다'; tone = won ? 'win' : draw ? 'draw' : 'lose'; }
    const end = document.getElementById('um-end');
    if (end) {
      end.innerHTML = `<div class="uclmatch__verdict is-${tone}"><small>${m.me} : ${m.opp}${m.pens ? ' (승부차기)' : ''}</small><b>${esc(head)}</b><em>${esc(sub)}</em></div>
        <button class="cta" id="um-continue">${champion ? '시상식으로' : '순위표 보기'}</button>`;
      end.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      document.getElementById('um-continue').onclick = onDone;
    }
  })();
}

// 우승까지의 여정(시상식 화면용): 리그 단계 순위 + 라운드별 상대와 합계 스코어
function uclJourneyLines(s) {
  const lines = [`리그 단계 ${s.seeds.indexOf('me') + 1}위 (36팀)`];
  for (const key of ['playoff', 'r16', 'qf', 'sf', 'final']) {
    const t = (s.rounds[key] ?? []).find((x) => x.a === 'me' || x.b === 'me');
    if (!t) continue;
    const agg = tieAggregate(t);
    const meIsA = t.a === 'me';
    lines.push(`${UCL_STAGE_LABELS[key]} vs ${nameOf(s, meIsA ? t.b : t.a)} ${meIsA ? agg.a : agg.b} - ${meIsA ? agg.b : agg.a}${t.pens ? ' (승부차기)' : ''}`);
  }
  return lines;
}

function renderUcl(opts = {}) {
  const s = currentState.ucl;
  const me = 'me';
  const nm = (id) => esc(nameOf(s, id));
  const fresh = !!opts.fresh && s.prevRank.length > 0;

  const mineTie = s.ties.find((t) => t.a === me || t.b === me) ?? null;
  const fixture = s.stage === 'league' ? s.fixtures[s.day]?.find(([a, b]) => a === me || b === me) : mineTie ? [mineTie.a, mineTie.b] : null;
  const oppId = fixture ? fixture.find((id) => id !== me) : null;
  const opp = oppId ? teamOf(s, oppId) : null;
  const myTeam = teamOf(s, me);
  // 다음 경기가 홈/원정/중립 중 어디인지(리그: 일정의 앞쪽이 홈, 토너먼트: 1차전 홈=낮은 시드, 2차전 홈=높은 시드)
  const venue = s.stage === 'league'
    ? (fixture && fixture[0] === me ? 'home' : 'away')
    : s.stage === 'final' ? 'neutral'
    : mineTie && (s.leg === 1 ? mineTie.b : mineTie.a) === me ? 'home' : 'away';
  const fortress = venue === 'away' && !!opp?.fortress;

  // ----- 다음 경기 / 결과 카드 -----
  let top;
  if (s.stage === 'done') {
    const reward = UCL_REWARDS_FUNDS[s.result];
    top = `<div class="verdict verdict--${s.result === 'champion' ? 'champion' : 'safe'}">
        <div class="verdict__label">챔피언스리그</div>
        <div class="verdict__result">${UCL_RESULT_LABELS[s.result]}</div>
        <p class="note" style="text-align:center">상금 <b>+${reward}G</b>${s.result === 'champion' ? ' · 명성 대폭 상승' : ''}</p>
        ${(() => {
          const dm = currentState.pendingBoardReview?.demand;
          if (!dm?.deferred) return '';
          const ok = evaluateDemand(dm.cardId, { uclQualified: true, uclResult: s.result });
          return `<p class="note" style="text-align:center">이사진 요구 "${esc(dm.text)}" → <b>${ok ? '달성! 다음 시즌 자금 보너스' : '미달(불이익 없음)'}</b></p>`;
        })()}
      </div>`;
  } else {
    const legInfo = s.stage !== 'league' && s.stage !== 'final' ? ` · ${s.leg}차전` : '';
    const stageText = s.stage === 'league' ? `리그 단계 ${s.day + 1}/${UCL_LEAGUE_DAYS}라운드` : `${UCL_STAGE_LABELS[s.stage]}${legInfo}`;
    const agg = mineTie && mineTie.legs.length
      ? (() => { const a = tieAggregate(mineTie); const mineIsA = mineTie.a === me; return `1차전 ${mineIsA ? a.a : a.b} : ${mineIsA ? a.b : a.a} (지금 합계)`; })()
      : '';
    top = `<div class="uclnext">
        <div class="uclnext__stage">${stageText}</div>
        <div class="uclnext__vs">
          <div>${crestOf(myTeam, 40)}<b>${esc(myTeam.name)}</b></div><span>vs</span><div>${opp ? crestOf(opp, 40) : ''}<b>${opp ? esc(opp.name) : ''}</b></div>
        </div>
        <div class="uclnext__venue is-${venue}">${{ home: '홈 경기', away: '원정 경기', neutral: '중립 경기(단판)' }[venue]}</div>
        <div class="uclnext__power">내 전력 ${Math.round(myTeam.power)} · 상대 전력 ${opp ? opp.power : ''}${opp ? ` · ${UCL_STYLE_LABELS[opp.style]}` : ''}</div>
        ${fortress ? `<div class="uclnext__fortress">⚠ 원정팀의 무덤 — 이 원정에서는 적응도가 절반이 되어 내 전력이 ${Math.round(s.myPowerAway)}로 떨어집니다</div>` : ''}
        ${agg ? `<div class="uclnext__agg">${agg}</div>` : ''}
      </div>`;
  }

  // ----- 직전 경기 요약(내 경기 + 같은 라운드 다른 경기) -----
  const logRows = s.log.map((m) => `<li class="${m.mine ? 'is-mine' : ''}">
      <span>${nm(m.a)}</span><b class="n">${m.ga} : ${m.gb}</b><span>${nm(m.b)}</span>${m.pens ? `<em>승부차기 ${nm(m.pens === 'a' ? m.a : m.b)} 승</em>` : ''}
    </li>`).join('');

  // ----- 리그 단계 순위표 -----
  const rank = uclRanking(s);
  const prevIndex = new Map(s.prevRank.map((id, i) => [id, i]));
  const zoneOf = (i) => (i < UCL_DIRECT_SPOTS ? 'seed' : i < UCL_PLAYOFF_SPOTS ? 'in' : 'out');
  const rowsHtml = rank.map((id, i) => {
    const r = s.table[id];
    const t = teamOf(s, id);
    const moved = fresh ? (prevIndex.get(id) ?? i) - i : 0;
    const arrow = moved > 0 ? `<i class="mv up">▲${moved}</i>` : moved < 0 ? `<i class="mv down">▼${-moved}</i>` : '<i class="mv"></i>';
    const gd = r.gf - r.ga;
    return `<li class="ucltable__row zone-${zoneOf(i)}${id === me ? ' is-mine' : ''}" data-id="${id}" data-prev="${prevIndex.get(id) ?? i}" data-idx="${i}">
      <span class="ucltable__rank n">${i + 1}</span>${arrow}
      ${crestOf(t, 20)}<span class="ucltable__name">${esc(t.name)}</span>
      <span class="ucltable__form">${r.form.map((f) => `<i class="f-${f}"></i>`).join('')}</span>
      <span class="n ucltable__gd">${gd >= 0 ? '+' : ''}${gd}</span><b class="n ucltable__pts">${r.p}</b>
    </li>`;
  }).join('');

  // ----- 토너먼트 대진 -----
  const tieLine = (t) => {
    const a = tieAggregate(t);
    const legsText = t.legs.map((l) => `${l.ga}-${l.gb}`).join(', ');
    const w = t.winner;
    return `<li class="uclties__tie${t.a === me || t.b === me ? ' is-mine' : ''}">
      <span class="${w === t.a ? 'is-win' : ''}">${nm(t.a)}</span>
      <b class="n">${t.legs.length ? `${a.a} - ${a.b}` : 'vs'}</b>
      <span class="${w === t.b ? 'is-win' : ''}">${nm(t.b)}</span>
      ${t.legs.length > 1 || t.pens ? `<em>${legsText}${t.pens ? ` · 승부차기 ${nm(t.pens === 'a' ? t.a : t.b)}` : ''}</em>` : ''}
    </li>`;
  };
  const knockoutRounds = ['playoff', 'r16', 'qf', 'sf', 'final']
    .map((key) => ({ key, ties: s.rounds[key] ?? (s.stage === key ? s.ties : null) }))
    .filter((r) => r.ties && r.ties.length);
  const bracket = knockoutRounds.length ? `<div class="panel">
      <div class="panel__head"><h2>토너먼트</h2><span class="panel__count">16강부터 · 4강까지 2경기 합계</span></div>
      ${knockoutRounds.map((r) => `<h3 class="chemgroup__title">${UCL_STAGE_LABELS[r.key]}</h3><ul class="uclties">${r.ties.map(tieLine).join('')}</ul>`).join('')}
    </div>` : '';

  const dock = s.stage === 'done'
    ? '<button class="cta" id="ucl-next">다음 시즌으로</button>'
    : `<button class="cta" id="ucl-play">${s.stage === 'league' ? '경기 시작' : `${UCL_STAGE_LABELS[s.stage]}${s.stage === 'final' ? '' : ` ${s.leg}차전`} 시작`}</button>`;

  setScreen(`
    <div class="uclhead"><span>챔피언스리그</span><b>${UCL_STAGE_LABELS[s.stage]}</b></div>
    ${top}
    ${bracket}
    <div class="panel">
      <div class="panel__head"><h2>리그 단계 순위</h2><span class="panel__count">36팀 · 8경기</span></div>
      <div class="ucltable__legend"><i class="zone-seed"></i>1~8 16강 직행 <i class="zone-in"></i>9~24 플레이오프 <i class="zone-out"></i>25위~ 탈락</div>
      <ul class="ucltable" id="ucl-table">${rowsHtml}</ul>
    </div>
    ${s.log.length ? `<div class="panel"><div class="panel__head"><h2>지난 라운드 결과</h2></div><ul class="ucllog">${logRows}</ul></div>` : ''}
  `, dock);

  // 순위가 바뀐 만큼 행이 미끄러진다(FLIP) - 직전 경기 직후에만.
  if (fresh) {
    const table = document.getElementById('ucl-table');
    const rowH = table?.firstElementChild?.getBoundingClientRect().height ?? 34;
    for (const li of table?.children ?? []) {
      const delta = (Number(li.dataset.prev) - Number(li.dataset.idx)) * (rowH + 2);
      if (!delta) continue;
      li.style.transition = 'none';
      li.style.transform = `translateY(${delta}px)`;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        li.style.transition = 'transform 700ms var(--ease)';
        li.style.transform = '';
      }));
    }
  }

  document.getElementById('ucl-play')?.addEventListener('click', () => {
    const next = advanceUcl(s);
    currentState.ucl = next;
    saveRun(currentState, localStorage);
    playUclMatch(next, s, () => renderUcl({ fresh: true }));
  });
  if (opts.fresh && s.stage === 'done' && s.result === 'champion' && !currentState.uclTrophyShown) {
    currentState.uclTrophyShown = true;
    showTrophy({ kind: 'ucl', title: '챔피언스리그 우승', sub: `${currentState.club.name} · 시즌 ${currentState.seasonNumber}`, lines: uclJourneyLines(s), reward: `우승 상금 +${UCL_REWARDS_FUNDS.champion}G · 명성 대폭 상승` });
  }
  document.getElementById('ucl-next')?.addEventListener('click', () => {
    updateRecords((r) => recordUcl(r, { result: s.result, season: currentState.seasonNumber }));
    // 챔스 결과로 판정하는 이사진 요구(deferred)를 여기서 확정한다.
    const dm = currentState.pendingBoardReview?.demand;
    if (dm?.deferred) {
      dm.achieved = evaluateDemand(dm.cardId, { uclQualified: true, uclResult: s.result });
      dm.funds = dm.achieved ? Math.round(seasonBaseGrant() * BOARD_DEMAND_REWARD[dm.difficulty]) : 0;
      dm.deferred = false;
      if (dm.achieved) awardPrestige(demandPrestige(dm.difficulty));
    }
    currentState.uclTrophyShown = false;
    awardPrestige(uclPrestige(s.result, { alsoLeagueChampion: currentState.leagueResultThisSeason === 'champion' }));
    currentState.funds += UCL_REWARDS_FUNDS[s.result];
    if (s.result === 'champion') {
      currentState.uclTitles += 1;
      if (currentState.leagueResultThisSeason === 'champion') currentState.doubles = (currentState.doubles ?? 0) + 1;
    }
    currentState.uclResults = { ...(currentState.uclResults ?? {}), [s.result]: ((currentState.uclResults ?? {})[s.result] ?? 0) + 1 };
    currentState.ucl = null;
    startNewSeason();
  });
}

// 통계로 보낼 이번 시즌 요약(개인정보 없음). 읽지 못하는 값이 있어도 게임은 계속된다.
function telemetrySnapshot() {
  try {
    currentState.telemetryRun ??= Math.random().toString(36).slice(2, 8);
    const fid = currentFormation();
    const { lineup, bench } = pickBestXI(currentState.squad, fid, currentState.manualOverrides, currentState.benchOverrides);
    const power = computeTeamPower(lineup, bench, currentState.manager.tier, currentState.chemistry, coachFor(), powerExtras());
    return {
      run: currentState.telemetryRun, s: currentState.seasonNumber, tier: currentState.leagueTierId, club: currentState.club?.id, // 입력한 이름은 보내지 않고 기본 구단 id만
      fm: fid, mgr: currentState.manager?.tier, pow: Math.round(power * 10) / 10,
      avg: Math.round(lineup.reduce((x, p) => x + p.baseOVR, 0) / Math.max(1, lineup.length) * 10) / 10,
      chem: Math.round(currentState.chemistry), funds: currentState.funds, squad: currentState.squad.length,
      dem: currentState.boardDemand?.cardId ?? null,
      score: currentState.prestige?.total ?? 0,
    };
  } catch (e) {
    return { run: currentState?.telemetryRun, s: currentState?.seasonNumber, tier: currentState?.leagueTierId };
  }
}

// 시즌 결과를 역대 기록에 남기고, 리그 우승이면 트로피 연출을 띄운다.

function recordSeasonEnd(result, points, rank = null) {
  // 이번 런의 명예 점수 재료(리그별 우승, 연속 우승)
  if (result === 'champion') {
    const t = currentState.leagueTierId;
    currentState.titlesByTier = { ...(currentState.titlesByTier ?? {}), [t]: ((currentState.titlesByTier ?? {})[t] ?? 0) + 1 };
    currentState.titleStreak = (currentState.titleStreak ?? 0) + 1;
    if (currentState.titleStreak >= 2) currentState.streakPoints = (currentState.streakPoints ?? 0) + REPUTATION_STREAK_BONUS;
  } else {
    currentState.titleStreak = 0;
  }
  currentState.leagueResultThisSeason = result;
  track('season', { ...telemetrySnapshot(), res: result, rank, pts: Math.round(points) });
  updateRecords((r) => recordSeason(r, {
    season: currentState.seasonNumber, club: currentState.club.name, tierId: currentState.leagueTierId, result, rank, points: Math.round(points),
    streak: currentState.titleStreak,
  }));
  if (result === 'champion') {
    showTrophy({
      kind: 'league',
      title: `${LEAGUE_NAMES[currentState.leagueTierId]} 우승`,
      sub: `${currentState.club.name} · 시즌 ${currentState.seasonNumber} · 승점 ${Math.round(points)}`,
    });
  }
}

function runSecondHalfAndFinish(saleMessage = '') {
  const { manager } = currentState;
  const capMsg = enforceSquadCap();
  if (capMsg) saleMessage = saleMessage ? `${saleMessage} / ${capMsg}` : capMsg;
  const callUps = ensurePositionCoverage();
  if (callUps.length) {
    const msg = `포지션 공백으로 유스 긴급 콜업: ${callUps.join(', ')}`;
    saleMessage = saleMessage ? `${saleMessage} / ${msg}` : msg;
  }
  const { lineup, slotted, bench } = pickBestXI(currentState.squad, currentFormation(), currentState.manualOverrides, currentState.benchOverrides);
  // 겨울 마감 시점에도 여름과 똑같이 한 번 체크(겨울에 선수단을 갈아엎은 걸 반영)
  const harmonyMsg = applyManagerTacticalHarmony(lineup);
  if (harmonyMsg) saleMessage = saleMessage ? `${saleMessage} / ${harmonyMsg}` : harmonyMsg;
  const secondHalf = roundHalfPoints(runHalfSeason(
    lineup,
    bench,
    manager.tier,
    currentState.chemistry,
    currentState.leagueTierId,
    Math.random,
    coachFor(),
    currentState.direction ?? 'balance'
  ));
  const firstHalf = roundHalfPoints(currentState.firstHalfPoints ?? 0); // 옛 저장(소수점)도 같은 규칙으로
  const totalPoints = firstHalf + secondHalf;
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

  // 최종 순위(1~20). 1부는 4위 이내면 챔피언스리그에 나간다(리그가 끝난 뒤 별도 진행).
  const isTop = currentState.leagueTierId === 'tier1';
  // 후반기 순위표는 전반기 승점 위에 쌓은 시즌 누적표 - 화면 마지막 라운드의 내 순위가 곧 최종 순위다.
  const rivals = currentState.seasonRivals ?? buildLeagueRivals(currentState.leagueTierId, MATCHES_PER_HALF).map((c) => ({ name: c.name, kit: c.kit }));
  const seasonTable = simulateLeagueTable(secondHalf, tier, Math.random, 19, { ...(currentState.firstHalfBase ?? {}), me: firstHalf });
  const finalRank = finalRankFromTable(seasonTable, result, isTop ? 4 : 3);
  const uclQualified = isTop && finalRank <= 4;
  const uclPowerAway = uclQualified
    ? computeTeamPower(lineup, bench, manager.tier, currentState.chemistry / 2, coachFor(), powerExtras())
    : 0;
  const uclPower = uclQualified
    ? computeTeamPower(lineup, bench, manager.tier, currentState.chemistry, coachFor(), powerExtras())
    : 0;
  const uclResultId = null;

  const outcome = judgeRunOutcome({
    seasonResult: result,
    leagueTierId: currentState.leagueTierId,
    missedTargetCount: currentState.missedTargetCount,
  });
  const canPromote = outcome.canPromote;

  showHarmonyNotice(harmonyMsg, () => renderSimulating(currentState.club.name, tier.label, '후반기', currentState.club.kit, secondHalf, () => {
    finishSeasonRender();
  }, { table: seasonTable, rivals, second: true, isTop }));

  function finishSeasonRender() {
  // 명성 점수: 이번 시즌 성적을 점수로 바꿔 더한다(요구 달성은 아래에서 판정되면 이어서 더한다)
  const pst = prestigeState();
  const seasonPts = seasonPrestige({ tierId: currentState.leagueTierId, result, points: totalPoints, safePoints: tier.safePoints, combo: pst.combo, titleStreak: pst.titleStreak });
  pst.combo = seasonPts.combo;
  pst.titleStreak = seasonPts.titleStreak;
  const seasonRows = [...seasonPts.rows];
  awardPrestige(seasonPts.rows);
  if (outcome.ended) {
    // 같은 클릭에서 보드진의 신임이 발동하고도 목표 미달로 경질될 수 있다.
    // 그 경우에도 성향이 발동했다는 사실은 알려야 한다.
    recordSeasonEnd(result, totalPoints);
    renderRunEnd(outcome.reason, totalPoints, boardTrustMessage, uclResultId);
    return;
  }

  // 이사진 목표 정산 - 보상은 다음 시즌 시작(startNewSeason)에 지급하고 팝업으로 알린다.
  // 성골 유스 대가: 선발로 뛴 시즌이 끝나면 일정 확률로 이적 요구(다음 시즌 브리핑에서 결정).
  const ace = lineup.find((p) => p.specialTrait === 'seongGolYouth');
  currentState.pendingTransferDemand = ace && Math.random() < SEONGGOL_TRANSFER_DEMAND_CHANCE
    ? { id: ace.id, name: ace.name }
    : null;
  const goal = currentBoardGoal();
  const reward = boardReward(totalPoints, goal, seasonBaseGrant());
  const chosen = currentState.boardDemand;
  const demandCard = chosen ? getDemand(chosen.cardId) : null;
  // 챔피언스리그 결과가 필요한 카드(deferred)는 챔스에 나갈 때만 챔스가 끝난 뒤로 판정을 미룬다.
  const demandDeferred = !!demandCard?.deferred && uclQualified;
  const demandAchieved = demandCard && !demandDeferred ? evaluateDemand(demandCard.id, {
    lineup, chemistry: currentState.chemistry, track: currentState.seasonTrack,
    firstHalfPoints: currentState.firstHalfPoints, grant: seasonBaseGrant(), goal,
    uclQualified, uclResult: null,
  }) : false;
  const demandFunds = demandAchieved ? Math.round(seasonBaseGrant() * BOARD_DEMAND_REWARD[chosen.difficulty]) : 0;
  if (demandAchieved) { const dr = demandPrestige(chosen.difficulty); awardPrestige(dr); seasonRows.push(...dr); }
  currentState.pendingBoardReview = {
    goal, points: Math.round(totalPoints), ...reward,
    demand: demandCard ? { cardId: demandCard.id, text: demandCard.text, difficulty: chosen.difficulty, achieved: demandAchieved, funds: demandFunds, deferred: demandDeferred } : null,
  };
  const demandLine = demandCard
    ? `이사진 요구 "${demandCard.text}" → <b>${demandDeferred ? '챔피언스리그가 끝나면 판정됩니다' : demandAchieved ? `달성! 다음 시즌 자금 +${demandFunds}G` : '미달(불이익 없음)'}</b>`
    : '';
  const goalLine = reward.surplus > 0
    ? `이사진 목표 ${goal}점 → <b>${reward.surplus}점 초과 달성!</b> 다음 시즌 자금 +${reward.funds}G, 적응도 +${reward.chemistry}`
    : `이사진 목표 ${goal}점 → ${reward.surplus === 0 ? '딱 맞췄지만 초과는 아닙니다' : `${-reward.surplus}점 모자랐습니다`}`;

  let dockHtml;
  let closingHtml = '';
  if (canPromote) {
    closingHtml = `<div class="stadiumbox">${stadiumHtml(stadiumLevel(getNextTier(currentState.leagueTierId)), currentState.club.kit)}<small>${getLeagueTier(getNextTier(currentState.leagueTierId)).label} 구장으로 확장</small></div><p class="note">승격 보상: 적응도 +${PROMOTION_CHEMISTRY_BONUS}, 새 리그 첫 시즌 지급액은 ${PROMOTION_STAY_FUNDS_RATIO * 100}%</p>`;
    dockHtml = `<button class="cta" id="promote-btn">${getLeagueTier(getNextTier(currentState.leagueTierId)).label}로 승격</button>`;
  } else {
    const left = MISSED_TARGET_LIMIT - currentState.missedTargetCount;
    closingHtml = left <= 2
      ? `<p class="note"><b>목표 미달 ${currentState.missedTargetCount}회.</b> ${left}회 더 미달하면 해임됩니다.</p>`
      : '';
    // 1부는 더 올라갈 데가 없어서 목표를 달성해도 승격 버튼이 안 나온다.
    // 아무 설명이 없으면 왜 제자리인지 알 수 없다.
    if (getNextTier(currentState.leagueTierId) === null) {
      closingHtml += '<p class="note">1부가 마지막 리그입니다. 우승해도 커리어는 이어지고, 해임될 때까지 계속 도전할 수 있습니다. 정상에서 내려오고 싶으면 아래에서 은퇴하세요.</p>';
      if ((currentState.titles ?? 0) > 0) closingHtml += '<button class="reroll" id="retire-btn">은퇴하고 커리어 완결</button>';
    }
    dockHtml = uclQualified
      ? '<button class="cta" id="ucl-btn">챔피언스리그 진출</button>'
      : '<button class="cta" id="continue-btn">같은 리그에서 새 시즌</button>';
  }

  // 승점 게이지: 안전/승격/우승선이 어디였는지 한 눈에
  const scale = Math.max(tier.championPoints * 1.1, totalPoints);
  const at = (v) => `${Math.min(100, (v / scale) * 100)}%`;

  setScreen(`
    <div class="verdict verdict--${result}">
      <div class="verdict__label">${esc(currentState.club.name)} · ${getLeagueTier(currentState.leagueTierId).label} 시즌 결산</div>
      <div class="verdict__result">${uclQualified && result === 'promotion' ? '챔피언스리그 진출' : FINAL_RESULT_LABELS[result]}</div>
      <div class="scoreline"><b>${totalPoints.toFixed(0)}</b><span>승점</span></div>
      <div class="finalrank">최종 순위 <b>${finalRank}위</b> / 20팀</div>
      <div class="halves">
        <span>전반기 <b>${firstHalf}</b></span>
        <span>후반기 <b>${secondHalf}</b></span>
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
    <div class="panel prestige">
      <div class="panel__head"><h2>명성 점수</h2><span class="panel__count">이번 시즌 <b class="n">+${seasonRows.reduce((s, x) => s + x.value, 0)}</b></span></div>
      <ul class="summary">
        ${seasonRows.map((x) => `<li><span>${esc(x.label)}</span><b>+${x.value}</b></li>`).join('') || '<li><span>이번 시즌은 점수가 없습니다</span><b>0</b></li>'}
        <li class="summary__total"><span>누적</span><b>${pst.total}</b></li>
      </ul>
    </div>
    ${boardTrustMessage}
    ${saleMessage ? `<div class="banner">${esc(saleMessage)}</div>` : ''}
    ${uclQualified ? '<div class="banner banner--ucl">리그 4위 이내로 마쳐 챔피언스리그에 진출했습니다. 시즌 결산 후 챔피언스리그가 이어집니다.</div>' : ''}
    <div class="panel">
      <ul class="summary">
        <li><span>최종 팀 전력</span><b>${computeTeamPower(lineup, bench, manager.tier, currentState.chemistry, coachFor(), powerExtras()).toFixed(1)}</b></li>
        <li><span>최종 적응도</span><b>${currentState.chemistry.toFixed(1)}</b></li>
        <li><span>${goalLine}</span></li>
        ${demandLine ? `<li><span>${demandLine}</span></li>` : ''}
        <li><span>남은 자금 (다음 시즌에 상한 30%까지 이월)</span><b>${currentState.funds.toFixed(0)}G</b></li>
      </ul>
      ${closingHtml}
    </div>
    <div class="panel">
      <div class="panel__head"><h2>최종 라인업</h2><span class="panel__count">${currentFormation()}</span></div>
      ${renderPitch(slotted, currentFormation(), currentState.club.kit)}
    </div>
  `, dockHtml);

  recordSeasonEnd(result, totalPoints, finalRank);
  document.getElementById('retire-btn')?.addEventListener('click', () => renderRunEnd('victory', totalPoints, '', null));
  document.getElementById('promote-btn')?.addEventListener('click', () => {
    updateRecords(recordPromotion);
    const nextTier = getNextTier(currentState.leagueTierId);
    currentState.chemistry = Math.min(100, currentState.chemistry + PROMOTION_CHEMISTRY_BONUS);
    currentState.promotionFundsBonusPending = true; // 지급 시점(startNewSeason)에 반영

    promoteToNextTier(nextTier);
  });
  document.getElementById('continue-btn')?.addEventListener('click', startNewSeason);
  document.getElementById('ucl-btn')?.addEventListener('click', () => {
    currentState.ucl = createUcl(uclPower, Math.random, { myPowerAway: uclPowerAway });
    currentState.ucl.teams[0].name = currentState.club.name;
    saveRun(currentState, localStorage);
    renderUcl();
  });
  }
}

// 승격하면 구단을 옮기지 않고 같은 구단으로 새 리그에 올라간다(선수단 유지).
function promoteToNextTier(nextTierId) {
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
}

const RUN_END = {
  victory: {
    kicker: '커리어 완결',
    title: '정상에서 은퇴',
    body: '5부에서 시작해 1부 정상까지 올라, 박수 칠 때 떠났습니다. 이 런은 여기서 완결됩니다.',
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
  const p = prestigeState();
  if (reason === 'victory' && !p.retired) { p.retired = true; awardPrestige(retirePrestige()); }
  const score = p.total;
  const before = loadRecords(localStorage);
  const entryT = Date.now();
  const after = updateRecords((r) => recordRunEnd(r, {
    reputation: 0, seasons: currentState.seasonNumber, retired: reason === 'victory', score,
    entry: { t: entryT, club: currentState.club.name, seasons: currentState.seasonNumber, tierId: currentState.highestTierId, reason },
  }));
  const rank = after.topRuns.findIndex((x) => x.t === entryT) + 1; // 0이면 TOP 10 밖
  const grade = gradeOf(score);
  const prevBest = before.bestScore ?? 0;
  const isBest = score > prevBest;
  const t0 = titleProgress(before.careerScore ?? 0);
  const t1 = titleProgress(after.careerScore ?? 0);
  track('run_end', { run: currentState.telemetryRun, reason, seasons: currentState.seasonNumber, score, grade, best: currentState.highestTierId, club: currentState.club?.id });

  // "다음 목표": 바로 위 순위(없으면 TOP 10 문턱)까지 몇 점 남았는지
  let rankLine;
  if (rank === 1) rankLine = isBest ? '내 기록 1위 · 새 최고 기록!' : '내 기록 1위';
  else if (rank > 1) rankLine = `내 기록 ${rank}위 · ${rank - 1}위까지 ${after.topRuns[rank - 2].score - score + 1}점`;
  else rankLine = after.topRuns.length >= 10 ? `TOP 10까지 ${after.topRuns[after.topRuns.length - 1].score - score + 1}점` : '내 기록 TOP 10 밖';
  const rows = PRESTIGE_ROW_ORDER.filter((id) => (p.rows[id] ?? 0) > 0)
    .map((id) => `<li><span>${PRESTIGE_LABELS[id]}</span><b>+${p.rows[id]}</b></li>`).join('');
  const titleUp = t1.index > t0.index;

  setScreen(`
    <div class="verdict verdict--${reason === 'victory' ? 'champion' : 'relegation'}">
      <div class="verdict__label">${copy.kicker}</div>
      <div class="verdict__result">${copy.title}</div>
      <p class="note" style="text-align:center">${currentState.ownerName ? `${esc(currentState.ownerName)} 단장 · ` : ''}${esc(currentState.club.name)}</p>
      <div class="gradebox grade--${grade}">
        <b class="gradebox__grade">${grade}</b>
        <div class="gradebox__score"><b class="n">${score}</b><span>명성 점수</span></div>
      </div>
      <div class="stadiumbox">${stadiumHtml(stadiumLevel(currentState.highestTierId), currentState.club.kit)}</div>
      <p class="rankline${isBest ? ' is-best' : ''}">${rankLine}${isBest ? '' : prevBest ? ` · 최고 ${prevBest}` : ''}</p>
    </div>
    ${boardTrustMessage}
    ${uclResultId ? `<div class="banner banner--ucl">챔피언스리그 ${UCL_RESULT_LABELS[uclResultId]}</div>` : ''}
    <div class="panel titlecard">
      <div class="panel__head"><h2>${titleUp ? `칭호 승급 · ${esc(t1.title)}` : esc(t1.title)}</h2><span class="panel__count">누적 <b class="n">${after.careerScore}</b>점</span></div>
      ${titleUp ? `<p class="note"><b>${esc(t0.title)}</b> → <b>${esc(t1.title)}</b></p>` : ''}
      <div class="rankbar"><i style="width:${Math.round(t1.progress * 100)}%"></i></div>
      <p class="note">${t1.next ? `다음 칭호 <b>${esc(t1.next)}</b>까지 ${t1.remaining}점` : '최고 칭호입니다'}</p>
    </div>
    <div class="panel">
      <p class="note">${copy.body}</p>
      <ul class="summary">
        ${rows}
        <li class="summary__total"><span>합계</span><b>${score}</b></li>
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
    returnGodToPool(keyPlayer);
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
function renderPitch(slotted, formationId, kit, { interactive = false, selectedSlot = null, finalOVR = null, activeTags = null } = {}) {
  const { slots, coords } = FORMATIONS[formationId];
  const chips = slots.map((pos, i) => {
    const p = slotted[i];
    const [x, y] = coords[i];
    const style = `left:${(8 + x * 0.84).toFixed(1)}%;top:${(7 + y * 0.86).toFixed(1)}%`; // 카드가 커져서 위아래 여백을 남기고 눌러 담는다
    const slotAttr = interactive ? `data-slot="${i}"` : '';
    const selected = interactive && selectedSlot === i ? ' is-selected' : '';
    if (!p) {
      return `<div class="slot slot--empty${selected}" style="${style}" ${slotAttr}>
        <div class="slot__card"><svg class="slot__ghost" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21 C4 15 8 13 12 13 C16 13 20 15 20 21 Z"/></svg><span class="slot__pos">${pos}</span><span class="slot__name">공석</span></div>
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
        <span class="slot__pos">${pos}</span>
        ${boost > 0 ? `<span class="slot__boost n">+${boost}</span>` : ''}
        ${renderPortrait(p, { size: 36, kit })}
        <span class="slot__name">${esc(p.name.split(" ").slice(1).join(" ") || p.name)}</span>
        ${tagIconsHtml(p, activeTags?.get(p.id))}
      </div>
    </div>`;
  }).join('');

  const off = slotted.filter((p) => p && p.offPosition).length;
  const note = off
    ? `<p class="note"><b>금색 점선</b> ${off}명은 주 포지션이 아닌 자리에 섰습니다.</p>`
    : '';
  return `<div class="pitch${interactive ? ' pitch--interactive' : ''}">${chips}</div>${note}`;
}

// 피치에서 선수 칸을 눌렀을 때: 그 선수가 어떤 케미에서 몇 점 받는지 출처별로.
function renderBonusDetail(player, lineup, bench, coach) {
  if (!player) return '';
  const labelOf = { playstyle: TAG_LABELS, self: TRAIT_LABELS, team: TRAIT_LABELS, coach: { headCoach: '수석 코치' } };
  const parts = computePlayerBonusBreakdown(player, lineup, bench, coach);
  const total = parts.reduce((s, x) => s + x.value, 0);
  const rows = parts.length
    ? parts.map((x) => `<div class="bonusdetail__row"><span>${esc(labelOf[x.kind][x.id] ?? x.id)}</span><b>+${x.value}</b></div>`).join('')
      + `<div class="bonusdetail__row bonusdetail__total"><span>합계</span><b>+${total}</b></div>`
    : '<div class="note">받는 케미 보너스가 없습니다. (태그 인원이 모자라거나, 그 태그의 보너스 포지션이 아닙니다)</div>';
  return `<div class="panel bonusdetail">
    <div class="panel__head"><h2>${esc(player.name)} · ${player.position} · 기본 ${player.baseOVR}</h2></div>
    ${rows}
  </div>`;
}

// 전술 탭에서 칸을 선택했을 때 그 자리에 넣을 선수를 고르는 목록.
// 포지션이 맞는 선수를 위로 올리고, 이미 선발인 선수도 옮길 수 있게 그대로 둔다
// (다른 자리로 옮기면 원래 자리는 자동 배치로 돌아간다).
// selectedSlot은 피치 자리(숫자 인덱스)거나 벤치 자리("bench-0"~"bench-4")다 -
// 벤치도 선발 라인업과 똑같이 선수 목록에서 직접 고를 수 있게 같은 피커를 쓴다.
// 벤치는 고정 포지션이 없어서 포지션 일치 정렬/강조가 없다.
// 이미 선발/벤치로 뽑힌 선수는 여기 안 보인다 - 그 둘끼리는 슬롯을 직접
// 클릭해서 맞바꾸면 된다(handleSlotClick). 여기는 순수히 "아직 안 뽑힌
// 예비 선수를 이 자리에 데려오기"용 목록이다.
function renderSlotPicker(squad, formationId, selectedSlot, inXI, benchIds) {
  if (selectedSlot === null || selectedSlot === undefined) return '';
  const isBench = typeof selectedSlot === 'string' && selectedSlot.startsWith('bench-');
  const pos = isBench ? null : FORMATIONS[formationId].slots[selectedSlot];
  const reserves = squad.filter((p) => !inXI.has(p.id) && !benchIds.has(p.id) && (!pos || p.position === pos));
  const rows = [...reserves]
    .sort((a, b) => {
      if (!pos) return b.baseOVR - a.baseOVR;
      const matchDiff = (b.position === pos ? 1 : 0) - (a.position === pos ? 1 : 0);
      return matchDiff || b.baseOVR - a.baseOVR;
    })
    .map((p) => `
      <li class="pickrow${p.position === pos ? ' is-match' : ''}" data-pick-slot="${selectedSlot}" data-pick-player="${p.id}">
        ${renderPortrait(p, { size: 30 })}
        <span class="pickrow__name">${esc(p.name)}</span>
        <span class="pickrow__pos">${p.position}</span>
        ${playerTagsHtml(p)}
        <b class="pickrow__ovr n">${p.baseOVR}</b>
      </li>`)
    .join('');
  return `<div class="panel picker">
    <div class="panel__head"><h2>${isBench ? '벤치' : pos} 자리에 데려올 예비 선수</h2></div>
    <ul class="pickrows">${rows || '<li class="empty">예비 선수가 없습니다. 다른 선발/벤치 자리를 눌러 맞바꾸세요.</li>'}</ul>
  </div>`;
}

// 피파4 팀컬러처럼: 플레이스타일/대륙 태그가 베스트11에 몇 명 있는지 보여주고
// 문턱(기본 3명/5명, 감독·폴리글롯이 있으면 감면)을 넘었는지 색으로 알려준다.
// tagDef.tier3/tier5는 인원수가 아니라 그 인원 채웠을 때 실제로 붙는 OVR
// 보너스 값이다(engine/ovr.mjs) - 배지 설명에 필요 인원과 보너스를 분리해서 쓴다.
function renderChemistryPanel(lineup, bench) {
  const { manager } = currentState;

  const playstyleRows = Object.entries(PLAYSTYLE_TAGS)
    .map(([tagId, def]) => {
      const { count, need, tier, req, values } = playstyleTagProgress(tagId, lineup);
      const bonus = values[Math.max(0, tier - 1)];
      const caption = `${count}/${need} · +${bonus}`;
      const positions = def.positions.join('·');
      // 문턱도 보너스도 그 포지션에 서 있는 보유자만 센다 - "누가 받는지"를 따로 보여준다.
      const beneficiaries = tier
        ? lineup.filter((p) => p.playstyleTags.includes(tagId) && def.positions.includes(p.position))
        : [];
      const desc = `${positions} 포지션에 선 보유자만 인원에 세고 보너스를 받습니다`
        + `. 단계: ${tagLadderText(req, values)}`
        + (beneficiaries.length ? `. 지금 받는 선수: ${beneficiaries.map((p) => p.name).join(', ')}` : '');
      // 다음 단계까지 몇 명 더 필요하고, 그때 지금 라인업 중 몇 명이 받는지(계획용).
      const receivers = lineup.filter((p) => def.positions.includes(p.position)).length;
      const more = tier >= req.length ? '최대' : `${need - count}명 더 → +${values[tier]} (${receivers}명 수혜)`;
      return { icon: renderTagIcon(PLAYSTYLE_ICON_PATHS, tagId), label: TAG_LABELS[tagId] ?? tagId, desc, caption, tier, more, grade: def.grade, near: tier < req.length && need - count === 1 };
    })
    .sort((a, b) => b.tier - a.tier);

  const badge = (r) => `<li class="chembadge${r.tier ? ` is-tier${Math.min(r.tier, 2)}` : ''}${r.near ? ' is-near' : ''}" data-chem-desc="${esc(r.label)}: ${esc(r.desc)}${r.more ? ` — 다음 단계: ${esc(r.more)}` : ''}" title="${esc(r.label)} · ${esc(r.desc)}">
    <div class="chembadge__ring">${r.icon}</div>
    <span class="chembadge__label">${esc(r.label)}</span>
    <span class="chembadge__count">${r.caption}${r.near ? ' ▲' : ''}</span>
  </li>`;

  // 특수 태그는 지금 뛰는 선발+벤치(16명)만 본다 - 그 밖의 선수는 이번 주
  // 효과가 발동하지 않는 죽은 정보라 노이즈만 된다. 종류별로 묶어서 배지 하나 +
  // 인원수로 보여준다(선수 한 명씩 카드로 나열하던 예전 판보다 훨씬 짧다).
  const inXI = new Set(lineup.map((p) => p.id));
  const holders = [...lineup, ...bench].filter((p) => p.specialTrait);
  // 발동 = 자기 역할 칸에 배정됨 / 대기 = 그 칸을 다른 선수가 차지 / 자리 아님 = 칸이 요구하는 자리(선발/벤치)가 아님
  const stateOf = (p) => {
    if (p.specialTrait === 'superSub') return inXI.has(p.id) ? ['off', '선발이라 효과 없음'] : ['on', '발동'];
    if (!inXI.has(p.id)) return ['off', '벤치라 효과 없음'];
    return p.specialTrait === 'veteranLeader' && p.age < 33 ? ['off', '33세 미만'] : ['on', '발동'];
  };
  const traitSection = holders.length ? `
    <h3 class="chemgroup__title">선수 특수 태그</h3>
    <ul class="traitrows">
      ${holders.map((p) => {
        const [st, stText] = stateOf(p);
        return `<li class="traitrow is-${st}" data-chem-desc="${esc(p.name)} · ${esc(TRAIT_LABELS[p.specialTrait])}: ${esc(TRAIT_EFFECT_DESCRIPTIONS[p.specialTrait] ?? '')}. 대가: ${esc(TRAIT_DOWNSIDE_TEXT[p.specialTrait] ?? '')}">
          <span class="traitrow__icon">${renderTagIcon(TRAIT_ICON_PATHS, p.specialTrait)}</span>
          <span class="traitrow__name">${esc(p.name)}</span>
          <span class="traitrow__trait">${esc(TRAIT_LABELS[p.specialTrait])}</span>
          <b class="traitrow__state">${stText}</b>
        </li>`;
      }).join('')}
    </ul>` : '';

  return `<div class="panel">
    <div class="panel__head"><h2>팀 케미</h2></div>
    <h3 class="chemgroup__title">플레이스타일</h3>
    ${Object.entries(TAG_GRADE_LABELS).filter(([g]) => g === 'basic' || isUnlocked(g)).map(([g, label]) => `<div class="chemgrade chemgrade--${g}">
      <div class="chemgrade__head"><i></i><b>${label}</b></div>
      <ul class="chembadges">${playstyleRows.filter((r) => r.grade === g).map(badge).join('')}</ul>
    </div>`).join('')}
    ${traitSection}
    <p class="note" id="chem-desc"></p>
  </div>`;
}

// 플레이스타일 태그 등급(기본기·보통·어려움). 같은 이름과 색을 영입·전술·선수단에서 쓴다.
const TAG_GRADE_LABELS = { basic: '기본기', mid: '보통', hard: '어려움' };

const visibleTabs = () => TABS.filter((t) => t.id !== 'staff' || isUnlocked('staff'));
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

// 포지션이 비어 있는 채로 경기를 시작하려 하면 먼저 알린다. 그대로 가면
// 능력치가 가장 낮은 무명 유스(태그 없음)가 빈자리를 채운다.
function showLineupWarning(missing, onProceed, onCancel) {
  const root = document.getElementById('eventmodal-root');
  root.innerHTML = `
    <div class="eventmodal-backdrop">
      <div class="eventmodal eventmodal--bad">
        <div class="eventmodal__kicker">라인업 경고</div>
        <div class="eventmodal__title">${esc([...new Set(missing)].join('·'))} 자리가 비었습니다</div>
        <p class="eventmodal__detail">이대로 시작하면 능력치가 가장 낮은 무명 유스(태그 없음) ${missing.length}명이 빈자리를 채웁니다.</p>
        <button class="cta" id="warn-proceed">그대로 시작</button>
        <button class="reroll" id="warn-cancel" style="margin-top:var(--s2);width:100%">돌아가서 보강하기</button>
      </div>
    </div>`;
  document.getElementById('warn-proceed').onclick = () => { root.innerHTML = ''; onProceed(); };
  document.getElementById('warn-cancel').onclick = () => { root.innerHTML = ''; onCancel(); };
}

function renderMarket(banner = '') {
  const { club, manager, staff, squad, funds, chemistry, eventMessage, eventTone, shopOffer, phase, week, listedForSale } = currentState;
  const maxWeek = phase === 'summer' ? SUMMER_MARKET_WEEKS[1] : WINTER_MARKET_WEEKS[1];
  const phaseLabel = phase === 'summer' ? '여름 이적시장' : '겨울 이적시장';
  const isDeadlineWeek = phase === 'winter' && week === WINTER_MARKET_WEEKS[1];
  const formationId = currentFormation();
  const tab = visibleTabs().some((t) => t.id === currentState.tab) ? currentState.tab : 'draft';
  const manualOverrides = currentState.manualOverrides ?? {};
  const benchOverrides = currentState.benchOverrides ?? {};
  const { lineup, slotted, bench } = pickBestXI(squad, formationId, manualOverrides, benchOverrides);
  const inXI = new Set(lineup.map((p) => p.id));

  // 스트립은 시너지가 반영된 최종 OVR로 계산한다. 포메이션을 바꿨을 때
  // 숫자가 왜 움직이는지(태그 발동/해제) 읽히게 하려면 baseOVR로는 안 된다.
  // 지금 실제로 보너스를 주고 있는 태그(초록 아이콘): 플레이스타일/대륙 시너지가 발동한 것만
  const activeTags = new Map(lineup.map((p) => [
    p.id,
    new Set(computePlayerBonusBreakdown(p, lineup, bench, coachFor()).filter((x) => x.kind === 'playstyle').map((x) => x.id)),
  ]));
  const finalOVR = new Map(lineup.map((p) => [p.id, computePlayerFinalOVR(p, lineup, bench, coachFor())]));
  const groupAvg = (positions) => {
    const members = lineup.filter((p) => positions.includes(p.slotPosition));
    if (!members.length) return null;
    return members.reduce((sum, p) => sum + finalOVR.get(p.id), 0) / members.length;
  };
  const teamPower = computeTeamPower(lineup, bench, manager.tier, chemistry, coachFor(), powerExtras());

  const weekStart = phase === 'summer' ? SUMMER_MARKET_WEEKS[0] : WINTER_MARKET_WEEKS[0];
  const dots = Array.from({ length: maxWeek - weekStart + 1 }, (_, i) => {
    const w = weekStart + i;
    return `<i class="${w < week ? 'is-done' : w === week ? 'is-now' : ''} ${phase === 'winter' ? 'is-winter' : ''}"></i>`;
  }).join('');

  const track = currentState.seasonTrack;
  const net = track.income - track.spent;
  const otherFlow = funds - track.start + track.spent - track.income;
  const decay = transactionDecayAmount();
  const decayLabel = decay > 0 ? `적응도 -${decay}` : '적응도 유지';

  const matchesTag = (c) => {
    const f = currentState.offerTag;
    if (!f) return true;
    const [kind, id] = f.split(':');
    return c.playstyleTags.includes(id);
  };
  const offerHtml = shopOffer.filter((c) => (!currentState.offerFilter || c.position === currentState.offerFilter) && matchesTag(c)).map((c) => {
    const price = cardPrice(c);
    const affordable = funds >= price;
    const tier = tierOf(c.baseOVR);
    // 정답(팀 +X.X 델타)은 안 주고 재료만 준다 - 태그 옆에 지금 라인업이
    // 몇 명째인지만 보여주고, "그래서 사야 하는지"는 유저가 판단한다.
      // 칩에는 "라벨 n/m"만 - 영입 시 발동(▲ 초록)/강화(▲ 금색)는 색으로, 보너스
    // 포지션이 아니면 흐리게. 자세한 문장은 칩을 눌렀을 때 카드 아래에 뜬다.
    // reach: 영입하면 넘는 문턱의 순번(0 = 첫 문턱 발동, 1 이상 = 강화), 없으면 -1
    // 칩은 아이콘 + "n/m"만. 이름과 규칙은 눌렀을 때 카드 아래에 뜬다.
    // reach: 영입하면 넘는 문턱의 순번(0 = 첫 문턱 발동, 1 이상 = 강화), 없으면 -1
    const chip = (icon, count, need, reach, desc, label, dim = false, grade = '') => {
      const lvl = reach < 0 ? 0 : reach === 0 ? 1 : 2;
      return `<button type="button" class="chip${lvl ? ` chip--up${lvl}` : ''}${dim ? ' chip--dim' : ''}${grade ? ` chip--g-${grade}` : ''}" data-tag-desc="${esc(desc)}" title="${esc(label)}" aria-label="${esc(label)} ${count}/${need}">${icon}<b>${count}/${need}</b></button>`;
    };
    const tags = [
      ...c.playstyleTags.map((t) => {
        const { count, need, req, values } = playstyleTagProgress(t, lineup);
        const def = PLAYSTYLE_TAGS[t];
        const receives = def.positions.includes(c.position);
        const reach = receives ? req.indexOf(count + 1) : -1;
        const desc = `${TAG_LABELS[t] ?? t}: 지금 라인업 ${count}명. ${tagLadderText(req, values)} (${def.positions.join('·')} 포지션만 셈)`
          + (reach === 0 ? ' · 영입하면 발동!' : reach > 0 ? ' · 영입하면 강화!' : '')
          + (receives ? '' : ` · ${c.position}은(는) 대상 포지션이 아니라 인원에 안 셉니다`);
        return chip(renderTagIcon(PLAYSTYLE_ICON_PATHS, t), count, need, reach, desc, TAG_LABELS[t] ?? t, !receives, def.grade);
      }),
      c.specialTrait ? `<button type="button" class="chip chip--trait" data-tag-desc="${esc(`${TRAIT_LABELS[c.specialTrait]}: ${TRAIT_EFFECT_DESCRIPTIONS[c.specialTrait]}. 대가: ${TRAIT_DOWNSIDE_TEXT[c.specialTrait]}`)}" title="${esc(TRAIT_LABELS[c.specialTrait] ?? '')}" aria-label="${esc(TRAIT_LABELS[c.specialTrait] ?? '')}">${renderTagIcon(TRAIT_ICON_PATHS, c.specialTrait)}<b>${esc(ROLE_LABELS[TRAIT_ROLE[c.specialTrait]] ?? '')}</b></button>` : '',
    ].join('');
    // 같은 자리 비교: 이 선수가 들어가면 밀려날 선발(그 포지션 중 가장 약한 선수)과 개인 OVR만 견준다.
    // 팀 총점 같은 정답은 주지 않는다 - 비교 재료만.
    const slotCount = FORMATIONS[formationId].slots.filter((s) => s === c.position).length;
    const sameSlot = lineup.filter((p) => p.position === c.position).sort((a, b) => a.baseOVR - b.baseOVR)[0] ?? null;
    const lineupCount = lineup.filter((p) => p.position === c.position).length;
    let compareHtml;
    if (!slotCount) {
      compareHtml = `<div class="deal__cmp is-none">${c.position} 자리 없음</div>`;
    } else if (lineupCount < slotCount || !sameSlot) {
      compareHtml = `<div class="deal__cmp is-empty">${c.position} 공석 · 바로 선발</div>`;
    } else {
      const diff = c.baseOVR - sameSlot.baseOVR;
      compareHtml = `<div class="deal__cmp"><span>현재 ${c.position} <b class="n">${sameSlot.baseOVR}</b></span><em class="${diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat'} n">${diff > 0 ? '▲' : diff < 0 ? '▼' : '='}${Math.abs(diff)}</em></div>`;
    }
    const decayNote = decay > 0 ? `적응도 −${decay}` : '';
    return `<li class="offer deal" data-row="${c.id}" data-tier="${tier}" style="--tier:var(--t-${tier})">
      <div class="pcard">
        <b class="pcard__pos">${c.position}</b><b class="pcard__ovr n">${c.baseOVR}</b>
        <div class="pcard__art">${renderPortrait(c, { size: 56 })}</div>
        <button type="button" class="pcard__tier" data-tier-info="${tier}" aria-label="${TIER_LABELS[tier]} 등급">${TIER_LABELS[tier]}</button>
      </div>
      <div class="deal__body">
        <div class="deal__top"><span class="deal__name">${esc(c.name)}</span><span class="deal__age">${c.age}세${ageTrend(c.age, c.position)}</span></div>
        <div class="deal__tags">${tags}</div>
        ${compareHtml}
      </div>
      <button class="buy deal__buy" data-buy="${c.id}" ${affordable ? '' : 'disabled'} title="${decayNote}">
        <span>${affordable ? '영입' : '부족'}</span><b class="n">${price}G</b>
      </button>
      <p class="offer__hint" hidden></p>
    </li>`;
  }).join('');

  // 공석(포메이션이 요구하는데 스쿼드에 없는 포지션): 영입 탭 위 띠로 알리고, 누르면 그 포지션 매물만 본다.
  const gapCounts = {};
  for (const pos of missingPositions(squad, formationId)) gapCounts[pos] = (gapCounts[pos] ?? 0) + 1;
  const filterLabel = [
    currentState.offerFilter,
    currentState.offerTag ? TAG_LABELS[currentState.offerTag.split(':')[1]] : null,
  ].filter(Boolean).join(' · ');
  const gapBarHtml = Object.keys(gapCounts).length || filterLabel ? `<div class="gapbar">
      ${Object.entries(gapCounts).map(([pos, n]) => `<button class="gapchip${currentState.offerFilter === pos ? ' is-on' : ''}" data-gap="${pos}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21 C4 15 8 13 12 13 C16 13 20 15 20 21 Z"/></svg>공석 ${pos}${n > 1 ? ` ×${n}` : ''}</button>`).join('')}
      ${filterLabel ? `<button class="gapchip gapchip--clear" data-gap-clear>${esc(filterLabel)}만 보는 중 · 전체 보기</button>` : ''}
    </div>` : '';

  // 내 선수단 태그 현황: 가진 태그만 칩으로 보여주고(선발 인원/다음 문턱), 누르면 그 태그 매물만 본다.
  const heldPlay = {};
  for (const p of squad) {
    for (const t of p.playstyleTags ?? []) heldPlay[t] = (heldPlay[t] ?? 0) + 1;
  }
  const playChips = Object.keys(heldPlay).map((t) => ({ t, ...playstyleTagProgress(t, lineup) }))
    .sort((a, b) => b.tier - a.tier || b.count - a.count)
    .map(({ t, count, need, tier }) => `<button class="tagchip${tier ? ' is-on' : ''}${count === 0 ? ' is-zero' : ''}${currentState.offerTag === `playstyle:${t}` ? ' is-sel' : ''}" data-offer-tag="playstyle:${t}" title="선발 ${count}명 · 전체 ${heldPlay[t]}명">${renderTagIcon(PLAYSTYLE_ICON_PATHS, t)}${TAG_LABELS[t] ?? t}<b class="n">${count}/${need}</b></button>`).join('');
  const traitLines = [...lineup, ...bench].filter((p) => p.specialTrait).map((p) => `<span class="tagchip tagchip--trait" title="${esc(TRAIT_EFFECT_DESCRIPTIONS[p.specialTrait] ?? '')}">${renderTagIcon(TRAIT_ICON_PATHS, p.specialTrait)}${esc(p.name)}<b>${esc(TRAIT_LABELS[p.specialTrait])}</b></span>`).join('');
  const caps = scoutCaps();
  const targetOptions = ADVANCED_TAGS.map((t) => `<option value="${t}"${currentState.scoutTargetTag === t ? ' selected' : ''}>${esc(TAG_LABELS[t] ?? t)} (${PLAYSTYLE_TAGS[t].grade === 'hard' ? '어려움' : '보통'})</option>`).join('');
  const posOptions = POSITIONS.map((p) => `<option value="${p}"${currentState.scoutTargetPos === p ? ' selected' : ''}>${p}</option>`).join('');
  const scoutTargetHtml = caps.tag && isUnlocked('staff')
    ? `<div class="scoutbar" title="스카우터가 매주 이 조건의 선수를 1장 찾아 줍니다(다음 주부터)">
        <span class="scoutbar__label">${renderTagIcon(TRAIT_ICON_PATHS, 'scout')}목표</span>
        <select id="scout-target" aria-label="목표 태그"><option value="">태그</option>${targetOptions}</select>
        ${caps.position ? `<select id="scout-target-pos" aria-label="목표 포지션"><option value="">포지션</option>${posOptions}</select>` : ''}
      </div>`
    : '';
  const tagPanelCollapsed = currentState.tagPanelCollapsed !== false; // 기본은 접어 둔다
  const tagSummary = Object.keys(heldPlay).map((t) => ({ t, ...playstyleTagProgress(t, lineup) })).sort((a, b) => b.tier - a.tier || b.count - a.count).slice(0, 3).map((x) => `${TAG_LABELS[x.t] ?? x.t} ${x.count}/${x.need}`).join(' · ');
  const tagPanelHtml = playChips ? `<div class="tagpanel${tagPanelCollapsed ? ' is-collapsed' : ''}" id="tagpanel">
            <button class="tagpanel__head" id="tagpanel-toggle" aria-expanded="${!tagPanelCollapsed}"><b>내 태그</b><span class="tagpanel__sum">${tagSummary}</span><i class="panel__chev" aria-hidden="true">⌄</i></button>
      <div class="tagpanel__body">
        ${playChips ? `<div class="tagpanel__group"><em>플레이스타일</em><div>${playChips}</div></div>` : ''}
        ${traitLines ? `<div class="tagpanel__group"><em>특수</em><div>${traitLines}</div></div>` : ''}
      </div>
    </div>` : '';

  const starPlayer = [...squad].sort((a, b) => b.baseOVR - a.baseOVR)[0] ?? null;
  // 선수단 탭: 선발 / 벤치 / 예비 세 묶음으로 보여 준다. 행을 누르면 교체·판매 버튼이 펼쳐진다.
  const benchIds = new Set(bench.map((p) => p.id));
  const reservePlayers = squad.filter((p) => !inXI.has(p.id) && !benchIds.has(p.id)).sort((a, b) => b.baseOVR - a.baseOVR);
  const renderSquadRow = (p, group) => {
    const locked = !!p.boughtThisSeason; // 이번 시즌 영입한 선수는 방출/판매 불가
    const lockTitle = 'title="이번 시즌 영입한 선수는 판매할 수 없습니다"';
    const swap = group === 'xi'
      ? `<button class="act" data-swap-out="${p.id}">벤치로</button>`
      : `<button class="act act--main" data-swap-in="${p.id}" ${FORMATIONS[formationId].slots.includes(p.position) ? '' : 'disabled title="이 포메이션엔 그 자리가 없습니다"'}>선발 투입</button>`;
    return `<li class="srow srow--${group}" data-row="${p.id}" style="--tier:var(--t-${tierOf(p.baseOVR)})">
      <span class="srow__pos">${p.position}</span>
      <b class="srow__ovr n">${p.baseOVR}</b>
      <div class="srow__main">
        <div class="srow__name">${esc(p.name)}<small>${p.age}세${ageTrend(p.age, p.position)}</small>${currentState.justBoughtIds?.includes(p.id) ? '<span class="tag tag--new">NEW</span>' : ''}</div>
        ${tagIconsHtml(p)}
      </div>
      <div class="srow__side"><i class="srow__chev" aria-hidden="true">⌄</i></div>
      <div class="srow__acts" data-actions="${p.id}">
        ${swap}
        <button class="act" data-release-listed="${p.id}" ${locked ? `disabled ${lockTitle}` : 'title="1주 뒤 정산"'}>판매 등록</button>
        ${isDeadlineWeek ? `<button class="act act--warn" data-release-deadline="${p.id}" ${locked ? `disabled ${lockTitle}` : 'title="원가의 40% 회수"'}>데드라인 방출</button>` : ''}
      </div>
    </li>`;
  };
  // 공석(포메이션이 요구하는데 스쿼드에 없는 포지션): 누르면 영입 탭이 그 포지션으로 필터된다.
  const gapRows = Object.entries(gapCounts).map(([pos, n]) => `<li class="srow srow--gap">
      <span class="srow__pos">${pos}</span><b class="srow__ovr n">--</b>
      <div class="srow__main"><div class="srow__name">공석${n > 1 ? ` ×${n}` : ''}</div></div>
      <button class="gapchip" data-gap="${pos}">영입 보기</button>
    </li>`).join('');
  const sqSection = (title, cls, players, group, extra = '') => (players.length || extra) ? `<h3 class="sqsec sqsec--${cls}"><b>${title}</b><i class="n">${players.length}</i></h3>
    <ul class="squad squad--v2">${extra}${players.map((p) => renderSquadRow(p, group)).join('')}</ul>` : '';
  const squadHtml = sqSection('선발', 'xi', slotted.filter(Boolean), 'xi', gapRows)
    + sqSection('벤치', 'bench', bench, 'bench')
    + sqSection('예비', 'reserve', reservePlayers, 'reserve');

  const listedHtml = listedForSale
    .map((l) => (l.offers
      ? `<li class="offerrow"><span>${esc(l.card.name)}</span><span class="offerrow__btns">${l.offers.map((a) => `<button class="act act--main" data-accept="${l.card.id}:${a}"><b>${a}G</b></button>`).join('')}</span></li>`
      : `<li><span>${esc(l.card.name)}</span><span><b>${l.resolveWeek}</b>주차 정산</span></li>`))
    .join('') + (listedForSale.some((l) => l.offers) ? '<li class="listed__hint">기다리면 오퍼가 바뀝니다. 시장 마감까지 안 팔리면 태업(OVR -3)</li>' : '');

  const draftSub = isUnlocked('staff') ? currentState.draftSub ?? 'players' : 'players';
  const boardDemandCard = currentState.boardDemand ? getDemand(currentState.boardDemand.cardId) : null;
  const bodies = {
    draft: `
      <section class="panel tabpanel">
        <div class="subtabs" role="tablist">
          <button type="button" role="tab" data-draft-sub="players" aria-selected="${draftSub === 'players'}">선수 <i>${shopOffer.length}</i></button>
          ${isUnlocked('staff') ? `<button type="button" role="tab" data-draft-sub="manager" aria-selected="${draftSub === 'manager'}">감독</button>
          <button type="button" role="tab" data-draft-sub="staff" aria-selected="${draftSub === 'staff'}">스태프</button>` : ''}
          ${draftSub === 'players' ? `<button class="reroll" id="reroll-btn" ${funds >= rerollCost() ? '' : 'disabled'}>다시 뽑기 <b>${rerollCost()}G</b></button>` : ''}
        </div>
        ${draftSub === 'players' ? `${scoutTargetHtml}${tagPanelHtml}${gapBarHtml}
        <ul class="offers">${offerHtml || `<li class="empty">${currentState.offerFilter ? `이번 주 매물에 ${currentState.offerFilter}가 없습니다. 다시 뽑거나 전체 보기로 돌아가세요.` : '이번 주는 매물이 없습니다. 다시 뽑거나 다음 주로 넘어가세요.'}</li>`}</ul>` : ''}
        ${draftSub === 'manager' ? draftManagerHtml(funds) : ''}
        ${draftSub === 'staff' ? draftStaffHtml(funds) : ''}
      </section>`,
    tactics: `
      <section class="panel tabpanel">
        <div class="panel__head">
          <h2>포메이션</h2>
          <div class="formations">
            ${Object.keys(FORMATIONS).map((id) => `<button data-formation="${id}" aria-pressed="${id === formationId}">${id}</button>`).join('')}
          </div>
        </div>
        <div class="tactics__acts">
          <button class="reroll" id="auto-lineup-btn">최적 배치</button>
          <button class="reroll" id="reset-lineup-btn" ${Object.keys(manualOverrides).length || Object.keys(benchOverrides).length ? '' : 'disabled'}>초기화</button>
        </div>
        ${(() => {
          const missing = missingPositions(squad, formationId);
          return missing.length
            ? `<p class="note note--warn">⚠ 포지션 공백: ${missing.join('·')} 자리에 선수가 없습니다. 시즌을 시작하면 유스가 긴급 콜업됩니다 - 이적시장에서 미리 보강하세요.</p>`
            : '';
        })()}
        <div class="tactics__manager" style="--tier:var(--${MANAGER_TIER_COLOR[manager.tier] ?? 't-local'})">
          ${renderPortrait(manager, { size: 40 })}
          <div>
            <div class="player__name">${esc(manager.name)} 감독</div>
            <div class="player__meta">${MANAGER_TIER_LABELS[manager.tier] ?? manager.tier}${manager.trait ? ` · ${MANAGER_TRAIT_LABELS[manager.trait] ?? manager.trait}` : ''} · ${TAG_LABELS[manager.tacticalTag] ?? manager.tacticalTag}</div>
          </div>
        </div>
        ${renderPitch(slotted, formationId, club.kit, { interactive: true, selectedSlot: currentState.selectedSlot, finalOVR, activeTags })}
        <div class="benchstrip">
          <span class="benchstrip__label">벤치</span>
          ${bench.map((p, i) => `<div class="benchchip${currentState.selectedSlot === `bench-${i}` ? ' is-selected' : ''}" data-bench-slot="${i}" title="${esc(p.name)}">
            ${renderPortrait(p, { size: 28, kit: club.kit })}
            <span class="benchchip__pos">${p.position}</span>
            <b class="benchchip__ovr n">${p.baseOVR}</b>
          </div>`).join('')}
        </div>
        ${renderBonusDetail(slotted[currentState.selectedSlot], lineup, bench, coachFor())}
        ${renderSlotPicker(squad, formationId, currentState.selectedSlot, inXI, new Set(bench.map((p) => p.id)))}
      </section>
      ${renderChemistryPanel(lineup, bench)}`,
    squad: `
      <section class="panel tabpanel">
        <div class="sqsum">
          <span><b class="n${squad.length > squadCapFor(currentState.seasonNumber) ? ' is-over' : ''}">${squad.length}</b>/${squadCapFor(currentState.seasonNumber)}명</span>
          <span>평균 <b class="n">${avgAge(squad)}</b>세${lineup.length ? ` · 선발 <b class="n">${avgAge(lineup)}</b>세` : ''}</span>
          ${(() => {
            const yi = (ps) => ps.filter((p) => p.isDraftedYouth);
            const grp = [['선발', yi(slotted.filter(Boolean))], ['벤치', yi(bench)], ['예비', yi(reservePlayers)]];
            const tot = grp.reduce((a, [, ps]) => a + ps.length, 0);
            const parts = grp.filter(([, ps]) => ps.length).map(([l, ps]) => `${l} ${ps.length}`).join(', ');
            return `<button type="button" class="sqsum__youth" id="youth-btn" aria-expanded="false" ${tot ? '' : 'disabled'}>유스 <b class="n">${tot}</b>${parts ? `(${parts})` : ''}</button>`;
          })()}
        </div>
        <ul class="youthlist" id="youth-list" hidden>${[['선발', slotted.filter(Boolean)], ['벤치', bench], ['예비', reservePlayers]].flatMap(([l, ps]) => ps.filter((p) => p.isDraftedYouth).map((p) => `<li><b>${esc(p.name)}</b> <span>${p.position} · ${p.age}세 · OVR ${p.baseOVR}</span><em>${l}</em></li>`)).join('')}</ul>
        ${listedHtml ? `<ul class="listed">${listedHtml}</ul>` : ''}
        ${squadHtml}
      </section>`,
    staff: `
      <section class="panel tabpanel">
        ${(() => {
          const expected = LEAGUE_EXPECTED_MANAGER[currentState.leagueTierId] ?? 1;
          const mgr = MANAGER_TIER_MULTIPLIER[manager.tier];
          const fit = mgr / expected;
          return `<div class="fitbar" title="리그가 기대하는 감독 배율보다 내 감독이 낮으면 팀 전력이 깎입니다">
            <span>${getLeagueTier(currentState.leagueTierId).label} 기대 <b class="n">×${expected.toFixed(2)}</b></span>
            <span>내 감독 <b class="n">×${mgr.toFixed(2)}</b></span>
            <em class="${fit < 1 ? 'down' : 'up'} n">전력 ×${fit.toFixed(3)}</em>
          </div>`;
        })()}
        <ul class="crew">
          <li class="crewcard" style="--tier:var(--${MANAGER_TIER_COLOR[manager.tier] ?? 't-local'})">
            ${renderPortrait(manager, { size: 48 })}
            <div class="crewcard__body">
              <small class="crewcard__role">감독</small>
              <div class="player__name">${esc(manager.name)}</div>
              <div class="chips">${managerChipsHtml(manager, false)}${manager.trait && MANAGER_TRAIT_LABELS[manager.trait] ? `<span class="chip chip--plain" title="${esc(MANAGER_TRAIT_DESCRIPTIONS[manager.trait] ?? '')}">${MANAGER_TRAIT_LABELS[manager.trait]}</span>` : ''}</div>
            </div>
          </li>
          ${['headCoach', 'headScout'].map((role) => `
          <li class="crewcard" style="--tier:var(--${STAFF_LEVEL_COLOR[staff[role].level] ?? 't-local'})">
            ${renderPortrait(staff[role], { size: 48, role: role === 'headScout' ? 'scout' : 'coach' })}
            <div class="crewcard__body">
              <small class="crewcard__role">${STAFF_ROLE_LABELS[role]} · <b class="staff__level">${STAFF_LEVEL_LABELS[staff[role].level] ?? staff[role].level}</b></small>
              <div class="player__name">${esc(staff[role].name ?? '무명')}</div>
              <div class="chips">${staffChips(role, staff[role].level)}</div>
              ${role === 'headCoach' && (COACH_UNIT_BONUS_BY_LEVEL[staff.headCoach.level] ?? []).length ? `<div class="focus" role="group" aria-label="주력 유닛">${Object.keys(COACH_UNIT_LABELS).map((u) => `<button type="button" data-coach-focus="${u}" aria-pressed="${(staff.headCoach.focus ?? 'midfield') === u}">${COACH_UNIT_LABELS[u]}</button>`).join('')}</div>` : ''}
            </div>
          </li>`).join('')}
        </ul>
      </section>`,
  };

  const showEvent = week === (phase === 'summer' ? SUMMER_MARKET_WEEKS[0] : WINTER_MARKET_WEEKS[0]) && eventTone && eventMessage;

  document.documentElement.style.setProperty('--kit', club.kit ?? '#4a5a52');
  setScreen(`
    <header class="topbar" style="--kit:${club.kit ?? '#4a5a52'}">
      <div class="topbar__id">
        ${renderCrest(club, { size: 36 })}
        <div class="topbar__idText">
          <span class="topbar__club">${esc(club.name)}</span>
          <span class="topbar__phase">${phaseLabel} · ${week === maxWeek ? '이번 주가 마지막' : `${phase === 'summer' ? '전반기' : '후반기'} 시작까지 ${maxWeek - week}주`}</span>
        </div>
        <span class="topbar__week"><b>${week}</b>/${maxWeek}주</span>
      </div>
      <div class="weekdots">${dots}</div>
      <div class="res">
        <div class="res__item res__item--btn" id="funds-info-btn" role="button" tabindex="0">
          <span class="res__label">자금 <i class="res__hint">ⓘ</i></span>
          <span class="res__val n">${funds.toLocaleString('ko-KR')}<i>G</i></span>
        </div>
        <div class="res__item res__item--btn" id="chem-info-btn" role="button" tabindex="0">
          <span class="res__label">적응도 <i class="res__hint">ⓘ</i></span>
          <span class="res__val n">${chemistry.toFixed(1)}</span>
          <div class="chembar${chemistry < 40 ? ' is-low' : ''}"><i style="width:${Math.min(100, chemistry)}%"></i></div>
        </div>
        <div class="res__item res__item--score" title="이번 런의 명성 점수">
          <span class="res__label">명성</span>
          <span class="res__val n">${prestigeState().total}</span>
          ${(loadRecords(localStorage).bestScore ?? 0) > 0 ? `<i class="res__best">최고 ${loadRecords(localStorage).bestScore}</i>` : ''}
        </div>
      </div>
      <div class="goalstrip" id="goal-strip" title="이사진 목표 ${currentBoardGoal()}점 (안전 ${effectiveTier(currentState.leagueTierId).safePoints} · 승격 ${effectiveTier(currentState.leagueTierId).targetPoints})">
        <span>이사진 요구</span>
        ${boardDemandCard ? `<b>${esc(boardDemandCard.short ?? boardDemandCard.text)}</b><em>+${Math.round(BOARD_DEMAND_REWARD[currentState.boardDemand.difficulty] * 100)}%</em>` : '<b class="is-none">없음</b>'}
      </div>
      <p class="note chem-info" id="funds-info" hidden>
        <b>이번 시즌 자금 흐름</b><br>
        시즌 시작 <b>${track.start.toLocaleString('ko-KR')}G</b> ·
        선수 영입 <b>−${track.spent.toLocaleString('ko-KR')}G</b> ·
        방출/판매 수입 <b>+${track.income.toLocaleString('ko-KR')}G</b> ·
        그 밖(겨울 지원금·이벤트 등) <b>${otherFlow >= 0 ? '+' : '−'}${Math.abs(otherFlow).toLocaleString('ko-KR')}G</b><br>
        <b>이적 손익 ${net >= 0 ? '+' : '−'}${Math.abs(net).toLocaleString('ko-KR')}G</b> (수입 − 영입 지출). 이적 명단은 1주 뒤 일부, 12주 데드라인 방출은 원가의 40%를 돌려받습니다.
      </p>
      <p class="note chem-info" id="chem-info" hidden>
        <b>적응도 = 팀 조직력.</b> 높을수록 팀 전력이 오르고, 낮을수록 깎입니다
        (0 → ×0.94 · 60 → ×1.015 · 100 → ×1.08, 지금은 ×${chemistryMultiplier(chemistry).toFixed(3)}).<br>
        <b>오르는 때:</b> 영입·방출이 없는 주마다 +1, 전술 완성 +10, 승격 +${PROMOTION_CHEMISTRY_BONUS}, 일부 감독 성향.<br>
        <b>깎이는 때:</b> 영입·방출 한 건마다 −${decay || 0}${decay ? '' : '(지금은 감독·스태프 덕에 면제)'} (팀 전력 약 −${((chemistryMultiplier(chemistry) - chemistryMultiplier(Math.max(0, chemistry - decay))) * 100).toFixed(2)}%), 감독과의 불화 −${MANAGER_HARMONY_PENALTY}.<br>
        그래서 자주 갈아치울수록 손해, 한 번에 굵직하게 바꾸고 기다릴수록 이득입니다.
      </p>
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
          return `<div class="pw${pwClass(avg)}"><span class="pw__label">${{ 골키퍼: 'GK', 수비: 'DF', 중원: 'MF', 공격: 'FW' }[g.label] ?? g.label}</span><span class="pw__val n">${avg === null ? '--' : avg.toFixed(0)}</span></div>`;
        }).join('')}
        <div class="pw pw--total"><span class="pw__label">OVR</span><span class="pw__val n">${teamPower.toFixed(0)}</span></div>
      </div>`;
    })()}

    ${banner ? `<div class="banner">${esc(banner)}</div>` : ''}

    <div class="tabs" role="tablist">
      ${visibleTabs().map((t) => `<button class="tab" role="tab" data-tab="${t.id}" aria-selected="${t.id === tab}">${t.label}${t.id === 'draft' ? `<span class="tab__count">${shopOffer.length}</span>` : ''}${t.id === 'squad' ? `<span class="tab__count${squad.length > squadCapFor(currentState.seasonNumber) ? ' tab__count--warn' : ''}">${squad.length}</span>` : ''}</button>`).join('')}
    </div>
    ${bodies[tab]}
  `, `<button class="cta" id="next-week-btn">${week === maxWeek ? (phase === 'summer' ? '전반기 시작' : '후반기 시작') : '다음 주로'}</button>`);

  // 이사진 요구 문구가 길면 두 줄로 늘리지 않고 글자를 조금씩 줄여 한 줄에 맞춘다(최소 10px)
  const demandText = document.querySelector('#goal-strip b');
  if (demandText) {
    let fs = 12;
    demandText.style.fontSize = `${fs}px`;
    while (demandText.scrollWidth > demandText.clientWidth && fs > 10) { fs -= 0.5; demandText.style.fontSize = `${fs}px`; }
  }

  for (const t of visibleTabs()) {
    document.querySelector(`[data-tab="${t.id}"]`).onclick = () => {
      currentState.tab = t.id;
      if (tutStep() === 3 && t.id === 'tactics') tutSet(4);
      renderMarket(banner);
    };
  }
  if (tab === 'draft') {
    for (const card of shopOffer) {
      const btn = document.querySelector(`[data-buy="${card.id}"]`);
      if (!btn) continue; // 공석 필터로 가려진 카드는 화면에 없다
      btn.onclick = () => buyCard(card, document.querySelector(`[data-row="${card.id}"]`));
    }
    document.getElementById('reroll-btn')?.addEventListener('click', rerollShop);
    document.querySelectorAll('[data-draft-sub]').forEach((b) => { b.onclick = () => { currentState.draftSub = b.dataset.draftSub; renderMarket(); }; });
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
    // 슬롯(피치든 벤치든)을 하나 고른 채로 다른 슬롯을 또 누르면 - 선발/벤치는
    // 항상 다 차 있으니(스쿼드가 16명보다 많음) "그 자리에 넣을 선수 고르기"가
    // 아니라 "두 선수 자리를 맞바꾸기"가 자연스럽다. 아직 안 뽑힌 예비 선수를
    // 데려오는 건 아래 피커(예비 선수만 나옴)에서 한다.
    const getOccupant = (key) => (typeof key === 'number' ? slotted[key] : bench[Number(key.slice(6))]);
    const setOccupant = (key, playerId, nextManual, nextBench) => {
      if (typeof key === 'number') nextManual[key] = playerId;
      else nextBench[key.slice(6)] = playerId;
    };
    const handleSlotClick = (key) => {
      const prev = currentState.selectedSlot;
      if (prev === null || prev === undefined) {
        currentState.selectedSlot = key;
      } else if (prev === key) {
        currentState.selectedSlot = null;
      } else {
        const a = getOccupant(prev);
        const b = getOccupant(key);
        // 선발 슬롯에는 그 슬롯 포지션의 선수만 설 수 있다(벤치는 제한 없음).
        const slotPos = (k) => (typeof k === 'number' ? FORMATIONS[formationId].slots[k] : null);
        const misfit = [[a, key], [b, prev]].find(([p, k]) => p && slotPos(k) && p.position !== slotPos(k));
        if (misfit) {
          currentState.selectedSlot = null;
          renderMarket(`${misfit[0].name}은(는) ${misfit[0].position}이라 ${slotPos(misfit[1])} 자리에 설 수 없습니다.`);
          return;
        }
        const nextManual = { ...(currentState.manualOverrides ?? {}) };
        const nextBench = { ...(currentState.benchOverrides ?? {}) };
        if (a) setOccupant(key, a.id, nextManual, nextBench);
        if (b) setOccupant(prev, b.id, nextManual, nextBench);
        currentState.manualOverrides = nextManual;
        currentState.benchOverrides = nextBench;
        currentState.selectedSlot = null;
      }
      renderMarket(banner);
    };
    document.querySelectorAll('[data-slot]').forEach((el) => {
      el.onclick = () => handleSlotClick(Number(el.dataset.slot));
    });
    document.querySelectorAll('[data-bench-slot]').forEach((el) => {
      el.onclick = () => handleSlotClick(`bench-${el.dataset.benchSlot}`);
    });
    document.querySelectorAll('[data-pick-slot]').forEach((el) => {
      el.onclick = () => {
        const slotKey = el.dataset.pickSlot;
        const playerId = el.dataset.pickPlayer;
        // 이 선수가 이미 다른 칸(선발이든 벤치든)에 고정돼 있었다면 그 칸은
        // 비운다(자동 배치로 되돌림) - 한 선수가 두 자리를 동시에 차지할 수 없다.
        const nextManual = { ...(currentState.manualOverrides ?? {}) };
        const nextBench = { ...(currentState.benchOverrides ?? {}) };
        for (const key of Object.keys(nextManual)) {
          if (nextManual[key] === playerId) delete nextManual[key];
        }
        for (const key of Object.keys(nextBench)) {
          if (nextBench[key] === playerId) delete nextBench[key];
        }
        if (slotKey.startsWith('bench-')) {
          nextBench[slotKey.slice(6)] = playerId;
        } else {
          nextManual[slotKey] = playerId;
        }
        currentState.manualOverrides = nextManual;
        currentState.benchOverrides = nextBench;
        currentState.selectedSlot = null;
        renderMarket(banner);
      };
    });
    // 케미(태그/대륙/특수 성향)까지 반영한 평균 최종 OVR이 가장 높은 조합을
    // 찾아 슬롯에 고정한다(포지션은 항상 지킨다).
    document.getElementById('auto-lineup-btn')?.addEventListener('click', () => {
      const boosted = coachFor();
      const before = computeAverageOVR(lineup, bench, boosted);
      const { xi, bench: nextBench } = optimizeLineup(squad, FORMATIONS[formationId].slots, BENCH_SIZE, boosted);
      const nextManual = {};
      xi.forEach((p, i) => { if (p && p.position === FORMATIONS[formationId].slots[i]) nextManual[i] = p.id; });
      const nextBenchOv = {};
      nextBench.forEach((p, i) => { nextBenchOv[i] = p.id; });
      currentState.manualOverrides = nextManual;
      currentState.benchOverrides = nextBenchOv;
      currentState.selectedSlot = null;
      const after = computeAverageOVR(xi.filter(Boolean), nextBench, boosted);
      renderMarket(after > before + 0.005
        ? `최적 배치: 선발 평균 OVR ${before.toFixed(1)} → ${after.toFixed(1)}`
        : '이미 최적 배치입니다.');
    });
    document.getElementById('reset-lineup-btn')?.addEventListener('click', () => {
      currentState.manualOverrides = {};
      currentState.benchOverrides = {};
      currentState.selectedSlot = null;
      renderMarket(banner);
    });
    document.querySelectorAll('[data-chem-desc]').forEach((el) => {
      el.addEventListener('click', () => {
        document.getElementById('chem-desc').textContent = el.dataset.chemDesc;
      });
    });
  }
  document.getElementById('funds-info-btn')?.addEventListener('click', () => {
    const box = document.getElementById('funds-info');
    box.hidden = !box.hidden;
  });
  document.getElementById('chem-info-btn')?.addEventListener('click', () => {
    const box = document.getElementById('chem-info');
    box.hidden = !box.hidden;
  });
  document.querySelectorAll('[data-tier-info]').forEach((el) => {
    el.onclick = () => showTierInfo(el.dataset.tierInfo);
  });
  document.querySelectorAll('[data-gap]').forEach((el) => {
    el.onclick = () => {
      currentState.offerFilter = el.dataset.gap;
      currentState.tab = 'draft';
      renderMarket(banner);
    };
  });
  document.querySelector('[data-gap-clear]')?.addEventListener('click', () => {
    currentState.offerFilter = null;
    currentState.offerTag = null;
    renderMarket(banner);
  });
  document.querySelectorAll('[data-offer-tag]').forEach((el) => {
    el.onclick = () => {
      currentState.offerTag = currentState.offerTag === el.dataset.offerTag ? null : el.dataset.offerTag;
      renderMarket(banner);
    };
  });
  document.querySelectorAll('[data-coach-focus]').forEach((btn) => {
    btn.onclick = () => { currentState.staff.headCoach.focus = btn.dataset.coachFocus; renderMarket(); };
  });
  document.getElementById('scout-target')?.addEventListener('change', (e) => {
    currentState.scoutTargetTag = e.target.value || null;
    if (scoutCaps().exclusive && currentState.scoutTargetTag) { currentState.scoutTargetPos = null; renderMarket(); }
  });
  document.getElementById('scout-target-pos')?.addEventListener('change', (e) => {
    currentState.scoutTargetPos = e.target.value || null;
    if (scoutCaps().exclusive && currentState.scoutTargetPos) { currentState.scoutTargetTag = null; renderMarket(); }
  });
  document.getElementById('tagpanel-toggle')?.addEventListener('click', () => {
    currentState.tagPanelCollapsed = currentState.tagPanelCollapsed === false; // 기본(undefined)은 접힘 상태
    document.getElementById('tagpanel')?.classList.toggle('is-collapsed', currentState.tagPanelCollapsed);
    document.getElementById('tagpanel-toggle')?.setAttribute('aria-expanded', String(!currentState.tagPanelCollapsed));
  });
  document.querySelectorAll('[data-tag-desc]').forEach((el) => {
    el.addEventListener('click', () => {
      const hint = el.closest('.offer')?.querySelector('.offer__hint');
      if (!hint) return;
      // 같은 태그를 다시 누르면 설명을 닫는다
      const same = !hint.hidden && hint.textContent === el.dataset.tagDesc;
      hint.textContent = el.dataset.tagDesc;
      hint.hidden = same;
    });
  });
  document.getElementById('youth-btn')?.addEventListener('click', (e) => {
    const list = document.getElementById('youth-list');
    list.hidden = !list.hidden;
    e.currentTarget.setAttribute('aria-expanded', String(!list.hidden));
  });
  document.querySelectorAll('.squad .srow .ticon[data-tag-info]').forEach((el) => {
    const show = (e) => {
      e.stopPropagation();
      const main = el.closest('.srow__main');
      let h = main.querySelector('.srow__hint');
      if (!h) { h = document.createElement('small'); h.className = 'srow__hint'; main.append(h); }
      const same = !h.hidden && h.textContent === el.dataset.tagInfo;
      h.textContent = el.dataset.tagInfo;
      h.hidden = same;
    };
    el.addEventListener('click', show);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(e); } });
  });
  if (tab === 'squad') {
    for (const p of squad) {
      document.querySelector(`[data-release-listed="${p.id}"]`).onclick = () => {
        confirmRelease(p.id, `${p.name} 이적 명단에 올리시겠습니까?`, () => listForSale(p), banner);
      };
      if (isDeadlineWeek) {
        document.querySelector(`[data-release-deadline="${p.id}"]`).onclick = () => {
          confirmRelease(p.id, `${p.name} 데드라인 방출하시겠습니까? (원가 40% 회수)`, () => releaseDeadline(p), banner);
        };
      }
    }
    // 선수 행을 누르면 관리 버튼(판매 등록/방출)이 펼쳐진다.
    document.querySelectorAll('.squad .srow[data-row]:not(.srow--gap)').forEach((row) => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        row.classList.toggle('is-open');
      });
    });
    document.querySelectorAll('[data-swap-in]').forEach((btn) => { btn.onclick = () => swapIntoLineup(btn.dataset.swapIn); });
    document.querySelectorAll('[data-swap-out]').forEach((btn) => { btn.onclick = () => swapOutOfLineup(btn.dataset.swapOut); });
    document.querySelectorAll('[data-accept]').forEach((btn) => {
      btn.onclick = () => {
        const i = btn.dataset.accept.lastIndexOf(':');
        acceptSaleOffer(btn.dataset.accept.slice(0, i), Number(btn.dataset.accept.slice(i + 1)));
      };
    });
  }
  document.getElementById('next-week-btn').onclick = () => {
    if (tutStep() === 5) tutSet(6);
    clearSpot();
    const enteringSim = week === maxWeek; // 전/후반기 시뮬레이션은 renderSimulating이 따로 연출한다
    if (enteringSim) {
      const missing = missingPositions(currentState.squad, currentFormation());
      if (missing.length) {
        showLineupWarning(missing, () => nextWeek(), () => renderMarket(banner));
        return;
      }
      nextWeek();
    } else {
      flashWeekTransition(`${week + 1}주차`, nextWeek);
    }
  };

  const eventRoot = document.getElementById('eventmodal-root');
  const briefing = currentState.seasonBriefing;
  if (briefing) {
    const { review, goal, tierLabel, seasonNumber, demandOffer } = briefing;
    const tier = effectiveTier(currentState.leagueTierId);
    const fr = briefing.fundsReport;
    const fundsHtml = fr ? `<div class="agingbox">
        <b>시즌 자금 정산</b>
        <ul>
          <li>이번 시즌 지급 <span class="n">+${fr.grant.toLocaleString('ko-KR')}G</span></li>
          ${fr.leftover > 0 ? `<li>지난 시즌 남은 돈 <span class="n">${fr.leftover.toLocaleString('ko-KR')}G → 이월 ${fr.carried.toLocaleString('ko-KR')}G</span></li>` : ''}
          ${fr.items.map((x) => `<li class="is-down">회수 · ${esc(x.label)} <span class="n">−${x.amount.toLocaleString('ko-KR')}G</span></li>`).join('')}
        </ul>
      </div>` : '';
    const ag = { youthLeft: [], ...(briefing.aging ?? { changes: [], retired: [] }) };
    const ups = [...ag.changes].filter((c) => c.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 4);
    const downs = [...ag.changes].filter((c) => c.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 4);
    const agingHtml = ups.length || downs.length || ag.retired.length || ag.youthLeft.length ? `<div class="agingbox">
        <b>선수단 오버롤 변화</b>
        <ul>
          ${ups.map((c) => `<li class="is-up">▲ ${esc(c.name)} <span>${c.age}세 · ${c.from}→${c.to} (+${c.delta})${c.kind === 'leap' ? ' 도약!' : ''}</span></li>`).join('')}
          ${downs.map((c) => `<li class="is-down">▼ ${esc(c.name)} <span>${c.age}세 · ${c.from}→${c.to} (${c.delta})${c.kind === 'stall' ? ' 정체' : ''}</span></li>`).join('')}
          ${ag.retired.map((r) => `<li class="is-retire">은퇴 ${esc(r.name)} <span>${r.age}세</span></li>`).join('')}
          ${ag.youthLeft.map((y) => `<li class="is-retire">유스 계약 종료 ${esc(y.name)} <span>${y.position}</span></li>`).join('')}
        </ul>
      </div>` : '';
    const td = briefing.transferDemand;
    const transferHtml = td ? `<div class="transferdemand">
        <p class="eventmodal__detail"><b>${esc(td.name)}</b>(성골 유스)에게 빅클럽의 이적 요구가 왔습니다.</p>
        <div class="transferdemand__btns">
          <button class="reroll" id="td-release">보내주기 <small>자유계약으로 이탈</small></button>
          <button class="reroll" id="td-keep">붙잡기 <small>OVR −${SEONGGOL_REJECT_OVR_PENALTY}</small></button>
        </div>
      </div>` : '';
    const demandReviewHtml = review?.demand
      ? `<p class="eventmodal__detail">요구 "${esc(review.demand.text)}": <b>${review.demand.achieved ? `달성! 자금 +${review.demand.funds.toLocaleString('ko-KR')}G` : '미달(불이익 없음)'}</b></p>`
      : '';
    const reviewHtml = !review ? '' : review.surplus > 0
      ? `<p class="eventmodal__detail"><b>지난 시즌 목표 ${review.goal}점 → ${review.points}점, ${review.surplus}점 초과 달성!</b><br>보상: 자금 +${review.funds.toLocaleString('ko-KR')}G, 적응도 +${review.chemistry}</p>`
      : `<p class="eventmodal__detail">지난 시즌 목표 ${review.goal}점 → ${review.points}점 (${review.surplus === 0 ? '초과 달성은 못 했습니다' : `${-review.surplus}점 부족`}). 보상 없음.</p>`;
    // 한 화면에 다 넣으면 길어서 잘렸다 - 브리핑(목표·요구)과 결산(자금·선수단 변화)을 탭으로 나눈다.
    const hasSettle = !!(fundsHtml || agingHtml);
    eventRoot.innerHTML = `
      <div class="eventmodal-backdrop">
        <div class="eventmodal eventmodal--${review && review.surplus > 0 ? 'good' : 'goal'}">
          <div class="eventmodal__kicker">시즌 ${seasonNumber} · 이사진 브리핑</div>
          <div class="eventmodal__title">${tierLabel} 목표 승점 ${goal}점</div>
          ${hasSettle ? `<div class="eventtabs" role="tablist">
            <button type="button" role="tab" data-etab="brief" aria-selected="true">브리핑</button>
            <button type="button" role="tab" data-etab="settle" aria-selected="false">자금 결산</button>
          </div>` : ''}
          <div class="eventpane" data-epane="brief">
            ${briefing.unlocked?.length ? `<p class="eventmodal__detail unlocknote">새로 열림: <b>${briefing.unlocked.map((k) => UNLOCK_LABEL[k]).join(' · ')}</b></p>` : ''}
            ${reviewHtml}
            ${demandReviewHtml}
            ${transferHtml}
            <p class="eventmodal__detail">안전선 ${tier.safePoints}점 · 승격선 ${tier.targetPoints}점. ${BOARD_RULE_TEXT}</p>
            ${isUnlocked('board') ? `<div class="demandcards demandcards--modal">${(demandOffer ?? []).map((id) => demandCardHtml(getDemand(id), 'data-pick-demand')).join('')}</div>
            <p class="eventmodal__detail">위 카드에서 이번 시즌 이사진 요구를 고르면 달성 시 보너스가 붙습니다(안 골라도 됩니다).</p>` : ''}
          </div>
          ${hasSettle ? `<div class="eventpane" data-epane="settle" hidden>${fundsHtml}${agingHtml}</div>` : ''}
          <button class="cta" id="eventmodal-dismiss">목표 확인</button>
        </div>
      </div>`;
    eventRoot.querySelectorAll('[data-etab]').forEach((tabBtn) => {
      tabBtn.onclick = () => {
        eventRoot.querySelectorAll('[data-etab]').forEach((b) => b.setAttribute('aria-selected', String(b === tabBtn)));
        eventRoot.querySelectorAll('[data-epane]').forEach((p) => { p.hidden = p.dataset.epane !== tabBtn.dataset.etab; });
      };
    });
    eventRoot.querySelectorAll('[data-pick-demand]').forEach((el) => {
      el.onclick = () => {
        const card = getDemand(el.dataset.pickDemand);
        currentState.boardDemand = { cardId: card.id, difficulty: card.difficulty };
        eventRoot.querySelectorAll('[data-pick-demand]').forEach((o) => o.classList.toggle('is-picked', o === el));
      };
    });
    const resolveTransfer = (leave) => {
      if (leave) returnGodToPool(currentState.squad.find((p) => p.id === td.id));
      currentState.squad = leave
        ? currentState.squad.filter((p) => p.id !== td.id)
        : currentState.squad.map((p) => (p.id === td.id ? { ...p, baseOVR: Math.max(1, p.baseOVR - SEONGGOL_REJECT_OVR_PENALTY) } : p));
      currentState.seasonBriefing = { ...briefing, transferDemand: null };
      renderMarket(banner);
    };
    document.getElementById('td-release')?.addEventListener('click', () => resolveTransfer(true));
    document.getElementById('td-keep')?.addEventListener('click', () => resolveTransfer(false));
    if (td) document.getElementById('eventmodal-dismiss').disabled = true;
    document.getElementById('eventmodal-dismiss').onclick = () => {
      currentState.seasonBriefing = null;
      renderMarket(banner); // 이벤트가 있으면 이어서 이벤트 팝업이 뜬다
    };
  } else if (currentState.pendingResignation) {
    const { temp } = currentState.pendingResignation;
    const list = [...currentState.managerOffer, temp];
    eventRoot.innerHTML = `
      <div class="eventmodal-backdrop">
        <div class="eventmodal eventmodal--bad">
          <div class="eventmodal__kicker">감독 자진 사임</div>
          <div class="eventmodal__title">${esc(manager.name)} 감독이 떠납니다</div>
          <p class="eventmodal__detail">선호 전술(${esc(TAG_LABELS[manager.tacticalTag] ?? manager.tacticalTag)})에 맞는 선수단을 두 번 연속 못 꾸려 감독이 팀을 떠납니다. 새 감독을 선임해야 하고, 위약금이 영입비에 더해집니다.</p>
          <div class="eventpane">${list.map((m) => {
            const { total, severance } = managerHireCost(m);
            return `<button class="resignpick" data-resign-hire="${m.id}" ${funds >= total ? '' : 'disabled'}>
              <span class="resignpick__name">${esc(m.name)}</span>
              <span class="resignpick__meta">${MANAGER_TIER_LABELS[m.tier] ?? m.tier} · ${esc(TAG_LABELS[m.tacticalTag] ?? m.tacticalTag)}${m.trait ? ` · ${esc(MANAGER_TRAIT_LABELS[m.trait] ?? '')}` : ''}</span>
              <b class="resignpick__cost n">${m.temp ? '무료(임시)' : `${total}G`}</b>
            </button>`;
          }).join('')}</div>
        </div>
      </div>`;
    eventRoot.querySelectorAll('[data-resign-hire]').forEach((btn) => {
      btn.onclick = () => {
        const candidate = list.find((m) => m.id === btn.dataset.resignHire);
        if (candidate) hireReplacement(candidate);
      };
    });
  } else if (showEvent && currentState.eventChoice) {
    const d = describeChoice(currentState.eventChoice, eventCtx());
    eventRoot.innerHTML = `
      <div class="eventmodal-backdrop">
        <div class="eventmodal eventmodal--goal">
          <div class="eventmodal__kicker">선택 이벤트</div>
          <div class="eventmodal__title">${esc(d?.name ?? '')}</div>
          <div class="eventpane">
            <p class="eventmodal__detail">${esc(d?.detail ?? '')}</p>
            ${(d?.options ?? []).map((o, i) => `<button class="resignpick" data-event-opt="${i}"><span class="resignpick__name">${esc(o.label)}</span><span class="resignpick__meta">${esc(o.hint)}</span></button>`).join('')}
          </div>
        </div>
      </div>`;
    eventRoot.querySelectorAll('[data-event-opt]').forEach((btn) => {
      btn.onclick = () => resolveEventChoice(Number(btn.dataset.eventOpt));
    });
  } else if (showEvent) {
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
      tutorialTick('market');
    };
  } else {
    eventRoot.innerHTML = '';
  }

  saveRun(currentState, localStorage);
  tutorialTick('market');
}

if (UCL_DEMO) {
  // 1부 챔피언스리그 진행 화면을 바로 띄운다. win이면 압도적 전력이라 우승까지 간다.
  startRun(buildStartClubOffers()[0]);
  currentState.leagueTierId = 'tier1';
  currentState.ucl = createUcl(UCL_DEMO === 'win' ? 999 : Number(UCL_DEMO) || 92);
  currentState.ucl.teams[0].name = currentState.club.name;
  currentState.ucl.teams[0].kit = currentState.club.kit;
  renderUcl();
} else {
  renderStoryIntro();
}
