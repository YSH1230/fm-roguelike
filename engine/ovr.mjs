import { PLAYSTYLE_TAGS, CONTINENT_TAGS, TRAIT_ROLE, ROLE_SLOTS } from './constants.mjs';

// roles = { captain, ace, joker }(선수 id 또는 null). 특수 성향은 자기 역할 슬롯에
// 배정된 선수에게서만 효과가 난다. roles가 null이면 슬롯 제한 없이 전부 발동(옛 동작,
// 개별 함수 단위 테스트/계산용)하고, undefined면 최상위 함수가 autoRoles로 자동 배정한다.
const assigned = (roles, player) => !roles || roles[TRAIT_ROLE[player.specialTrait]] === player.id;

// --- 본인 정보만으로 계산되는 특수 성향 (에이스 슬롯: 성골 유스, 지역 영웅, 저니맨, 스타 기질) ---
export function computeSelfTraitBonus(player, roles = null) {
  if (!assigned(roles, player)) return 0;
  switch (player.specialTrait) {
    case 'seongGolYouth':
      return player.isDraftedYouth ? 10 : 0;
    case 'hometownHero':
      return Math.min(player.seasonsAtClub, 3) * 4; // 상한 +12 (3시즌분)
    case 'journeyman':
      return player.acquiredThisSeason ? 8 : 0;
    case 'starPower':
      return 10;
    default:
      return 0;
  }
}

// --- 라인업/벤치 전체를 봐야 하는 특수 성향 (주장: 베테랑 리더 / 조커: 슈퍼 서브) ---
export function computeTeamTraitBonuses(lineup, bench, roles = null) {
  const bonuses = new Map();
  const addBonus = (playerId, amount) => {
    bonuses.set(playerId, (bonuses.get(playerId) ?? 0) + amount);
  };

  const hasVeteranLeader = lineup.some(
    (p) => p.specialTrait === 'veteranLeader' && p.age >= 33 && assigned(roles, p)
  );
  if (hasVeteranLeader) {
    for (const p of lineup) {
      if (p.age <= 23) addBonus(p.id, 3);
    }
  }

  // 조커 슬롯은 1명이라 중첩이 없다(roles가 null인 옛 계산에서만 벤치 전원이 발동).
  const jokers = bench.filter((p) => p.specialTrait === 'superSub' && assigned(roles, p));
  if (jokers.length > 0) {
    const bonus = roles ? 1 : Math.min(jokers.length * 2, 4);
    for (const p of lineup) addBonus(p.id, bonus);
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
// boostedTagId: 예전 전술 원리주의자 감면용 자리 - 지금은 안 쓴다(인자 정리는 별도).
export function computePlaystyleSynergyBonus(lineup, boostedTagId = null, onlyTagId = null) {
  const bonuses = new Map();
  for (const [tagId, tagDef] of Object.entries(PLAYSTYLE_TAGS)) {
    if (onlyTagId && tagId !== onlyTagId) continue;
    const holders = lineup.filter((p) => p.playstyleTags.includes(tagId) && tagDef.positions.includes(p.position));
    if (holders.length < tagDef.thresholds[0]) continue;
    const value = tieredValue(holders.length, tagDef.thresholds, tagDef.values);
    for (const p of holders) {
      bonuses.set(p.id, (bonuses.get(p.id) ?? 0) + value);
    }
  }
  return bonuses;
}

export function countEffectiveContinentRequirement(baseCount, lineup, continentTag, roles = null) {
  const hasPolyglotForThisContinent = lineup.some(
    (p) => p.specialTrait === 'polyglot' && p.continentTag === continentTag && assigned(roles, p)
  );
  if (!hasPolyglotForThisContinent) return baseCount;
  return Math.max(2, baseCount - 2);
}

export function computeContinentSynergyBonus(lineup, onlyTagId = null, roles = null) {
  const bonuses = new Map();
  for (const continentTag of Object.keys(CONTINENT_TAGS)) {
    if (onlyTagId && continentTag !== onlyTagId) continue;
    const members = lineup.filter((p) => p.continentTag === continentTag);
    if (members.length === 0) continue;

    const tagDef = CONTINENT_TAGS[continentTag];
    const req3 = countEffectiveContinentRequirement(3, lineup, continentTag, roles);
    const req5 = countEffectiveContinentRequirement(5, lineup, continentTag, roles);

    let value = 0;
    if (members.length >= req5) value = tagDef.tier5;
    else if (members.length >= req3) value = tagDef.tier3;
    if (value === 0) continue;

    for (const p of members) {
      // 폴리글롯 대가: 주장으로 뛰는 본인은 대륙 케미를 받지 못한다.
      if (roles && p.specialTrait === 'polyglot' && assigned(roles, p)) continue;
      bonuses.set(p.id, (bonuses.get(p.id) ?? 0) + value);
    }
  }
  return bonuses;
}

// roles 생략(undefined)이면 autoRoles로 자동 배정한 결과를 쓴다. 여러 선수를 반복 계산할
// 때는 호출부가 roles를 한 번만 구해서 넘겨야 빠르다(computeAverageOVR이 그렇게 한다).
export function computePlayerFinalOVR(player, lineup, bench, boostedTagId = null, roles = undefined) {
  const r = roles === undefined ? autoRoles(lineup, bench, boostedTagId) : roles;
  const selfBonus = computeSelfTraitBonus(player, r);
  const teamBonuses = computeTeamTraitBonuses(lineup, bench, r);
  const playstyleBonuses = computePlaystyleSynergyBonus(lineup, boostedTagId);
  const continentBonuses = computeContinentSynergyBonus(lineup, null, r);

  return (
    player.baseOVR +
    selfBonus +
    (teamBonuses.get(player.id) ?? 0) +
    (playstyleBonuses.get(player.id) ?? 0) +
    (continentBonuses.get(player.id) ?? 0)
  );
}

const totalWith = (lineup, bench, boostedTagId, roles) =>
  lineup.reduce((sum, p) => sum + computePlayerFinalOVR(p, lineup, bench, boostedTagId, roles), 0);

// 슬롯 후보(그 슬롯 태그를 가진 선수) 중 배정했을 때 라인업 최종 OVR 합이 가장 큰 선수를 고른다.
// 배정해도 안 늘면(예: 폴리글롯이 오히려 손해) 슬롯을 비워 둔다. 조커 후보는 벤치, 나머지는 선발.
export function autoRoles(lineup, bench, boostedTagId = null) {
  const roles = { captain: null, ace: null, joker: null };
  for (const slot of ROLE_SLOTS) {
    const pool = slot === 'joker' ? bench : lineup;
    let best = null;
    let bestScore = totalWith(lineup, bench, boostedTagId, roles);
    for (const cand of pool.filter((p) => TRAIT_ROLE[p.specialTrait] === slot)) {
      const score = totalWith(lineup, bench, boostedTagId, { ...roles, [slot]: cand.id });
      if (score > bestScore + 1e-9) { best = cand.id; bestScore = score; }
    }
    roles[slot] = best;
  }
  return roles;
}

// 자동 배정 위에 유저가 고른 배정(overrides[slot] = 선수 id 또는 'none')을 얹는다.
// 자격이 없는 선수(그 슬롯 태그가 없거나 라인업/벤치에 없음)를 가리키면 무시하고 자동값을 쓴다.
export function resolveRoles(overrides, lineup, bench, boostedTagId = null) {
  const roles = autoRoles(lineup, bench, boostedTagId);
  for (const slot of ROLE_SLOTS) {
    const want = overrides?.[slot];
    if (!want) continue;
    if (want === 'none') { roles[slot] = null; continue; }
    const pool = slot === 'joker' ? bench : lineup;
    if (pool.some((p) => p.id === want && TRAIT_ROLE[p.specialTrait] === slot)) roles[slot] = want;
  }
  return roles;
}

// 최종 OVR이 baseOVR보다 왜 올랐는지 출처별로 쪼갠다(전술 탭 "누가 무슨 케미로
// 몇 점" 표시용). 위 계산 함수를 그대로 재사용하니 합계는 항상
// computePlayerFinalOVR - baseOVR과 같다.
// kind: 'self' | 'team' | 'playstyle' | 'continent', id: 태그/특수성향 id.
export function computePlayerBonusBreakdown(player, lineup, bench, boostedTagId = null, roles = undefined) {
  const r = roles === undefined ? autoRoles(lineup, bench, boostedTagId) : roles;
  const parts = [];
  const self = computeSelfTraitBonus(player, r);
  if (self) parts.push({ kind: 'self', id: player.specialTrait, value: self });

  const team = computeTeamTraitBonuses(lineup, bench, r).get(player.id);
  if (team) {
    const isLeader = player.age <= 23 && lineup.some((p) => p.specialTrait === 'veteranLeader' && p.age >= 33 && assigned(r, p));
    const isJoker = bench.some((p) => p.specialTrait === 'superSub' && assigned(r, p));
    if (isLeader) parts.push({ kind: 'team', id: 'veteranLeader', value: 3 });
    if (isJoker) parts.push({ kind: 'team', id: 'superSub', value: team - (isLeader ? 3 : 0) });
  }

  for (const tagId of Object.keys(PLAYSTYLE_TAGS)) {
    const value = computePlaystyleSynergyBonus(lineup, boostedTagId, tagId).get(player.id);
    if (value) parts.push({ kind: 'playstyle', id: tagId, value });
  }
  for (const tagId of Object.keys(CONTINENT_TAGS)) {
    const value = computeContinentSynergyBonus(lineup, tagId, r).get(player.id);
    if (value) parts.push({ kind: 'continent', id: tagId, value });
  }
  return parts;
}
