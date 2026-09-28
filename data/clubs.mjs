// 잉글랜드 축구 피라미드 고증: 리그 등급이 오를수록 구단 접미사가
// Rovers/Athletic/Town(하위) → County/Rangers/Albion(중위) → City/United/FC(상위)로
// 무게감이 실린다. 이름은 전부 가상 지명 조합이라 실존 구단과 겹치지 않는다.
// 강점/약점(archetype)은 스펙에서 검증된 4종 그대로다 - 이름만 바뀌어도 밸런스는
// 안 건드리는 게 목적이라 새 archetype을 만들지 않았다.
const ARCHETYPES = [
  {
    id: 'youth',
    strength: '시작 선수단에 성골 유스 다수',
    weakness: '시작 자금 적음',
    startingFundsMultiplier: 0.8,
  },
  {
    id: 'money',
    strength: '시작 자금 많음, 레전더리급 1명 보유',
    weakness: '이적 오퍼 성과 기대치 큼',
    startingFundsMultiplier: 1.5,
  },
  {
    id: 'defensive',
    strength: '수비형 플레이스타일 편중, 적응도 시작 높음',
    weakness: '공격 태그 카드 등장률 낮음',
    startingFundsMultiplier: 1.0,
  },
  {
    id: 'attacking',
    strength: '공격형 플레이스타일 편중',
    weakness: '수비 포지션 OVR 낮음',
    startingFundsMultiplier: 1.0,
  },
];

function makeClub(id, name, kit, archetypeId) {
  const archetype = ARCHETYPES.find((a) => a.id === archetypeId);
  return {
    id,
    name,
    kit,
    strength: archetype.strength,
    weakness: archetype.weakness,
    startingFundsMultiplier: archetype.startingFundsMultiplier,
  };
}

// 5부 시작 선택지. archetype당 2개씩 - 밸런스는 같고 이름/킷만 다른 "스킨"이라
// 고르는 맛은 늘지만 검증된 수치는 그대로 유지된다.
export const CLUBS = [
  makeClub('club-ashcombe-athletic', 'Ashcombe Athletic', '#3f7d4f', 'youth'),
  makeClub('club-thorncastle-town', 'Thorncastle Town', '#2f7d6b', 'youth'),
  makeClub('club-fenwick-rovers', 'Fenwick Rovers', '#2f5f9e', 'money'),
  makeClub('club-redmoor-wanderers', 'Redmoor Wanderers', '#4a5f9e', 'money'),
  makeClub('club-marchwood-town', 'Marchwood Town', '#5d4a7a', 'defensive'),
  makeClub('club-hallowmere-rovers', 'Hallowmere Rovers', '#6b4a5d', 'defensive'),
  makeClub('club-silverdown-athletic', 'Silverdown Athletic', '#b8452f', 'attacking'),
  makeClub('club-draycott-wanderers', 'Draycott Wanderers', '#b8722f', 'attacking'),
];

// 승격 제안(이적 오퍼)용 풀. 리그 등급이 오를수록 접미사 무게감이 실린다.
// 각 클럽에 archetype을 순환 배정해 상점/이적 카피에 강점·약점을 계속 보여줄 수 있게 한다.
const TIER_CLUB_NAMES = {
  tier4: [
    ['Marshgate Rovers', '#4a7d5f'],
    ['Old Colliery Athletic', '#7d5f2f'],
    ['Hollowfen Town', '#2f6b7d'],
    ['Kingswell Rovers', '#7d2f4a'],
    ['Bramwell Athletic', '#5f7d2f'],
    ['Elderwick Wanderers', '#2f4a7d'],
  ],
  tier3: [
    ['Norwick County', '#7d4a2f'],
    ['Longshaw Rangers', '#2f7d4a'],
    ['Oakenbury Town', '#6b2f7d'],
    ['Ironhurst Rangers', '#7d2f2f'],
    ['Priorswood County', '#2f7d7d'],
    ['Blackthorn Rangers', '#4a2f7d'],
  ],
  tier2: [
    ['Foxwell City', '#2f5f9e'],
    ['Harrowgate United', '#9e2f4a'],
    ['Kingsmere Albion', '#9e6b2f'],
    ['Whitfell City', '#2f9e6b'],
    ['Ravenscourt United', '#4a2f9e'],
    ['Ashvale Albion', '#2f9e2f'],
  ],
  tier1: [
    ['Sterling City', '#c9a227'],
    ['Northgate United', '#1d3f8f'],
    ['Meridian City', '#0f8f6b'],
    ['Vantage United', '#8f1d3f'],
    ['Sovereign FC', '#3f1d8f'],
    ['Crown Athletic', '#8f5f1d'],
  ],
};

export function buildTierClubOffers(tierId, count) {
  const names = TIER_CLUB_NAMES[tierId] ?? [];
  const pool = [...names];
  const picked = [];
  while (picked.length < count && pool.length) {
    const idx = Math.floor(Math.random() * pool.length);
    const [name, kit] = pool.splice(idx, 1)[0];
    const archetype = ARCHETYPES[picked.length % ARCHETYPES.length];
    picked.push(makeClub(`offer-${tierId}-${name.replace(/\s+/g, '-').toLowerCase()}`, name, kit, archetype.id));
  }
  return picked;
}
