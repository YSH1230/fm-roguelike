// 확인용 미리보기(#uclDemo=win): 저장소를 메모리로 갈아끼워서 저장/기록이 절대 남지 않는다.
const UCL_DEMO = new URLSearchParams(location.hash.slice(1)).get('uclDemo');
if (UCL_DEMO) {
  const mem = new Map();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k), clear: () => mem.clear() },
  });
}
import { buildStartClubOffers, buildTierClubOffers, buildLeagueRivals } from '../data/clubs.mjs';
import { saveRun, loadRun, clearRun, withRunDefaults } from '../data/local-save.mjs';
import {
  loadRecords, saveRecords, recordRunStart, recordPromotion, recordSeason, recordUcl,
  uclReached, ACHIEVEMENTS, unlockedIds, newlyUnlocked,
} from '../data/records.mjs';
import { generateSquadPool, generateStartingSquad, generateEmergencyYouth, MOVE_SQUAD_WEIGHTS_BY_TIER } from '../data/generate-player.mjs';
import { generateProceduralManager } from '../data/generate-manager.mjs';
import { assignRandomStaff, generateStaffOffer, generateStaffCandidate } from '../data/staff.mjs';
import { generateManagerOffer } from '../data/manager-shop.mjs';
import { GOD_PLAYERS } from '../data/god-players.mjs';
import { rollSeasonEvent } from '../data/season-events.mjs';
import { drawDemandOffer, getDemand, evaluateDemand, DIFFICULTY_LABELS } from '../data/board-demands.mjs';
import { generateShopOffer } from '../data/draft-shop.mjs';
import { getLeagueTier, getLadderIndex, getNextTier, convertPowerToPoints } from '../engine/league.mjs';
import { judgeRunOutcome, nextMissedTargetCount, computeReputation } from '../engine/run.mjs';
import {
  createUcl, advanceUcl, uclRanking, nameOf, teamOf, tieAggregate, generateShootout,
  UCL_RESULT_LABELS, UCL_REWARDS_FUNDS, UCL_STAGE_LABELS, UCL_STYLE_LABELS, UCL_LEAGUE_DAYS, UCL_DIRECT_SPOTS, UCL_PLAYOFF_SPOTS,
} from '../engine/champions-league.mjs';
import { runHalfSeason, judgeSeasonResult, advanceWeek, boardGoalPoints, boardReward } from '../engine/season.mjs';
import { resolvePromotionTransferDemand } from '../engine/events.mjs';
import {
  calculateStartingFunds,
  applyCarryoverCap,
  recallFunds,
  applyCostModifiers,
  computeReleaseProceeds,
  renewalCost,
} from '../engine/economy.mjs';
import { applyTransactionDecay, chemistryMultiplier } from '../engine/chemistry.mjs';
import { computePlayerFinalOVR, computePlayerBonusBreakdown, countEffectiveContinentRequirement, resolveRoles } from '../engine/ovr.mjs';
import {
  PLAYSTYLE_TAGS, CONTINENT_TAGS, POSITIONS,
  STAFF_LEVELS, STAFF_PRICE_TABLE,
} from '../engine/constants.mjs';
import { computeTeamPower, computeAverageOVR } from '../engine/team-power.mjs';
import { optimizeLineup, missingSlots } from '../engine/lineup.mjs';
import { simulateLeagueTable, rankingAt, finalLeagueRank, MATCHES_PER_HALF } from '../engine/half-results.mjs';
import { ageSquad, MAX_RENEWALS } from '../engine/aging.mjs';
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
  WINTER_FUNDS_RATIO,
  PROMOTION_CHEMISTRY_BONUS,
  PROMOTION_STAY_FUNDS_RATIO,
  COACH_CHEMISTRY_DECAY_BY_LEVEL,
  SCOUT_SHOP_OFFER_SIZE_BY_LEVEL,
  SCOUT_MASTER_REROLL_DISCOUNT,
  PROMOTION_TRANSFER_DEMAND_CHANCE,
  PLAYER_TIERS,
  MISSED_TARGET_LIMIT,
  STAGNATION_FUNDS_PENALTY_PER_MISS,
  SAME_LEAGUE_FUNDS_RATIO,
  TAG_THRESHOLDS,
  ROLE_SLOTS,
  TRAIT_ROLE,
  TRAIT_RENEWAL_MULT,
  HOMETOWN_RELEASE_CHEMISTRY_PENALTY,
  SEONGGOL_TRANSFER_DEMAND_CHANCE,
  SEONGGOL_REJECT_OVR_PENALTY,
  MANAGER_TIER_MULTIPLIER,
  LEAGUE_EXPECTED_MANAGER,
  COACH_POWER_MULTIPLIER,
  BOARD_REWARD_FUNDS_PER_POINT,
  BOARD_REWARD_FUNDS_CAP,
  BOARD_REWARD_CHEMISTRY,
  BOARD_DEMAND_REWARD,
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
function powerExtras(roles) {
  return { leagueTierId: currentState.leagueTierId, coachLevel: currentState.staff.headCoach.level, roles };
}
// 유저가 고른 역할 배정 위에 자동 배정을 얹은 최종 역할(주장/에이스/조커).
function currentRoles(lineup, bench) {
  return resolveRoles(currentState.roleOverrides, lineup, bench, boostedTagIdFor(currentState.manager));
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
};
const TRAIT_LABELS = {
  starPower: '스타 기질', seongGolYouth: '성골 유스', veteranLeader: '베테랑 리더', superSub: '슈퍼 서브',
  hometownHero: '지역 영웅', polyglot: '폴리글롯', journeyman: '저니맨',
};
// 역할 칸: 특수 태그는 자기 칸에 서야 효과가 난다(engine/ovr.mjs autoRoles/resolveRoles).
const ROLE_LABELS = { captain: '주장', ace: '에이스', joker: '조커' };
const ROLE_WHERE = { captain: '선발 1명', ace: '선발 1명', joker: '벤치 1명' };
// 전술 탭 "선수 특수 태그" 섹션에 쓰는 효과 설명(engine/ovr.mjs 실제 수치와 짝).
const TRAIT_EFFECT_DESCRIPTIONS = {
  starPower: '본인 OVR +10',
  seongGolYouth: '유스 출신 본인 OVR +10',
  veteranLeader: '33세 이상이 주장이면 선발 23세 이하 전원 +3, 거래당 적응도 하락 −1',
  superSub: '벤치 조커면 선발 전원 OVR +1',
  hometownHero: '뛴 시즌마다 본인 OVR +4 (최대 +12)',
  polyglot: '같은 대륙 케미 요구 인원 2명 감면(최소 2명)',
  journeyman: '이번 시즌 영입이면 본인 OVR +8',
};
// 재계약비(태그 대가 배수 포함)와 재계약 가능 연수(저니맨은 딱 한 번, 1년만).
function renewCost(p, years) {
  return Math.round(renewalCost(p.price, years) * (TRAIT_RENEWAL_MULT[p.specialTrait] ?? 1));
}
function renewYears(p) {
  if ((p.renewCount ?? 0) >= MAX_RENEWALS) return []; // 한 선수와 무한 재계약은 안 된다
  if (p.specialTrait === 'journeyman') return p.renewedOnce ? [] : [1];
  return [1, 2];
}
const TRAIT_DOWNSIDE_TEXT = {
  starPower: '영입가·재계약비 ×2',
  seongGolYouth: '뛴 시즌이 끝나면 30% 확률로 이적 요구 (수락=자유계약으로 이탈, 거부=OVR −3)',
  veteranLeader: '재계약비 ×1.5',
  superSub: '벤치에 고정(선발 출전 불가)',
  hometownHero: '방출·판매하면 팀 적응도 −8',
  polyglot: '주장인 본인은 대륙 케미를 못 받음',
  journeyman: '재계약은 1년, 딱 한 번만 가능 - 그 뒤엔 자유계약으로 팀을 떠남',
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
  starPower: '<path d="M12 3 L14 9 H20 L15 13 L17 19 L12 15 L7 19 L9 13 L4 9 H10 Z"/>',
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
  boardTrust: '강등을 1회 면제',
  silverTongue: '같은 대륙·전술 태그 선수 영입비 -30%',
  youthCallUp: '유스 매물이 더 자주 나옴',
  reboundArchitect: '거래당 적응도 하락 절반',
  firefighter: '위기 페이스로 겨울 진입 시 적응도 +30',
  crisisManager: '위기 이벤트 무효화',
  longTermReign: '잔류 시즌마다 적응도 +3',
  tacticalPurist: '전술 태그 케미 발동 인원 1명 감면',
};
// 등급별로 뭐가 얼마나 좋아지는지 한 줄. 코치 수치는 "거래 1건당 적응도 하락".
function staffBenefit(role, level) {
  if (role === 'headCoach') {
    const v = COACH_CHEMISTRY_DECAY_BY_LEVEL[level];
    const power = COACH_POWER_MULTIPLIER[level];
    return (v === 0 ? '거래해도 적응도 유지' : `거래당 적응도 −${v}`)
      + (power > 1 ? ` · 팀 전력 +${((power - 1) * 100).toFixed(1)}%` : '');
  }
  const n = SCOUT_SHOP_OFFER_SIZE_BY_LEVEL[level];
  return `매주 매물 ${n}장${level === 'master' ? ' · 다시 뽑기 절반' : ''}`;
}
const MANAGER_TIER_MULTIPLIER_TEXT = {
  rookie: '팀 전력 배율 ×1.00', tactician: '팀 전력 배율 ×1.05',
  legendary: '팀 전력 배율 ×1.12', god: '팀 전력 배율 ×1.20',
};
// 감독 카드에 쓰는 요약 칩(등급·배율 / 전술 / 대륙)과 성향 한 줄.
function managerChipsHtml(m) {
  return `<div class="chips">
    <span class="tag tag--tier">${MANAGER_TIER_LABELS[m.tier] ?? m.tier} ${MANAGER_TIER_MULTIPLIER_TEXT[m.tier]?.replace('팀 전력 배율 ', '') ?? ''}</span>
    <span class="tag">${TAG_LABELS[m.tacticalTag] ?? m.tacticalTag}</span>
    <span class="tag">${CONTINENT_LABELS[m.continentTag] ?? m.continentTag}</span>
  </div>`;
}
function managerTraitHtml(m) {
  return m.trait
    ? `<p class="traitline"><b>${MANAGER_TRAIT_LABELS[m.trait] ?? m.trait}</b> ${MANAGER_TRAIT_DESCRIPTIONS[m.trait] ?? ''}</p>`
    : '<p class="traitline traitline--none">세부 성향 없음</p>';
}

// 여름 이적시장이 끝나는 시점(전반기 시작 직전)의 라인업으로 딱 한 번 체크한다.
// 감독의 전술 태그 케미가 그때 안 켜져 있으면 "선호하는 선수단을 못 꾸렸다"는
// 뜻이라 불화, 켜져 있으면 전술이 자리잡았다는 뜻이라 보너스 - 새 수치 체계
// 없이 이미 있는 적응도(케미스트리)를 그대로 밀고 올린다.
const MANAGER_HARMONY_PENALTY = 15;
const MANAGER_HARMONY_BONUS = 10;
function applyManagerTacticalHarmony(lineup) {
  const { manager } = currentState;
  const { tier } = playstyleTagProgress(manager.tacticalTag, lineup, boostedTagIdFor(manager));
  const tagLabel = TAG_LABELS[manager.tacticalTag] ?? manager.tacticalTag;
  if (tier === 0) {
    currentState.chemistry = Math.max(0, currentState.chemistry - MANAGER_HARMONY_PENALTY);
    return `감독과의 불화: ${manager.name} 감독이 선호하는 전술(${tagLabel})에 맞는 선수단을 못 꾸렸습니다. 적응도 -${MANAGER_HARMONY_PENALTY}`;
  }
  currentState.chemistry = Math.min(100, currentState.chemistry + MANAGER_HARMONY_BONUS);
  return `전술 완성: ${manager.name} 감독이 선호하는 전술(${tagLabel})이 라인업에서 발동했습니다. 적응도 +${MANAGER_HARMONY_BONUS}`;
}

// 선수단/전술 탭에서 선수 태그(플레이스타일·대륙)를 한눈에 보여준다.
// 팀 케미 패널은 라인업 전체 집계라 개인이 무슨 태그인지는 안 보였다.
function playerTagsHtml(p) {
  const chips = [
    ...(p.playstyleTags ?? []).map((t) => `<span class="tag">${TAG_LABELS[t] ?? t}</span>`),
    p.continentTag ? `<span class="tag tag--continent">${CONTINENT_LABELS[p.continentTag] ?? p.continentTag}</span>` : '',
  ].join('');
  return chips ? `<div class="tags">${chips}</div>` : '';
}

// 선수의 태그를 아이콘 한 줄로(플레이스타일 → 대륙 → 특수). active에 든 태그는 초록(지금 보너스 중).
function tagIconsHtml(p, active = null) {
  const on = (id) => (active && active.has(id) ? ' is-on' : '');
  const play = (p.playstyleTags ?? []).map((t) => `<i class="ticon${on(t)}" title="${esc(TAG_LABELS[t] ?? t)}">${renderTagIcon(PLAYSTYLE_ICON_PATHS, t)}</i>`).join('');
  const cont = p.continentTag ? `<i class="ticon ticon--cont${on(p.continentTag)}" title="${esc(CONTINENT_LABELS[p.continentTag] ?? '')}">${renderTagIcon(CONTINENT_ICON_PATHS, p.continentTag)}</i>` : '';
  const trait = p.specialTrait ? `<i class="ticon ticon--trait" title="${esc(TRAIT_LABELS[p.specialTrait] ?? '')}">${renderTagIcon(TRAIT_ICON_PATHS, p.specialTrait)}</i>` : '';
  return `<span class="ticons">${play}${cont}${trait}</span>`;
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
function renderSimulating(clubName, tierLabel, phaseLabel, kitColor, finalPoints, onDone) {
  const N = MATCHES_PER_HALF;
  const tier = effectiveTier(currentState.leagueTierId);
  const table = simulateLeagueTable(finalPoints, tier);
  const rivals = buildLeagueRivals(currentState.leagueTierId, N).map((c) => ({ name: c.name, kit: c.kit }));
  const info = new Map(table.map((t, i) => [t.id, t.id === 'me' ? { name: clubName, kit: kitColor } : rivals[i - 1] ?? { name: `상대 ${i}`, kit: '#4a5a52' }]));
  const pointsOf = new Map(table.map((t) => [t.id, t.cumulative]));
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
      const pts = round ? pointsOf.get(id)[round - 1] : 0;
      const isUp = pts > (prevPoints.get(id) ?? 0);
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
      <div class="matchsim__pitch">
        <div class="matchsim__pitchLines"></div>
        <div class="matchsim__ball"></div>
      </div>
      <div class="matchsim__ticker">
        <span class="matchsim__dot"></span>
        <span id="sim-phrase">킥오프</span>
      </div>
      <div class="panel">
        <div class="panel__head"><h2>실시간 순위</h2><span class="panel__count">승점</span></div>
        <ul class="standings" id="sim-standings">${buildStandingsHtml(0)}</ul>
      </div>
      <p class="note" style="text-align:center">화면을 누르면 빨리 감기</p>
    </div>
  `);

  let round = 0;
  let delay = 430;
  let prevRank = table.length;
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
    if (phrase) phrase.textContent = `${round}라운드 · ${rank}위${round > 1 && move ? (move > 0 ? ` ▲${move}` : ` ▼${-move}`) : ''}`;
    updateStandings(round);
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
  const groups = ['커리어', '리그', '챔피언스리그'];
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
        </div>
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
      <button class="reroll start__records" id="records-btn">🏆 기록 · 업적</button>
      <div class="clubs">
        ${resume}
        ${clubs.map((club) => {
          const rankTag = `${club.klassLabel} · ${club.colorLabel}`;
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

  document.getElementById('records-btn')?.addEventListener('click', renderRecords);
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
  const baseFunds = Math.round(calculateStartingFunds(0) * club.startingFundsMultiplier);
  const rawSquad = staggerContracts(generateStartingSquad().map(toSquadPlayer));
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
    { squad: rawSquad, funds: baseFunds, chemistry: startChemistry, baseFunds, crisisImmune: manager.trait === 'crisisManager' },
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
    benchOverrides: {},
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
    roleOverrides: {}, // 역할 칸 수동 배정 { captain?, ace?, joker? } (선수 id 또는 'none')
    rolePicker: null,
    boardDemand: null, // 이번 시즌 고른 이사진 요구 카드 { cardId, difficulty }
    seasonTrack: { spent: 0, winterTransactions: 0, income: 0, start: funds }, // 요구 카드 판정 + 자금 흐름 표시용
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

// 이사진 요구 카드 3장(쉬움/보통/어려움) 중 하나를 고르는 화면. 안 골라도 되고,
// 못 채워도 페널티는 없다 - 달성하면 다음 시즌 자금 보너스만 붙는다.
function demandCardHtml(card, attr) {
  const reward = Math.round(BOARD_DEMAND_REWARD[card.difficulty] * 100);
  return `<button class="demandcard demandcard--${card.difficulty}" ${attr}="${card.id}">
    <span class="demandcard__level">${DIFFICULTY_LABELS[card.difficulty]}</span>
    <span class="demandcard__text">${esc(card.text)}</span>
    <b class="demandcard__reward">달성 시 다음 시즌 자금 +${reward}%</b>
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
  const teamPower = computeTeamPower(lineup, bench, manager.tier, currentState.chemistry, null, powerExtras(currentRoles(lineup, bench)));
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
  `, '<button class="cta" id="start-season-btn">이사진 요구 확인</button>');

  document.getElementById('start-season-btn').onclick = () => renderDemandChoice(currentState.club.demandBias ?? {}, () => renderMarket());
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
  const grant = Math.round(promoted * stagnationPenalty);
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
    contractYearsLeft: Math.max(0, (p.contractYearsLeft ?? 2) - 1),
  }));
  // 나이 한 살: 어린 선수는 크고 서른 줄부터 떨어지며, 은퇴할 선수는 떠난다. 변화는 브리핑 팝업에서 알린다.
  const aged = ageSquad(currentState.squad);
  currentState.squad = aged.squad;
  const agingReport = { changes: aged.changes, retired: aged.retired };
  applySeasonEvent('summer'); // 지난 시즌 이벤트 문구는 여기서 새로 덮어쓴다
  currentState.shopOffer = generateShopOffer(scoutOfferSize(), currentState.availableGodPlayers, Math.random, currentState.leagueTierId);
  currentState.managerOffer = generateManagerOffer(3);
  currentState.staffOffer = generateStaffOffer();

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
  currentState.seasonBriefing = { transferDemand, aging: agingReport, fundsReport, review, demandOffer: drawDemandOffer(Math.random, currentState.club.demandBias ?? {}, currentState.leagueTierId).map((c) => c.id), goal: currentBoardGoal(), tierLabel: getLeagueTier(currentState.leagueTierId).label, seasonNumber: currentState.seasonNumber };
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
  // 주장 칸의 베테랑 리더: 거래당 적응도 하락 −1
  const { lineup, bench } = pickBestXI(currentState.squad, currentFormation(), currentState.manualOverrides, currentState.benchOverrides);
  const roles = currentRoles(lineup, bench);
  const captain = roles.captain ? lineup.find((p) => p.id === roles.captain) : null;
  const captainRelief = captain?.specialTrait === 'veteranLeader' ? 1 : 0;
  return Math.max(0, Math.min(managerReduced, coachReduced) - captainRelief);
}

// 지역 영웅 대가: 방출·판매하면 팬이 반발해 팀 적응도가 깎인다.
function hometownExitPenalty(card) {
  if (card.specialTrait === 'hometownHero') {
    currentState.chemistry = Math.max(0, currentState.chemistry - HOMETOWN_RELEASE_CHEMISTRY_PENALTY);
  }
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
  currentState.seasonTrack.spent += price;
  if (currentState.phase === 'winter') currentState.seasonTrack.winterTransactions += 1;
  currentState.squad = [...currentState.squad, { ...toSquadPlayer(card), boughtThisSeason: true }];
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
  if (card.boughtThisSeason) return;
  hometownExitPenalty(card);
  if (currentState.phase === 'winter') currentState.seasonTrack.winterTransactions += 1;
  currentState.squad = currentState.squad.filter((p) => p.id !== card.id);
  currentState.chemistry = applyTransactionDecay(currentState.chemistry, 1, transactionDecayAmount());
  currentState.transactedThisWeek = true;
  renderMarket();
}

function listForSale(card) {
  if (card.boughtThisSeason) return;
  hometownExitPenalty(card);
  const method = currentState.phase === 'summer' ? 'listedSummer' : 'listedWinter';
  // 겨울 이적명단은 당해 영입 선수를 받지 않는다 (스펙 7절)
  if (method === 'listedWinter' && card.acquiredThisSeason) return;
  if (currentState.phase === 'winter') currentState.seasonTrack.winterTransactions += 1;
  currentState.squad = currentState.squad.filter((p) => p.id !== card.id);
  currentState.listedForSale.push({ card, method, resolveWeek: currentState.week + 1 });
  currentState.chemistry = applyTransactionDecay(currentState.chemistry, 1, transactionDecayAmount());
  currentState.transactedThisWeek = true;
  renderMarket();
}

function releaseDeadline(card) {
  if (card.boughtThisSeason) return;
  hometownExitPenalty(card);
  currentState.squad = currentState.squad.filter((p) => p.id !== card.id);
  const proceeds = computeReleaseProceeds(card.price, 'deadline');
  currentState.funds += proceeds;
  currentState.seasonTrack.income += proceeds;
  renderMarket();
}

function resolveListedSales() {
  const due = currentState.listedForSale.filter((l) => l.resolveWeek === currentState.week);
  currentState.listedForSale = currentState.listedForSale.filter((l) => l.resolveWeek !== currentState.week);
  const messages = due.map((l) => {
    const proceeds = computeReleaseProceeds(l.card.price, l.method);
    currentState.funds += proceeds;
    currentState.seasonTrack.income += proceeds;
    return `${l.card.name} 방출 완료: ${proceeds}G 회수`;
  });
  return messages.join(' / ');
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
// 문턱은 3/5/7/9/11명(감독이 전술 원리주의자면 그 태그만 1명씩 감면).
// tier = 넘은 문턱 수(0~5), need = 다음에 채워야 할 인원(다 넘었으면 마지막 문턱).
function playstyleTagProgress(tagId, lineup, boostedTagId) {
  const count = lineup.filter((p) => p.playstyleTags.includes(tagId)).length;
  const boost = tagId === boostedTagId ? 1 : 0;
  const req = TAG_THRESHOLDS.map((n) => n - boost);
  const tier = req.filter((n) => count >= n).length;
  const need = req[Math.min(tier, req.length - 1)];
  return { count, need, tier, req, values: PLAYSTYLE_TAGS[tagId].values };
}
// "3명 +6 · 5명 +10 · ..." 형태의 단계표 문구
const tagLadderText = (req, values) => req.map((n, i) => `${n}명 +${values[i]}`).join(' · ');

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

  const callUps = ensurePositionCoverage();
  if (callUps.length) {
    const msg = `포지션 공백으로 유스 긴급 콜업: ${callUps.join(', ')}`;
    saleMessage = saleMessage ? `${saleMessage} / ${msg}` : msg;
  }

  const { lineup, slotted, bench } = pickBestXI(currentState.squad, currentFormation(), currentState.manualOverrides, currentState.benchOverrides);
  const harmonyMsg = applyManagerTacticalHarmony(lineup);
  saleMessage = saleMessage ? `${saleMessage} / ${harmonyMsg}` : harmonyMsg;

  currentState.firstHalfPoints = runHalfSeason(
    lineup,
    bench,
    manager.tier,
    currentState.chemistry,
    currentState.leagueTierId,
    Math.random,
    boostedTagIdFor(manager),
    currentState.staff.headCoach.level,
    currentRoles(lineup, bench)
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
    <p class="note">이사진 목표 <b>${currentBoardGoal()}점</b> - 전반기 ${points.toFixed(0)}점(목표 페이스 ${(currentBoardGoal() / 2).toFixed(0)}점).</p>
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

  // 겨울 지원금: 여름에 쓴 돈이 바닥나도 후반기 보강이 가능하게 시즌 지급액의
  // 일부를 얹는다(이월 상한과 무관한 별도 지급).
  const winterGrant = Math.round(
    calculateStartingFunds(getLadderIndex(currentState.leagueTierId))
      * currentState.club.startingFundsMultiplier * WINTER_FUNDS_RATIO
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

const RESULT_LABELS = { champion: '우승권!', promotion: '승격권', safe: '안전 잔류', relegation: '강등 위기' };
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
  const weight = { ST: 4, W: 3, AMF: 3, CMF: 2, WB: 1 };
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
    }
    currentState.uclTrophyShown = false;
    currentState.funds += UCL_REWARDS_FUNDS[s.result];
    if (s.result === 'champion') currentState.uclTitles += 1;
    currentState.ucl = null;
    startNewSeason();
  });
}

// 시즌 결과를 역대 기록에 남기고, 리그 우승이면 트로피 연출을 띄운다.
function recordSeasonEnd(result, points, rank = null) {
  updateRecords((r) => recordSeason(r, {
    season: currentState.seasonNumber, club: currentState.club.name, tierId: currentState.leagueTierId, result, rank, points: Math.round(points),
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
  const callUps = ensurePositionCoverage();
  if (callUps.length) {
    const msg = `포지션 공백으로 유스 긴급 콜업: ${callUps.join(', ')}`;
    saleMessage = saleMessage ? `${saleMessage} / ${msg}` : msg;
  }
  const { lineup, slotted, bench } = pickBestXI(currentState.squad, currentFormation(), currentState.manualOverrides, currentState.benchOverrides);
  const secondHalf = runHalfSeason(
    lineup,
    bench,
    manager.tier,
    currentState.chemistry,
    currentState.leagueTierId,
    Math.random,
    boostedTagIdFor(manager),
    currentState.staff.headCoach.level,
    currentRoles(lineup, bench)
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

  // 최종 순위(1~20). 1부는 4위 이내면 챔피언스리그에 나간다(리그가 끝난 뒤 별도 진행).
  const isTop = currentState.leagueTierId === 'tier1';
  const finalRank = finalLeagueRank(totalPoints, tier, result, Math.random, isTop ? 4 : 3);
  const uclQualified = isTop && finalRank <= 4;
  const uclPowerAway = uclQualified
    ? computeTeamPower(lineup, bench, manager.tier, currentState.chemistry / 2, boostedTagIdFor(manager), powerExtras(currentRoles(lineup, bench)))
    : 0;
  const uclPower = uclQualified
    ? computeTeamPower(lineup, bench, manager.tier, currentState.chemistry, boostedTagIdFor(manager), powerExtras(currentRoles(lineup, bench)))
    : 0;
  const uclResultId = null;

  const outcome = judgeRunOutcome({
    seasonResult: result,
    leagueTierId: currentState.leagueTierId,
    missedTargetCount: currentState.missedTargetCount,
  });
  const canPromote = outcome.canPromote;

  renderSimulating(currentState.club.name, tier.label, '후반기', currentState.club.kit, secondHalf, () => {
    finishSeasonRender();
  });

  function finishSeasonRender() {
  if (outcome.ended) {
    // 같은 클릭에서 보드진의 신임이 발동하고도 목표 미달로 경질될 수 있다.
    // 그 경우에도 성향이 발동했다는 사실은 알려야 한다.
    recordSeasonEnd(result, totalPoints);
    renderRunEnd(outcome.reason, totalPoints, boardTrustMessage, uclResultId);
    return;
  }

  // 이사진 목표 정산 - 보상은 다음 시즌 시작(startNewSeason)에 지급하고 팝업으로 알린다.
  // 성골 유스 대가: 에이스로 뛴 시즌이 끝나면 일정 확률로 이적 요구(다음 시즌 브리핑에서 결정).
  const aceId = currentRoles(lineup, bench).ace;
  const ace = aceId ? lineup.find((p) => p.id === aceId) : null;
  currentState.pendingTransferDemand = ace?.specialTrait === 'seongGolYouth' && Math.random() < SEONGGOL_TRANSFER_DEMAND_CHANCE
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
    closingHtml = `<p class="note">승격 보상: 적응도 +${PROMOTION_CHEMISTRY_BONUS}, 새 리그 첫 시즌 지급액은 ${PROMOTION_STAY_FUNDS_RATIO * 100}%(스쿼드를 유지할 때)</p>`;
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
    ${uclQualified ? '<div class="banner banner--ucl">리그 4위 이내로 마쳐 챔피언스리그에 진출했습니다. 시즌 결산 후 챔피언스리그가 이어집니다.</div>' : ''}
    <div class="panel">
      <ul class="summary">
        <li><span>최종 팀 전력</span><b>${computeTeamPower(lineup, bench, manager.tier, currentState.chemistry, boostedTagIdFor(manager), powerExtras(currentRoles(lineup, bench))).toFixed(1)}</b></li>
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
  document.getElementById('promote-btn')?.addEventListener('click', () => {
    updateRecords(recordPromotion);
    const nextTier = getNextTier(currentState.leagueTierId);
    currentState.chemistry = Math.min(100, currentState.chemistry + PROMOTION_CHEMISTRY_BONUS);
    currentState.promotionFundsBonusPending = true; // 지급 시점(startNewSeason)에 반영

    // 승격 전용 위기(FFP 긴급 감사 무효화와는 별개)는 거취를 정한 뒤에 띄운다(잔류를 골랐을 때만 의미가 있다).
    renderDestinationChoice(result, nextTier);
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
              <div class="option__effect"><span class="option__tier">${nextLabel}</span> ${c.klassLabel} · ${c.colorLabel}: ${esc(c.strength)}. 선수단 <b>초기화</b>, 시작 자금 x${c.startingFundsMultiplier}</div>
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
      currentState.promotionFundsBonusPending = false; // 새 구단은 선수단이 초기화되므로 감액 대상이 아니다
      currentState.club = c;
      currentState.expectationModifier = c.expectationModifier ?? 0; // 새 구단의 유형(강/중/약)이 이사진 기대치를 정한다
      currentState.leagueTierId = nextTierId;
      if (getLadderIndex(nextTierId) > getLadderIndex(currentState.highestTierId)) {
        currentState.highestTierId = nextTierId;
      }
      // 선수단 초기화. 목적지 리그 체급으로 생성한다(5부 분포로 고정하면 3부
      // 이상에서 강등이 거의 확정이었다). 적응도도 새 팀이므로 기본값으로 돌린다.
      currentState.squad = staggerContracts(generateSquadPool(MOVE_SQUAD_WEIGHTS_BY_TIER[nextTierId]).map(toSquadPlayer));
      currentState.manualOverrides = {}; // 스쿼드가 통째로 바뀌니 예전 수동 배치는 의미가 없다
      currentState.benchOverrides = {};
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
        <span class="slot__name">${esc(p.name)}</span>
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
// 역할 칸 3개(주장/에이스/조커). 칸을 누르면 그 칸에 세울 수 있는 선수 목록이 뜬다.
// 칸은 비워 둬도 된다 - 비우면 그 칸 태그의 효과만 빠진다.
function renderRoleChips(roles, lineup, bench) {
  const all = [...lineup, ...bench];
  const candidatesOf = (slot) => (slot === 'joker' ? bench : lineup).filter((p) => TRAIT_ROLE[p.specialTrait] === slot);
  const chips = ROLE_SLOTS.map((slot) => {
    const p = roles[slot] ? all.find((x) => x.id === roles[slot]) : null;
    const n = candidatesOf(slot).length;
    return `<button class="rolechip${p ? ' is-on' : ''}${currentState.rolePicker === slot ? ' is-open' : ''}" data-role="${slot}">
      <span class="rolechip__slot">${ROLE_LABELS[slot]} <i>${ROLE_WHERE[slot]}</i></span>
      <b class="rolechip__who">${p ? esc(p.name) : n ? '비어 있음' : '후보 없음'}</b>
      ${p ? `<em>${esc(TRAIT_LABELS[p.specialTrait])}</em>` : ''}
    </button>`;
  }).join('');

  const slot = currentState.rolePicker;
  const picker = slot ? `<div class="panel rolepicker">
    <div class="panel__head"><h2>${ROLE_LABELS[slot]} 칸</h2><span class="panel__count">${ROLE_WHERE[slot]}</span></div>
    <ul class="rolepicks">
      ${candidatesOf(slot).map((p) => `<li><button class="rolepick${roles[slot] === p.id ? ' is-on' : ''}" data-role-pick="${slot}:${p.id}">
        <b>${esc(p.name)}</b> <span>${p.position} · ${esc(TRAIT_LABELS[p.specialTrait])}</span>
        <small>${esc(TRAIT_EFFECT_DESCRIPTIONS[p.specialTrait])}</small>
        <small class="rolepick__cost">대가: ${esc(TRAIT_DOWNSIDE_TEXT[p.specialTrait])}</small>
      </button></li>`).join('') || `<li class="empty">이 칸에 세울 태그 선수가 ${slot === 'joker' ? '벤치에' : '선발에'} 없습니다.</li>`}
      <li class="rolepicks__foot">
        <button class="rolepick rolepick--plain" data-role-pick="${slot}:none">비워 두기</button>
        <button class="rolepick rolepick--plain" data-role-pick="${slot}:auto">자동 배정</button>
      </li>
    </ul>
  </div>` : '';
  return `<div class="rolechips">${chips}</div>
    <p class="note rolenote">특수 태그는 자기 역할 칸에 서야 효과가 납니다. 칸은 비워 둬도 됩니다.</p>${picker}`;
}

function renderBonusDetail(player, lineup, bench, boostedTagId, roles) {
  if (!player) return '';
  const labelOf = { playstyle: TAG_LABELS, continent: CONTINENT_LABELS, self: TRAIT_LABELS, team: TRAIT_LABELS };
  const parts = computePlayerBonusBreakdown(player, lineup, bench, boostedTagId, roles);
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
function renderChemistryPanel(lineup, bench, roles) {
  const { manager } = currentState;
  const boostedTagId = boostedTagIdFor(manager);

  const playstyleRows = Object.entries(PLAYSTYLE_TAGS)
    .map(([tagId, def]) => {
      const { count, need, tier, req, values } = playstyleTagProgress(tagId, lineup, boostedTagId);
      const boost = tagId === boostedTagId ? 1 : 0;
      const bonus = values[Math.max(0, tier - 1)];
      const caption = `${count}/${need} · +${bonus}`;
      const positions = def.positions.join('·');
      // 보유자 수는 라인업 전체로 세지만, 보너스는 그중 해당 포지션에 실제로
      // 있는 선수에게만 간다 - 그래서 "누가 받는지"를 따로 보여줘야 한다.
      const beneficiaries = tier
        ? lineup.filter((p) => p.playstyleTags.includes(tagId) && def.positions.includes(p.position))
        : [];
      const desc = `${positions} 포지션에 있는 보유자만 보너스를 받습니다`
        + (boost ? ' (전술 원리주의자로 요구 인원 1명 감면)' : '')
        + `. 단계: ${tagLadderText(req, values)}`
        + (beneficiaries.length ? `. 지금 받는 선수: ${beneficiaries.map((p) => p.name).join(', ')}` : '');
      // 다음 단계까지 몇 명 더 필요하고, 그때 지금 라인업 중 몇 명이 받는지(계획용).
      const receivers = lineup.filter((p) => def.positions.includes(p.position)).length;
      const more = tier >= req.length ? '최대' : `${need - count}명 더 → +${values[tier]} (${receivers}명 수혜)`;
      return { icon: renderTagIcon(PLAYSTYLE_ICON_PATHS, tagId), label: TAG_LABELS[tagId] ?? tagId, desc, caption, tier, more, near: tier < req.length && need - count === 1 };
    })
    .sort((a, b) => b.tier - a.tier);

  const continentRows = Object.entries(CONTINENT_TAGS)
    .map(([tagId, def]) => {
      const members = lineup.filter((p) => p.continentTag === tagId);
      const count = members.length;
      const req3 = countEffectiveContinentRequirement(3, lineup, tagId);
      const req5 = countEffectiveContinentRequirement(5, lineup, tagId);
      const tier = count >= req5 ? 2 : count >= req3 ? 1 : 0;
      const need = tier === 0 ? req3 : req5;
      const bonus = tier === 2 ? def.tier5 : def.tier3;
      const caption = `${count}/${need} · +${bonus}`;
      // 포지션 무관이지만 아무나 받는 게 아니라 "이 대륙 출신 선수"만 받는다.
      const desc = `같은 대륙 출신끼리 말이 통하고 호흡이 잘 맞는다. 포지션 무관, ${CONTINENT_LABELS[tagId] ?? tagId} 출신 선수만 보너스를 받습니다`
        + (req3 < 3 ? ' (폴리글롯으로 요구 인원 감면)' : '')
        + `. ${req3}명 이상 모이면 +${def.tier3}, ${req5}명 이상이면 +${def.tier5}`
        + (tier ? `. 지금 받는 선수: ${members.map((p) => p.name).join(', ')}` : '');
      const more = tier === 2 ? '최대' : `${need - count}명 더 → +${tier === 0 ? def.tier3 : def.tier5}`;
      return { icon: renderTagIcon(CONTINENT_ICON_PATHS, tagId), label: CONTINENT_LABELS[tagId] ?? tagId, desc, caption, tier, more, near: tier < 2 && need - count === 1 };
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
    const slot = TRAIT_ROLE[p.specialTrait];
    if (roles[slot] === p.id) return ['on', '발동'];
    const rightPlace = slot === 'joker' ? !inXI.has(p.id) : inXI.has(p.id);
    return rightPlace ? ['wait', '대기'] : ['off', slot === 'joker' ? '선발이라 자리 아님' : '벤치라 자리 아님'];
  };
  const traitSection = holders.length ? `
    <h3 class="chemgroup__title">선수 특수 태그</h3>
    <ul class="traitrows">
      ${holders.map((p) => {
        const [st, stText] = stateOf(p);
        const slot = TRAIT_ROLE[p.specialTrait];
        return `<li class="traitrow is-${st}" data-chem-desc="${esc(p.name)} · ${ROLE_LABELS[slot]} 칸 ${esc(TRAIT_LABELS[p.specialTrait])}: ${esc(TRAIT_EFFECT_DESCRIPTIONS[p.specialTrait] ?? '')}. 대가: ${esc(TRAIT_DOWNSIDE_TEXT[p.specialTrait] ?? '')}">
          <span class="traitrow__icon">${renderTagIcon(TRAIT_ICON_PATHS, p.specialTrait)}</span>
          <span class="traitrow__name">${esc(p.name)}</span>
          <span class="traitrow__trait">${ROLE_LABELS[slot]} · ${esc(TRAIT_LABELS[p.specialTrait])}</span>
          <b class="traitrow__state">${stText}</b>
        </li>`;
      }).join('')}
    </ul>` : '';

  return `<div class="panel">
    <div class="panel__head"><h2>팀 케미</h2></div>
    <h3 class="chemgroup__title">플레이스타일</h3>
    <ul class="chembadges">${playstyleRows.map(badge).join('')}</ul>
    <h3 class="chemgroup__title">대륙</h3>
    <ul class="chembadges">${continentRows.map(badge).join('')}</ul>
    ${traitSection}
    <p class="note" id="chem-desc">배지를 누르면 자세한 조건을 알려줍니다.</p>
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
  const tab = TABS.some((t) => t.id === currentState.tab) ? currentState.tab : 'draft';
  const manualOverrides = currentState.manualOverrides ?? {};
  const benchOverrides = currentState.benchOverrides ?? {};
  const { lineup, slotted, bench } = pickBestXI(squad, formationId, manualOverrides, benchOverrides);
  const inXI = new Set(lineup.map((p) => p.id));

  // 스트립은 시너지가 반영된 최종 OVR로 계산한다. 포메이션을 바꿨을 때
  // 숫자가 왜 움직이는지(태그 발동/해제) 읽히게 하려면 baseOVR로는 안 된다.
  const roles = currentRoles(lineup, bench);
  // 지금 실제로 보너스를 주고 있는 태그(초록 아이콘): 플레이스타일/대륙 시너지가 발동한 것만
  const activeTags = new Map(lineup.map((p) => [
    p.id,
    new Set(computePlayerBonusBreakdown(p, lineup, bench, boostedTagIdFor(manager), roles).filter((x) => x.kind === 'playstyle' || x.kind === 'continent').map((x) => x.id)),
  ]));
  const finalOVR = new Map(lineup.map((p) => [p.id, computePlayerFinalOVR(p, lineup, bench, boostedTagIdFor(manager), roles)]));
  const groupAvg = (positions) => {
    const members = lineup.filter((p) => positions.includes(p.slotPosition));
    if (!members.length) return null;
    return members.reduce((sum, p) => sum + finalOVR.get(p.id), 0) / members.length;
  };
  const teamPower = computeTeamPower(lineup, bench, manager.tier, chemistry, boostedTagIdFor(manager), powerExtras(roles));

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
    return kind === 'playstyle' ? c.playstyleTags.includes(id) : c.continentTag === id;
  };
  const offerHtml = shopOffer.filter((c) => (!currentState.offerFilter || c.position === currentState.offerFilter) && matchesTag(c)).map((c) => {
    const price = cardPrice(c);
    const affordable = funds >= price;
    const tier = tierOf(c.baseOVR);
    // 정답(팀 +X.X 델타)은 안 주고 재료만 준다 - 태그 옆에 지금 라인업이
    // 몇 명째인지만 보여주고, "그래서 사야 하는지"는 유저가 판단한다.
    const boostedTagId = boostedTagIdFor(manager);
    // 칩에는 "라벨 n/m"만 - 영입 시 발동(▲ 초록)/강화(▲ 금색)는 색으로, 보너스
    // 포지션이 아니면 흐리게. 자세한 문장은 칩을 눌렀을 때 카드 아래에 뜬다.
    // reach: 영입하면 넘는 문턱의 순번(0 = 첫 문턱 발동, 1 이상 = 강화), 없으면 -1
    const chip = (label, count, need, reach, desc, dim = false) => {
      const lvl = reach < 0 ? 0 : reach === 0 ? 1 : 2;
      return `<button type="button" class="tag tag--btn${lvl ? ` tag--up${lvl}` : ''}${dim ? ' tag--dim' : ''}" data-tag-desc="${esc(desc)}">${label} <b class="tag__progress">${count}/${need}</b>${lvl ? ' ▲' : ''}</button>`;
    };
    const tags = [
      (() => {
        const n = lineup.filter((p) => p.continentTag === c.continentTag).length;
        const r3 = countEffectiveContinentRequirement(3, lineup, c.continentTag);
        const r5 = countEffectiveContinentRequirement(5, lineup, c.continentTag);
        const label = CONTINENT_LABELS[c.continentTag] ?? c.continentTag;
        const desc = `${label}: 지금 라인업 ${n}명. ${r3}명이면 +${CONTINENT_TAGS[c.continentTag].tier3}, ${r5}명이면 +${CONTINENT_TAGS[c.continentTag].tier5}(포지션 무관).` + (n + 1 === r3 ? ' 영입하면 발동!' : n + 1 === r5 ? ' 영입하면 강화!' : '');
        return chip(label, n, n >= r3 ? r5 : r3, [r3, r5].indexOf(n + 1), desc);
      })(),
      ...c.playstyleTags.map((t) => {
        const { count, need, req, values } = playstyleTagProgress(t, lineup, boostedTagId);
        const def = PLAYSTYLE_TAGS[t];
        const receives = def.positions.includes(c.position);
        const reach = req.indexOf(count + 1);
        const desc = `${TAG_LABELS[t] ?? t}: 지금 라인업 ${count}명. ${tagLadderText(req, values)}(${def.positions.join('·')} 포지션만 받음).`
          + (reach === 0 ? ' 영입하면 발동!' : reach > 0 ? ' 영입하면 강화!' : '')
          + (receives ? '' : ` 단 ${c.position}은(는) 보너스 대상 포지션이 아니라 이 선수 본인은 못 받습니다.`);
        return chip(TAG_LABELS[t] ?? t, count, need, reach, desc, !receives);
      }),
      c.specialTrait ? `<button type="button" class="tag tag--trait tag--btn" data-tag-desc="${esc(`${ROLE_LABELS[TRAIT_ROLE[c.specialTrait]]} 칸 · ${TRAIT_LABELS[c.specialTrait]}: ${TRAIT_EFFECT_DESCRIPTIONS[c.specialTrait]}. 대가: ${TRAIT_DOWNSIDE_TEXT[c.specialTrait]}`)}">${ROLE_LABELS[TRAIT_ROLE[c.specialTrait]]} · ${TRAIT_LABELS[c.specialTrait] ?? c.specialTrait}</button>` : '',
    ].join('');
    // 같은 자리 비교: 이 선수가 들어가면 밀려날 선발(그 포지션 중 가장 약한 선수)과 개인 OVR만 견준다.
    // 팀 총점 같은 정답은 주지 않는다 - 비교 재료만.
    const slotCount = FORMATIONS[formationId].slots.filter((s) => s === c.position).length;
    const sameSlot = lineup.filter((p) => p.position === c.position).sort((a, b) => a.baseOVR - b.baseOVR)[0] ?? null;
    const lineupCount = lineup.filter((p) => p.position === c.position).length;
    let compareHtml;
    if (!slotCount) {
      compareHtml = `<div class="offer__cmp is-none"><span>${c.position}</span><b>이 포메이션엔 자리가 없습니다</b></div>`;
    } else if (lineupCount < slotCount || !sameSlot) {
      compareHtml = `<div class="offer__cmp is-empty"><span>현재 ${c.position}</span><b>공석 — 영입하면 바로 선발</b></div>`;
    } else {
      const diff = c.baseOVR - sameSlot.baseOVR;
      compareHtml = `<div class="offer__cmp">
        <span>현재 ${c.position}</span>${renderPortrait(sameSlot, { size: 22 })}
        <b>${esc(sameSlot.name)} <i class="n">${sameSlot.baseOVR}</i></b>${tagIconsHtml(sameSlot, activeTags)}
        <em class="${diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat'} n">${diff > 0 ? '▲' : diff < 0 ? '▼' : '='}${Math.abs(diff)}</em>
      </div>`;
    }
    const contIcon = c.continentTag ? renderTagIcon(CONTINENT_ICON_PATHS, c.continentTag) : '';
    return `<li class="offer" data-row="${c.id}" style="--tier:var(--t-${tier})">
      <div class="pcard">
        <b class="pcard__pos">${c.position}</b><b class="pcard__ovr n">${c.baseOVR}</b>
        <div class="pcard__art">${renderPortrait(c, { size: 74 })}</div>
        <span class="pcard__flag" title="${esc(CONTINENT_LABELS[c.continentTag] ?? '')}">${contIcon}</span>
        <button type="button" class="pcard__tier" data-tier-info="${tier}" aria-label="${TIER_LABELS[tier]} 등급 설명"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 L21 5 V12 C21 17 17 21 12 22 C7 21 3 17 3 12 V5 Z" fill="currentColor"/></svg>${TIER_LABELS[tier]}<i>ⓘ</i></button>
      </div>
      <div class="offer__main">
        <div class="offer__top">
          <span class="offer__name">${esc(c.name)}</span>
          <span class="offer__age">${c.age}세</span>
        </div>
        <div class="tags">${tags}</div>
        ${compareHtml}
        <p class="offer__hint" hidden></p>
        <button class="buy" data-buy="${c.id}" ${affordable ? '' : 'disabled'}>
          <span>${affordable ? '영입' : '자금 부족'}</span>
          <span class="buy__cost">${price}G · ${decayLabel}</span>
        </button>
      </div>
    </li>`;
  }).join('');

  // 공석(포메이션이 요구하는데 스쿼드에 없는 포지션): 영입 탭 위 띠로 알리고, 누르면 그 포지션 매물만 본다.
  const gapCounts = {};
  for (const pos of missingPositions(squad, formationId)) gapCounts[pos] = (gapCounts[pos] ?? 0) + 1;
  const filterLabel = [
    currentState.offerFilter,
    currentState.offerTag ? (({ playstyle: TAG_LABELS, continent: CONTINENT_LABELS })[currentState.offerTag.split(':')[0]][currentState.offerTag.split(':')[1]]) : null,
  ].filter(Boolean).join(' · ');
  const gapBarHtml = Object.keys(gapCounts).length || filterLabel ? `<div class="gapbar">
      ${Object.entries(gapCounts).map(([pos, n]) => `<button class="gapchip${currentState.offerFilter === pos ? ' is-on' : ''}" data-gap="${pos}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21 C4 15 8 13 12 13 C16 13 20 15 20 21 Z"/></svg>공석 ${pos}${n > 1 ? ` ×${n}` : ''}</button>`).join('')}
      ${filterLabel ? `<button class="gapchip gapchip--clear" data-gap-clear>${esc(filterLabel)}만 보는 중 · 전체 보기</button>` : ''}
    </div>` : '';

  // 내 선수단 태그 현황: 가진 태그만 칩으로 보여주고(선발 인원/다음 문턱), 누르면 그 태그 매물만 본다.
  const heldPlay = {}; const heldCont = {};
  for (const p of squad) {
    for (const t of p.playstyleTags ?? []) heldPlay[t] = (heldPlay[t] ?? 0) + 1;
    if (p.continentTag) heldCont[p.continentTag] = (heldCont[p.continentTag] ?? 0) + 1;
  }
  const playChips = Object.keys(heldPlay).map((t) => ({ t, ...playstyleTagProgress(t, lineup, boostedTagIdFor(manager)) }))
    .sort((a, b) => b.tier - a.tier || b.count - a.count)
    .map(({ t, count, need, tier }) => `<button class="tagchip${tier ? ' is-on' : ''}${count === 0 ? ' is-zero' : ''}${currentState.offerTag === `playstyle:${t}` ? ' is-sel' : ''}" data-offer-tag="playstyle:${t}" title="선발 ${count}명 · 전체 ${heldPlay[t]}명">${renderTagIcon(PLAYSTYLE_ICON_PATHS, t)}${TAG_LABELS[t] ?? t}<b class="n">${count}/${need}</b></button>`).join('');
  const contChips = Object.keys(heldCont).map((t) => {
    const n = lineup.filter((p) => p.continentTag === t).length;
    const need = countEffectiveContinentRequirement(n >= countEffectiveContinentRequirement(3, lineup, t) ? 5 : 3, lineup, t);
    return { t, n, need };
  }).sort((a, b) => b.n - a.n)
    .map(({ t, n, need }) => `<button class="tagchip tagchip--cont${n >= countEffectiveContinentRequirement(3, lineup, t) ? ' is-on' : ''}${n === 0 ? ' is-zero' : ''}${currentState.offerTag === `continent:${t}` ? ' is-sel' : ''}" data-offer-tag="continent:${t}" title="선발 ${n}명 · 전체 ${heldCont[t]}명">${renderTagIcon(CONTINENT_ICON_PATHS, t)}${CONTINENT_LABELS[t] ?? t}<b class="n">${n}/${need}</b></button>`).join('');
  const traitLines = [...lineup, ...bench].filter((p) => p.specialTrait).map((p) => `<span class="tagchip tagchip--trait" title="${esc(TRAIT_EFFECT_DESCRIPTIONS[p.specialTrait] ?? '')}">${renderTagIcon(TRAIT_ICON_PATHS, p.specialTrait)}${esc(p.name)}<b>${ROLE_LABELS[TRAIT_ROLE[p.specialTrait]]} · ${esc(TRAIT_LABELS[p.specialTrait])}</b></span>`).join('');
  const tagPanelHtml = playChips || contChips ? `<div class="tagpanel${currentState.tagPanelCollapsed ? ' is-collapsed' : ''}" id="tagpanel">
      <button class="tagpanel__head" id="tagpanel-toggle" aria-expanded="${!currentState.tagPanelCollapsed}"><b>내 선수단 태그</b><span>누르면 그 태그 매물만 봅니다 · 숫자는 선발/다음 문턱</span><i class="panel__chev" aria-hidden="true">⌄</i></button>
      <div class="tagpanel__body">
        ${playChips ? `<div class="tagpanel__group"><em>플레이스타일</em><div>${playChips}</div></div>` : ''}
        ${contChips ? `<div class="tagpanel__group"><em>대륙</em><div>${contChips}</div></div>` : ''}
        ${traitLines ? `<div class="tagpanel__group"><em>특수</em><div>${traitLines}</div></div>` : ''}
      </div>
    </div>` : '';

  const starPlayer = [...squad].sort((a, b) => b.baseOVR - a.baseOVR)[0] ?? null;
  const expiredPlayers = squad.filter((p) => (p.contractYearsLeft ?? 2) <= 0);
  const expiringPlayers = squad.filter((p) => (p.contractYearsLeft ?? 2) === 1);

  const renderSquadRow = (p) => {
    const locked = !!p.boughtThisSeason; // 이번 시즌 영입한 선수는 방출/판매 불가
    const lockTitle = 'title="이번 시즌 영입한 선수는 방출·판매할 수 없습니다"';
    const yearsLeft = p.contractYearsLeft ?? 2;
    const contractLabel = yearsLeft <= 0
      ? '<span class="tag tag--expired">계약 만료</span>'
      : yearsLeft === 1 ? '<span class="tag tag--expiring">계약 1년</span>' : `계약 ${yearsLeft}년`;
    return `<li class="player${inXI.has(p.id) ? ' is-xi' : ''}" data-row="${p.id}" style="--tier:var(--t-${tierOf(p.baseOVR)})">
      ${renderPortrait(p, { size: 36, kit: club.kit })}
      <b class="player__ovr n">${p.baseOVR}</b>
      <div>
        <div class="player__name">${esc(p.name)}${currentState.justBoughtIds?.includes(p.id) ? '<span class="tag tag--new">NEW</span>' : ''}</div>
        <div class="player__meta">${p.position} · ${p.age}세 · <b>${p.price}G</b>${inXI.has(p.id) ? ' · 주전' : ''} · ${contractLabel}</div>
        ${playerTagsHtml(p)}
      </div>
      <div class="player__actions" data-actions="${p.id}">
        ${yearsLeft <= 1 ? `<span class="player__renew"><em>재계약</em>${renewYears(p).map((y) => `<button class="renew" data-renew="${p.id}" data-years="${y}" ${funds >= renewCost(p, y) ? '' : 'disabled'}>${y}년 <b>${renewCost(p, y)}G</b></button>`).join('') || '<small class="nore">재계약 불가</small>'}</span>` : ''}
        <button class="release" data-release-immediate="${p.id}" ${locked ? `disabled ${lockTitle}` : `title="회수 0%, ${decayLabel}"`}>즉시 방출</button>
        <button class="release" data-release-listed="${p.id}" ${locked ? `disabled ${lockTitle}` : 'title="1주 뒤 정산"'}>판매 등록</button>
        ${isDeadlineWeek ? `<button class="release release--deadline" data-release-deadline="${p.id}" ${locked ? `disabled ${lockTitle}` : 'title="원가의 40% 회수"'}>데드라인 방출</button>` : ''}
      </div>
    </li>`;
  };
  // 포지션별로 묶어서 보여준다 - 뎁스가 어디서 얕은지(예: CB만 8명, ST는 1명)
  // 한눈에 보이게. 순서는 engine/constants.mjs POSITIONS 순서 그대로.
  // 선수단 탭: 공석은 실루엣 줄로 맨 위에 보여준다(누르면 영입 탭이 그 포지션으로 필터됨).
  const gapRows = Object.entries(gapCounts).map(([pos, n]) => `<li class="player player--empty">
      <span class="silhouette"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21 C4 15 8 13 12 13 C16 13 20 15 20 21 Z"/></svg></span>
      <b class="player__ovr n">--</b>
      <div><div class="player__name">공석 ${pos}${n > 1 ? ` ×${n}` : ''}</div><div class="player__meta">시즌 시작 전에 못 채우면 최저 능력치 유스가 들어옵니다</div></div>
      <button class="gapchip" data-gap="${pos}">영입 보기</button>
    </li>`).join('');
  const squadHtml = (gapRows ? `<ul class="squad squad--gaps">${gapRows}</ul>` : '') + POSITIONS
    .map((pos) => {
      const players = squad.filter((p) => p.position === pos).sort((a, b) => b.baseOVR - a.baseOVR);
      if (!players.length) return '';
      return `<h3 class="chemgroup__title">${pos} <span class="panel__count">${players.length}명</span></h3>
        <ul class="squad">${players.map(renderSquadRow).join('')}</ul>`;
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
        ${tagPanelHtml}
        ${gapBarHtml}
        <ul class="offers">${offerHtml || `<li class="empty">${currentState.offerFilter ? `이번 주 매물에 ${currentState.offerFilter}가 없습니다. 다시 뽑거나 전체 보기로 돌아가세요.` : '이번 주는 매물이 없습니다. 다시 뽑거나 다음 주로 넘어가세요.'}</li>`}</ul>
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
                <div class="mgroffer__body">
                  <div class="player__name">${esc(m.name)}</div>
                  ${managerChipsHtml(m)}
                  ${managerTraitHtml(m)}
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
                    <div class="player__meta"><b class="staff__level">${STAFF_LEVEL_LABELS[level]}</b> · ${staffBenefit(role, level)}</div>
                  </div>
                </div>
                <button class="hire" data-hire-staff="${role}:${level}" ${isCurrent || funds < cost ? 'disabled' : ''}>
                  <span>영입</span>
                  <span class="hire__cost">${cost}G</span>
                </button>
              </li>`;
            }).join('')}
          </ul>`).join('')}
        <p class="note">위약금 없이 바로 교체되지만, 영입한 주에는 새 효과가 발동하지 않습니다.</p>
      </section>`,
    tactics: `
      <section class="panel tabpanel">
        <div class="panel__head">
          <h2>포메이션</h2>
          <div class="formations">
            ${Object.keys(FORMATIONS).map((id) => `<button data-formation="${id}" aria-pressed="${id === formationId}">${id}</button>`).join('')}
          </div>
          <button class="reroll" id="auto-lineup-btn">케미 포함 최적 배치</button>
          <button class="reroll" id="reset-lineup-btn" ${Object.keys(manualOverrides).length || Object.keys(benchOverrides).length ? '' : 'disabled'}>배치 초기화</button>
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
        ${renderRoleChips(roles, lineup, bench)}
        ${renderBonusDetail(slotted[currentState.selectedSlot], lineup, bench, boostedTagIdFor(manager), roles)}
        ${renderSlotPicker(squad, formationId, currentState.selectedSlot, inXI, new Set(bench.map((p) => p.id)))}
        <p class="note">칸을 눌러 넣을 선수를 고르세요(선발 자리엔 그 포지션 선수만 설 수 있습니다). 포메이션을 바꾸면 슬롯 구성이 바뀌어 플레이스타일 시너지 발동 조건이 달라집니다.</p>
      </section>
      ${renderChemistryPanel(lineup, bench, roles)}`,
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
      ${expiredPlayers.length || expiringPlayers.length ? `
      <section class="panel tabpanel${expiredPlayers.length ? ' panel--warn' : ''}${currentState.contractCollapsed ? ' is-collapsed' : ''}" id="contract-panel">
        <button class="panel__head panel__head--toggle" id="contract-toggle" aria-expanded="${!currentState.contractCollapsed}">
          <h2>계약 관리 <span class="panel__count">${expiredPlayers.length + expiringPlayers.length}명</span></h2>
          <span class="panel__count">${expiredPlayers.length ? '만료 선수는 여름 안에 정하세요' : '1년 남은 선수'}</span>
          <i class="panel__chev" aria-hidden="true">⌄</i>
        </button>
        <ul class="squad">${[...expiredPlayers, ...expiringPlayers].map((p) => {
          const expired = (p.contractYearsLeft ?? 2) <= 0;
          return `
          <li class="player player--contract" style="--tier:var(--t-${tierOf(p.baseOVR)})">
            ${renderPortrait(p, { size: 36, kit: club.kit })}
            <b class="player__ovr n">${p.baseOVR}</b>
            <div>
              <div class="player__name">${esc(p.name)}</div>
              <div class="player__meta">${p.position} · ${p.age}세 · 재계약 ${p.renewCount ?? 0}/${MAX_RENEWALS} · ${expired ? '<span class="tag tag--expired">만료</span> 안 정하면 무료로 이탈' : '<span class="tag tag--expiring">계약 1년</span> 미리 연장 가능'}</div>
            </div>
            <div class="player__actions">
              ${renewYears(p).map((y) => `<button class="renew" data-renew="${p.id}" data-years="${y}" ${funds >= renewCost(p, y) ? '' : 'disabled'}>${y}년 <b>${renewCost(p, y)}G</b></button>`).join('') || '<small class="nore">재계약 불가 · 자유계약으로 떠남</small>'}
            </div>
          </li>`;
        }).join('')}</ul>
      </section>` : ''}
      <section class="panel tabpanel">
        ${listedHtml ? `<div class="panel__head"><h2>이적 명단</h2></div><ul class="listed">${listedHtml}</ul><div style="height:var(--s4)"></div>` : ''}
        <div class="panel__head"><h2>보유 선수</h2></div>
        ${squadHtml}
      </section>`,
    staff: `
      <section class="panel tabpanel">
        <div class="panel__head"><h2>감독·스태프가 팀 전력에 주는 영향</h2></div>
        ${(() => {
          const expected = LEAGUE_EXPECTED_MANAGER[currentState.leagueTierId] ?? 1;
          const mgr = MANAGER_TIER_MULTIPLIER[manager.tier];
          const fit = mgr / expected;
          const coach = COACH_POWER_MULTIPLIER[staff.headCoach.level] ?? 1;
          const tone = fit < 1 ? 'var(--debit)' : 'var(--turf)';
          return `<p class="note">${getLeagueTier(currentState.leagueTierId).label}는 감독 배율 <b>×${expected.toFixed(2)}</b>를 기대합니다.
            지금 감독 ×${mgr.toFixed(2)} → 팀 전력 <b style="color:${tone}">×${fit.toFixed(3)}</b>${fit < 1 ? ' (기대에 못 미쳐 손해)' : ''}.
            수석 코치(${STAFF_LEVEL_LABELS[staff.headCoach.level]}) 직접 효과 <b>×${coach.toFixed(3)}</b>.</p>`;
        })()}
      </section>
      <section class="panel tabpanel">
        <div class="panel__head"><h2>감독</h2></div>
        <div class="starplayer" style="--tier:var(--${MANAGER_TIER_COLOR[manager.tier] ?? 't-local'})">
          ${renderPortrait(manager, { size: 48 })}
          <div class="mgroffer__body">
            <div class="player__name">${esc(manager.name)}</div>
            ${managerChipsHtml(manager)}
            ${managerTraitHtml(manager)}
            <p class="traitline traitline--none">전술 태그: 여름 시장이 끝날 때 라인업에서 발동하면 적응도 +${MANAGER_HARMONY_BONUS}, 못 켜면 −${MANAGER_HARMONY_PENALTY}</p>
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
                <div class="player__meta">${STAFF_ROLE_LABELS[role]} · <b class="staff__level">${STAFF_LEVEL_LABELS[staff[role].level] ?? staff[role].level}</b> · ${staffBenefit(role, staff[role].level)}</div>
              </div>
            </li>`).join('')}
        </ul>
        <p class="note">감독·스태프 영입은 "영입" 탭에서 할 수 있습니다.</p>
      </section>`,
  };

  const showEvent = week === (phase === 'summer' ? SUMMER_MARKET_WEEKS[0] : WINTER_MARKET_WEEKS[0]) && eventTone;

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
        <div class="res__item res__item--btn" id="funds-info-btn" role="button" tabindex="0">
          <span class="res__label">자금 <i class="res__hint">ⓘ</i></span>
          <span class="res__val n">${funds.toLocaleString('ko-KR')}<i>G</i></span>
        </div>
        <div class="res__item res__item--btn" id="chem-info-btn" role="button" tabindex="0">
          <span class="res__label">적응도 <i class="res__hint">ⓘ</i></span>
          <span class="res__val n">${chemistry.toFixed(1)}</span>
          <div class="chembar${chemistry < 40 ? ' is-low' : ''}"><i style="width:${Math.min(100, chemistry)}%"></i></div>
        </div>
      </div>
      <p class="note chem-info" id="funds-info" hidden>
        <b>이번 시즌 자금 흐름</b><br>
        시즌 시작 <b>${track.start.toLocaleString('ko-KR')}G</b> ·
        선수 영입 <b>−${track.spent.toLocaleString('ko-KR')}G</b> ·
        방출/판매 수입 <b>+${track.income.toLocaleString('ko-KR')}G</b> ·
        그 밖(겨울 지원금·이벤트 등) <b>${otherFlow >= 0 ? '+' : '−'}${Math.abs(otherFlow).toLocaleString('ko-KR')}G</b><br>
        <b>이적 손익 ${net >= 0 ? '+' : '−'}${Math.abs(net).toLocaleString('ko-KR')}G</b> (수입 − 영입 지출). 즉시 방출은 회수 0%, 이적 명단은 1주 뒤 일부, 12주 데드라인 방출은 원가의 40%를 돌려받습니다.
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
          return `<div class="pw${pwClass(avg)}"><span class="pw__label">${g.label}</span><span class="pw__val n">${avg === null ? '--' : avg.toFixed(0)}</span></div>`;
        }).join('')}
        <div class="pw pw--total"><span class="pw__label">팀 전력</span><span class="pw__val n">${teamPower.toFixed(0)}</span></div>
      </div>`;
    })()}

    ${banner ? `<div class="banner">${esc(banner)}</div>` : ''}

    <div class="tabs" role="tablist">
      ${TABS.map((t) => `<button class="tab" role="tab" data-tab="${t.id}" aria-selected="${t.id === tab}">${t.label}${t.id === 'draft' ? `<span class="tab__count">${shopOffer.length}</span>` : ''}${t.id === 'squad' ? `<span class="tab__count${expiredPlayers.length ? ' tab__count--warn' : ''}">${expiredPlayers.length ? `만료 ${expiredPlayers.length}` : squad.length}</span>` : ''}</button>`).join('')}
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
      if (!btn) continue; // 공석 필터로 가려진 카드는 화면에 없다
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
      const boosted = boostedTagIdFor(manager);
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
    document.querySelectorAll('[data-role]').forEach((el) => {
      el.onclick = () => {
        currentState.rolePicker = currentState.rolePicker === el.dataset.role ? null : el.dataset.role;
        renderMarket(banner);
      };
    });
    document.querySelectorAll('[data-role-pick]').forEach((el) => {
      el.onclick = () => {
        const [slot, value] = el.dataset.rolePick.split(':');
        const next = { ...(currentState.roleOverrides ?? {}) };
        if (value === 'auto') delete next[slot];
        else next[slot] = value;
        currentState.roleOverrides = next;
        currentState.rolePicker = null;
        renderMarket(banner);
      };
    });
    document.querySelectorAll('[data-chem-desc]').forEach((el) => {
      el.addEventListener('click', () => {
        document.getElementById('chem-desc').textContent = el.dataset.chemDesc;
      });
    });
  }
  document.getElementById('contract-toggle')?.addEventListener('click', () => {
    currentState.contractCollapsed = !currentState.contractCollapsed;
    const panel = document.getElementById('contract-panel');
    panel.classList.toggle('is-collapsed', currentState.contractCollapsed);
    document.getElementById('contract-toggle').setAttribute('aria-expanded', String(!currentState.contractCollapsed));
  });
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
  document.getElementById('tagpanel-toggle')?.addEventListener('click', () => {
    currentState.tagPanelCollapsed = !currentState.tagPanelCollapsed;
    document.getElementById('tagpanel')?.classList.toggle('is-collapsed', currentState.tagPanelCollapsed);
  });
  document.querySelectorAll('[data-tag-desc]').forEach((el) => {
    el.addEventListener('click', () => {
      const hint = el.closest('.offer')?.querySelector('.offer__hint');
      if (!hint) return;
      hint.textContent = el.dataset.tagDesc;
      hint.hidden = false;
    });
  });
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
    // 선수 행을 누르면 관리 버튼(재계약/판매 등록/방출)이 펼쳐진다.
    document.querySelectorAll('.squad .player[data-row]').forEach((row) => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        row.classList.toggle('is-open');
      });
    });
    document.querySelectorAll('[data-renew]').forEach((btn) => {
      btn.onclick = () => {
        const id = btn.dataset.renew;
        const years = Number(btn.dataset.years);
        const player = currentState.squad.find((p) => p.id === id);
        if (!player) return;
        if (!renewYears(player).includes(years)) return;
        const cost = renewCost(player, years);
        if (currentState.funds < cost) return;
        currentState.funds -= cost;
        // 만료 전 미리 재계약하면 남은 계약에 이어 붙는다(0년 남았으면 그냥 years).
        const total = Math.max(0, player.contractYearsLeft ?? 2) + years;
        currentState.squad = currentState.squad.map((p) => p.id === id
          ? { ...p, contractYearsLeft: total, renewCount: (p.renewCount ?? 0) + 1, renewedOnce: p.renewedOnce || p.specialTrait === 'journeyman' }
          : p);
        renderMarket(`${player.name} 재계약 완료(+${years}년 → 계약 ${total}년, ${cost}G)`);
      };
    });
  }
  document.getElementById('next-week-btn').onclick = () => {
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
    const ag = briefing.aging ?? { changes: [], retired: [] };
    const ups = [...ag.changes].filter((c) => c.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 4);
    const downs = [...ag.changes].filter((c) => c.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 4);
    const agingHtml = ups.length || downs.length || ag.retired.length ? `<div class="agingbox">
        <b>선수단 변화 (한 살)</b>
        <ul>
          ${ups.map((c) => `<li class="is-up">▲ ${esc(c.name)} <span>${c.age}세 · ${c.from}→${c.to} (+${c.delta})</span></li>`).join('')}
          ${downs.map((c) => `<li class="is-down">▼ ${esc(c.name)} <span>${c.age}세 · ${c.from}→${c.to} (${c.delta})</span></li>`).join('')}
          ${ag.retired.map((r) => `<li class="is-retire">은퇴 ${esc(r.name)} <span>${r.age}세</span></li>`).join('')}
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
    eventRoot.innerHTML = `
      <div class="eventmodal-backdrop">
        <div class="eventmodal eventmodal--${review && review.surplus > 0 ? 'good' : 'goal'}">
          <div class="eventmodal__kicker">시즌 ${seasonNumber} · 이사진 브리핑</div>
          <div class="eventmodal__title">${tierLabel} 목표 승점 ${goal}점</div>
          ${reviewHtml}
          ${demandReviewHtml}
          ${transferHtml}
          ${fundsHtml}
          ${agingHtml}
          <p class="eventmodal__detail">안전선 ${tier.safePoints}점 · 승격선 ${tier.targetPoints}점. ${BOARD_RULE_TEXT}</p>
          <div class="demandcards demandcards--modal">${(demandOffer ?? []).map((id) => demandCardHtml(getDemand(id), 'data-pick-demand')).join('')}</div>
          <p class="eventmodal__detail">위 카드에서 이번 시즌 이사진 요구를 고르면 달성 시 보너스가 붙습니다(안 골라도 됩니다).</p>
          <button class="cta" id="eventmodal-dismiss">목표 확인</button>
        </div>
      </div>`;
    eventRoot.querySelectorAll('[data-pick-demand]').forEach((el) => {
      el.onclick = () => {
        const card = getDemand(el.dataset.pickDemand);
        currentState.boardDemand = { cardId: card.id, difficulty: card.difficulty };
        eventRoot.querySelectorAll('[data-pick-demand]').forEach((o) => o.classList.toggle('is-picked', o === el));
      };
    });
    const resolveTransfer = (leave) => {
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
    };
  } else {
    eventRoot.innerHTML = '';
  }

  saveRun(currentState, localStorage);
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
