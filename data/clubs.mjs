// 잉글랜드 축구 피라미드 고증: 리그 등급이 오를수록 구단 접미사가
// Rovers/Athletic/Town(하위) → County/Rangers/Albion(중위) → City/United/FC(상위)로
// 무게감이 실린다. 이름은 전부 가상 지명 조합이라 실존 구단과 겹치지 않는다.
// 강점/약점(archetype)은 스펙에서 검증된 4종 그대로다 - 이름만 바뀌어도 밸런스는
// 안 건드리는 게 목적이라 새 archetype을 만들지 않았다.
const ARCHETYPES = [
  { id: 'youth', startingFundsMultiplier: 0.8 },
  { id: 'money', startingFundsMultiplier: 1.5 },
  { id: 'defensive', startingFundsMultiplier: 1.0 },
  { id: 'attacking', startingFundsMultiplier: 1.0 },
];

// 이사진 요구치 = 시즌 목표선(안전/승격/우승)에 더해지는 가산점. 탑독은 기대가
// 높아 목표가 실제로 더 어려워지고, 언더독은 반대다. engine/league.mjs의
// 튜닝된 기준선(2000판 실측)은 그대로 두고 여기서 가감만 한다.
const EXPECTATION = {
  topdog: { modifier: 5, demand: '이사진의 요구: 이번 시즌 승격은 필수다' },
  neutral: { modifier: 0, demand: '이사진의 요구: 중위권 이상을 유지하라' },
  underdog: { modifier: -5, demand: '이사진의 요구: 강등만 피하면 충분하다' },
};

// 4개 archetype에 1개씩 - 예전엔 archetype당 2개(이름만 다른 "스킨")였는데,
// 어차피 강점/약점 문구까지 똑같아서 고르는 맛이 없었다. 하나씩만 남기고
// 그 대신 순위·요구치·문구를 전부 다르게 채워 8개가 아니라 4개를 "진짜 다르게" 만든다.
export const CLUBS = [
  {
    id: 'club-ashcombe-athletic', name: 'Ashcombe Athletic', kit: '#3f7d4f', archetype: 'youth',
    lastSeasonRank: 14, expectation: 'neutral',
    strength: '유스 아카데미 출신 성골 유망주 다수', weakness: '시작 자금이 빠듯하다',
  },
  {
    id: 'club-fenwick-rovers', name: 'Fenwick Rovers', kit: '#2f5f9e', archetype: 'money',
    lastSeasonRank: 3, expectation: 'topdog',
    strength: '구단주의 화끈한 투자, 레전더리급 1명 보유', weakness: '돈만큼 결과를 요구하는 이사진',
  },
  {
    id: 'club-hallowmere-rovers', name: 'Hallowmere Rovers', kit: '#6b4a5d', archetype: 'defensive',
    lastSeasonRank: 22, expectation: 'underdog',
    strength: '수비는 리그 최고 수준', weakness: '강등권 단골, 골 넣을 자원이 부족하다',
  },
  {
    id: 'club-silverdown-athletic', name: 'Silverdown Athletic', kit: '#b8452f', archetype: 'attacking',
    lastSeasonRank: 9, expectation: 'neutral',
    strength: '공격 자원이 풍부한 화끈한 축구', weakness: '뒷문이 늘 불안하다',
  },
].map((c) => {
  const archetype = ARCHETYPES.find((a) => a.id === c.archetype);
  const expectation = EXPECTATION[c.expectation];
  return {
    ...c,
    startingFundsMultiplier: archetype.startingFundsMultiplier,
    expectationModifier: expectation.modifier,
    demand: expectation.demand,
  };
});

// 지명 어간 20개를 모든 리그 등급에서 재사용한다 - 같은 구단이 승격하면서
// 격에 맞는 접미사로 갈아입는다는 설정("Marshgate Rovers"가 1부에 가면
// "Marshgate City"). 리그마다 다른 이름 100개를 손으로 채우는 대신, 접미사
// 무게감만 등급별로 갈아 끼워서 20개 x 5등급을 만든다.
const CLUB_STEMS = [
  ['Marshgate', '#4a7d5f'], ['Old Colliery', '#7d5f2f'], ['Hollowfen', '#2f6b7d'],
  ['Kingswell', '#7d2f4a'], ['Bramwell', '#5f7d2f'], ['Elderwick', '#2f4a7d'],
  ['Norwick', '#7d4a2f'], ['Longshaw', '#2f7d4a'], ['Oakenbury', '#6b2f7d'],
  ['Ironhurst', '#7d2f2f'], ['Priorswood', '#2f7d7d'], ['Blackthorn', '#4a2f7d'],
  ['Foxwell', '#2f5f9e'], ['Harrowgate', '#9e2f4a'], ['Kingsmere', '#9e6b2f'],
  ['Whitfell', '#2f9e6b'], ['Ravenscourt', '#4a2f9e'], ['Ashvale', '#2f9e2f'],
  ['Sterling', '#c9a227'], ['Northgate', '#1d3f8f'],
];

const SUFFIX_BY_TIER = {
  tier5: ['Rovers', 'Town', 'Athletic', 'Wanderers'],
  tier4: ['Rovers', 'Athletic', 'Town', 'Rangers'],
  tier3: ['County', 'Rangers', 'Town', 'Rovers'],
  tier2: ['City', 'Albion', 'United', 'County'],
  tier1: ['City', 'United', 'FC', 'Sovereign'],
};

function tierRoster(tierId) {
  const suffixes = SUFFIX_BY_TIER[tierId] ?? SUFFIX_BY_TIER.tier5;
  return CLUB_STEMS.map(([stem, kit], i) => ({
    id: `${tierId}-${stem.replace(/\s+/g, '-').toLowerCase()}`,
    name: `${stem} ${suffixes[i % suffixes.length]}`,
    kit,
  }));
}

// 승격 제안(이적 오퍼)용 풀. 실제로 그 리그에 있는 20개 구단 중 무작위로 count개를
// 뽑고, 상점 카피에 쓸 강점/약점·시작 자금 배율은 archetype을 순환 배정한다.
export function buildTierClubOffers(tierId, count) {
  const roster = tierRoster(tierId);
  const pool = [...roster];
  const picked = [];
  while (picked.length < count && pool.length) {
    const idx = Math.floor(Math.random() * pool.length);
    const club = pool.splice(idx, 1)[0];
    const archetype = ARCHETYPES[picked.length % ARCHETYPES.length];
    const flavor = CLUBS.find((c) => c.archetype === archetype.id);
    picked.push({
      ...club,
      startingFundsMultiplier: archetype.startingFundsMultiplier,
      strength: flavor.strength,
      weakness: flavor.weakness,
    });
  }
  return picked;
}

// 시뮬레이션 순위표용 - 내 구단이 뛰는 리그의 나머지 19개 구단 이름/킷만 필요하다.
export function buildLeagueRivals(tierId, count) {
  const pool = tierRoster(tierId);
  const picked = [];
  while (picked.length < count && pool.length) {
    picked.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return picked;
}
