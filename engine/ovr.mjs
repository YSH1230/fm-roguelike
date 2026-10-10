import { hasPeaked } from './aging.mjs';
import { PLAYSTYLE_TAGS, SEED_EFFECT, tagAmp, flairBonusFor, COACH_UNITS, COACH_FOCUS_ORDER, COACH_UNIT_BONUS_BY_LEVEL } from './constants.mjs';

// v2: 역할 칸(주장/에이스/조커)과 대륙 시너지는 폐지. 특수 성향은 선발/벤치에 있기만 하면 자동 적용되고,
// 같은 성향이 여러 명이어도 팀 효과는 중첩되지 않는다. (마지막 roles 인자는 옛 호출부 호환용으로 무시)

// --- 본인 정보만으로 계산되는 특수 성향 (성골 유스, 지역 영웅, 저니맨, 스타 기질) ---
export function computeSelfTraitBonus(player) {
  switch (player.specialTrait) {
    case 'seongGolYouth':
      return player.isDraftedYouth ? 10 : 0;
    case 'hometownHero':
      return Math.min(player.seasonsAtClub ?? 0, 3) * 4; // 상한 +12 (3시즌분)
    case 'journeyman':
      return player.acquiredThisSeason ? 8 : 0;
    case 'starPower':
      return 10;
    default:
      return 0;
  }
}

// --- 라인업/벤치 전체를 봐야 하는 특수 성향 (베테랑 리더 / 슈퍼 서브) ---
export function computeTeamTraitBonuses(lineup, bench) {
  const bonuses = new Map();
  const addBonus = (playerId, amount) => {
    bonuses.set(playerId, (bonuses.get(playerId) ?? 0) + amount);
  };

  if (lineup.some((p) => p.specialTrait === 'veteranLeader' && p.age >= 33)) {
    for (const p of lineup) if (p.age <= 23) addBonus(p.id, 3);
  }
  if (bench.some((p) => p.specialTrait === 'superSub')) {
    for (const p of lineup) addBonus(p.id, 1);
  }
  return bonuses;
}

// --- 계단식 인원수 판정 (문턱 사이 인원은 아래 문턱 값: 4명은 3명 값, 6명은 5명 값) ---
function tieredValue(count, thresholds, values) {
  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (count >= thresholds[i]) return values[i];
  }
  return 0;
}

// 시너지 발동 인원수는 포지션과 무관하게 라인업(베스트11) 전체의 태그 보유자 수로 센다.
// 버프 지급은 그중 대상 포지션에 있는 보유자에게만 한다 (스펙 5.1 "베스트11 배치자만 카운트").
// 수석 코치 보너스: coach = { level, focus }. 주력 유닛부터 차례로(등급이 높을수록 더 많은 유닛에) 그 유닛 포지션 선수에게 OVR을 더한다.
export function coachBonusFor(coach, position) {
  if (!coach) return 0;
  const bonuses = COACH_UNIT_BONUS_BY_LEVEL[coach.level] ?? [];
  const order = COACH_FOCUS_ORDER[coach.focus] ?? COACH_FOCUS_ORDER.midfield;
  const i = order.findIndex((unit) => COACH_UNITS[unit].includes(position));
  return i >= 0 ? bonuses[i] ?? 0 : 0;
}

// 성장 중: 전성기 전 선수는 태그 효과를 절반만 받는다(인원 수에는 그대로 센다)
export const isSeed = (p) => p.peakOVR != null && Number.isFinite(p.age) && !hasPeaked(p);

// 팀 컬러 완성: 같은 태그를 가진 선발이 5명 이상이면 그 태그의 팀 컬러가 "완성"된다.
export const COLOR_COMPLETE_COUNT = 5;
export const COLOR_COMPLETE_CHEMISTRY = 1; // 완성된 주마다 조직력 +1(거래가 있어도)
export const COLOR_COMPLETE_VALUE = 1.05; // 그 태그를 가진 선수의 판매 오퍼 +5%
export function completedTags(lineup) {
  return Object.keys(PLAYSTYLE_TAGS).filter((t) => lineup.filter((p) => p.playstyleTags.includes(t)).length >= COLOR_COMPLETE_COUNT);
}

// 개인 특기(월드클래스 이상): 선발로 뛰면 본인 OVR이 오른다
export const flairBonus = (p) => (p.flair ? flairBonusFor(p.baseOVR) : 0);

// 같은 태그를 가진 선발 수로 문턱을 판정하고, 그 태그를 가진 선발 전원이 보너스를 받는다(성장 중은 절반).
export function computePlaystyleSynergyBonus(lineup, onlyTagId = null) {
  const bonuses = new Map();
  for (const [tagId, tagDef] of Object.entries(PLAYSTYLE_TAGS)) {
    if (onlyTagId && tagId !== onlyTagId) continue;
    const holders = lineup.filter((p) => p.playstyleTags.includes(tagId));
    if (holders.length < tagDef.thresholds[0]) continue;
    const value = tieredValue(holders.length, tagDef.thresholds, tagDef.values);
    for (const p of holders) {
      bonuses.set(p.id, (bonuses.get(p.id) ?? 0) + value * tagAmp(p.baseOVR) * (isSeed(p) ? SEED_EFFECT : 1));
    }
  }
  return bonuses;
}

export function computePlayerFinalOVR(player, lineup, bench, coach = null) {
  return (
    player.baseOVR +
    computeSelfTraitBonus(player) +
    flairBonus(player) +
    (computeTeamTraitBonuses(lineup, bench).get(player.id) ?? 0) +
    (computePlaystyleSynergyBonus(lineup).get(player.id) ?? 0) +
    coachBonusFor(coach, player.position)
  );
}

// 최종 OVR이 baseOVR보다 왜 올랐는지 출처별로 쪼갠다(전술 탭 "누가 무슨 케미로
// 몇 점" 표시용). 위 계산 함수를 그대로 재사용하니 합계는 항상
// computePlayerFinalOVR - baseOVR과 같다.
// kind: 'self' | 'team' | 'playstyle' | 'coach', id: 태그/특수성향 id.
export function computePlayerBonusBreakdown(player, lineup, bench, coach = null) {
  const parts = [];
  const self = computeSelfTraitBonus(player);
  if (self) parts.push({ kind: 'self', id: player.specialTrait, value: self });

  if (player.age <= 23 && lineup.some((p) => p.specialTrait === 'veteranLeader' && p.age >= 33)) {
    parts.push({ kind: 'team', id: 'veteranLeader', value: 3 });
  }
  if (bench.some((p) => p.specialTrait === 'superSub')) parts.push({ kind: 'team', id: 'superSub', value: 1 });

  for (const tagId of Object.keys(PLAYSTYLE_TAGS)) {
    const value = computePlaystyleSynergyBonus(lineup, tagId).get(player.id);
    if (value) parts.push({ kind: 'playstyle', id: tagId, value });
  }
  const flair = flairBonus(player);
  if (flair) parts.push({ kind: 'flair', id: 'flair', value: flair });
  const coachValue = coachBonusFor(coach, player.position);
  if (coachValue) parts.push({ kind: 'coach', id: 'headCoach', value: coachValue });
  return parts;
}
