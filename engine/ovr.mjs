import { PLAYSTYLE_TAGS, CONTINENT_TAGS } from './constants.mjs';

// --- 본인 정보만으로 계산되는 특수 성향 (성골 유스, 홈타운 영웅, 저니맨) ---
export function computeSelfTraitBonus(player) {
  switch (player.specialTrait) {
    case 'seongGolYouth':
      return player.isDraftedYouth ? 3 : 0;
    case 'hometownHero':
      return Math.min(player.seasonsAtClub, 3) * 2; // 상한 +6 (3시즌분)
    case 'journeyman':
      return player.acquiredThisSeason ? 4 : 0;
    default:
      return 0;
  }
}

// --- 라인업/벤치 전체를 봐야 하는 특수 성향 (베테랑 리더, 슈퍼 서브) ---
export function computeTeamTraitBonuses(lineup, bench) {
  const bonuses = new Map();
  const addBonus = (playerId, amount) => {
    bonuses.set(playerId, (bonuses.get(playerId) ?? 0) + amount);
  };

  const hasVeteranLeader = lineup.some(
    (p) => p.specialTrait === 'veteranLeader' && p.age >= 33
  );
  if (hasVeteranLeader) {
    for (const p of lineup) {
      if (p.age <= 23) addBonus(p.id, 2);
    }
  }

  const superSubCount = bench.filter((p) => p.specialTrait === 'superSub').length;
  if (superSubCount > 0) {
    const bonus = Math.min(superSubCount, 2); // 중첩 상한 +2
    for (const p of lineup) addBonus(p.id, bonus);
  }

  return bonuses;
}

// --- 계단식 인원수 판정 (4명은 3명 값, 6명 이상은 5명 값) ---
function tieredValue(count, tier3, tier5) {
  if (count >= 5) return tier5;
  if (count >= 3) return tier3;
  return 0;
}

// 시너지 발동 인원수는 포지션과 무관하게 라인업(베스트11) 전체의 태그 보유자 수로 센다.
// 버프 지급은 그중 대상 포지션에 있는 보유자에게만 한다 (스펙 5.1 "베스트11 배치자만 카운트").
// boostedTagId: 감독의 전술 원리주의자 성향이 지정한 태그의 요구 인원을 1명 감면(스펙 5.2절).
export function computePlaystyleSynergyBonus(lineup, boostedTagId = null) {
  const bonuses = new Map();
  for (const [tagId, tagDef] of Object.entries(PLAYSTYLE_TAGS)) {
    const holders = lineup.filter((p) => p.playstyleTags.includes(tagId));
    const effectiveCount = tagId === boostedTagId ? holders.length + 1 : holders.length;
    if (effectiveCount < 3) continue;
    const holdersInPosition = holders.filter((p) => tagDef.positions.includes(p.position));
    const value = tieredValue(effectiveCount, tagDef.tier3, tagDef.tier5);
    for (const p of holdersInPosition) {
      bonuses.set(p.id, (bonuses.get(p.id) ?? 0) + value);
    }
  }
  return bonuses;
}

export function countEffectiveContinentRequirement(baseCount, lineup, continentTag) {
  const hasPolyglotForThisContinent = lineup.some(
    (p) => p.specialTrait === 'polyglot' && p.continentTag === continentTag
  );
  if (!hasPolyglotForThisContinent) return baseCount;
  return Math.max(2, baseCount - 1);
}

export function computeContinentSynergyBonus(lineup) {
  const bonuses = new Map();
  for (const continentTag of Object.keys(CONTINENT_TAGS)) {
    const members = lineup.filter((p) => p.continentTag === continentTag);
    if (members.length === 0) continue;

    const tagDef = CONTINENT_TAGS[continentTag];
    const req3 = countEffectiveContinentRequirement(3, lineup, continentTag);
    const req5 = countEffectiveContinentRequirement(5, lineup, continentTag);

    let value = 0;
    if (members.length >= req5) value = tagDef.tier5;
    else if (members.length >= req3) value = tagDef.tier3;
    if (value === 0) continue;

    for (const p of members) {
      bonuses.set(p.id, (bonuses.get(p.id) ?? 0) + value);
    }
  }
  return bonuses;
}

export function computePlayerFinalOVR(player, lineup, bench, boostedTagId = null) {
  const selfBonus = computeSelfTraitBonus(player);
  const teamBonuses = computeTeamTraitBonuses(lineup, bench);
  const playstyleBonuses = computePlaystyleSynergyBonus(lineup, boostedTagId);
  const continentBonuses = computeContinentSynergyBonus(lineup);

  return (
    player.baseOVR +
    selfBonus +
    (teamBonuses.get(player.id) ?? 0) +
    (playstyleBonuses.get(player.id) ?? 0) +
    (continentBonuses.get(player.id) ?? 0)
  );
}
