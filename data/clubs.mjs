// 구단 DB: 리그마다 정확히 20팀 = 강팀 5 · 중위권 10 · 약팀 5 (각 리그 배열 순서가
// 강팀 → 중위권 → 약팀). 이름은 전부 가상 지명 조합이라 실존 구단과 겹치지 않고,
// 5개 리그 100개 이름이 모두 다르다. 리그 격이 오를수록 접미사가
// Rovers/Town/Athletic(하위) → County/Rangers(중위) → City/United/FC(상위)로 무거워진다.
//
// 유형(klass)은 힘의 구도라 고정이고, 구단마다 붙는 "색채"(COLORS)가 팀 개성을 만든다.
// 색채는 강점/약점 문구, 시작 자금 보정, 요구 카드/이벤트 추첨 편향을 정한다.

export const KLASS = {
  strong: { label: '강팀', expectation: 5, fundsMultiplier: 1.3, demand: '이사진의 요구: 이번 시즌 승격은 필수다' },
  mid: { label: '중위권', expectation: 0, fundsMultiplier: 1.0, demand: '이사진의 요구: 중위권 이상을 유지하라' },
  weak: { label: '약팀', expectation: -5, fundsMultiplier: 0.8, demand: '이사진의 요구: 강등만 피하면 충분하다' },
};

// demandBias: 요구 카드 태그(youth/age/spend/pace/stable) 가중치 배수
// eventBias: 시즌 이벤트 id 가중치 배수
export const COLORS = {
  youthDevelopment: {
    label: '유스 육성형', fundsMultiplier: 0.9,
    strength: '유스 아카데미 출신 성골 유망주 다수', weakness: '시작 자금이 빠듯하다',
    demandBias: { youth: 3, age: 2 }, eventBias: { youthGoldenGeneration: 3 },
  },
  richOwner: {
    label: '재벌 투자형', fundsMultiplier: 1.4,
    strength: '구단주의 화끈한 투자로 자금이 넉넉하다', weakness: '돈만큼 결과를 요구하는 이사진',
    demandBias: { pace: 3 }, eventBias: { mainSponsorship: 3, pressCriticism: 2 },
  },
  defensiveWall: {
    label: '수비 축구', fundsMultiplier: 1.0,
    strength: '수비는 리그 최고 수준', weakness: '골 넣을 자원이 부족하다',
    demandBias: { stable: 3 }, eventBias: { injuryAftermath: 2 },
  },
  attackingFlair: {
    label: '공격 축구', fundsMultiplier: 1.0,
    strength: '공격 자원이 풍부한 화끈한 축구', weakness: '뒷문이 늘 불안하다',
    demandBias: { pace: 2 }, eventBias: { pressPraise: 2 },
  },
  counterAttack: {
    label: '역습 전문', fundsMultiplier: 1.0,
    strength: '빠른 역습으로 강팀도 잡는다', weakness: '점유율 싸움에선 밀린다',
    demandBias: { age: 3 }, eventBias: { rivalPoach: 2 },
  },
  veteranCore: {
    label: '베테랑 중심', fundsMultiplier: 1.05,
    strength: '경험 많은 베테랑이 중심을 잡는다', weakness: '선수단이 늙었고 재계약 부담이 크다',
    demandBias: { stable: 2 }, eventBias: { retiringLegend: 3, rivalPoach: 2 },
  },
  overseasScouting: {
    label: '해외파 중심', fundsMultiplier: 1.1,
    strength: '해외 스카우트 라인이 탄탄하다', weakness: '적응이 늦어 조직력이 흔들리기 쉽다',
    demandBias: { spend: 2 }, eventBias: { pressCriticism: 2 },
  },
  localRoots: {
    label: '지역 밀착형', fundsMultiplier: 0.95,
    strength: '지역 팬의 열렬한 지지', weakness: '큰 투자를 못 한다',
    demandBias: { youth: 2, spend: 2 }, eventBias: { supportersFund: 3 },
  },
  financialTrouble: {
    label: '재정 위기형', fundsMultiplier: 0.75,
    strength: '잃을 것 없는 배짱 있는 팀', weakness: '재정 문제로 언제든 감사가 들어온다',
    demandBias: { spend: 3 }, eventBias: { ffpAudit: 3 },
  },
  risingForce: {
    label: '신흥 강호', fundsMultiplier: 1.2,
    strength: '최근 몇 시즌 급성장한 기세', weakness: '기대치가 빠르게 오르고 있다',
    demandBias: { pace: 2, age: 2 }, eventBias: { pressPraise: 2, rivalPoach: 2 },
  },
};

// [어간, 색채]. 배열 인덱스 0~4 강팀, 5~14 중위권, 15~19 약팀.
const ROSTERS = {
  tier5: {
    suffixes: ['Rovers', 'Town', 'Athletic', 'Wanderers'],
    rows: [
      ['Fenwick', 'richOwner'], ['Sterling', 'risingForce'], ['Northgate', 'attackingFlair'], ['Ravenscourt', 'overseasScouting'], ['Kingsmere', 'veteranCore'],
      ['Ashcombe', 'youthDevelopment'], ['Silverdown', 'attackingFlair'], ['Marshgate', 'localRoots'], ['Old Colliery', 'veteranCore'], ['Hollowfen', 'defensiveWall'],
      ['Kingswell', 'counterAttack'], ['Bramwell', 'youthDevelopment'], ['Elderwick', 'overseasScouting'], ['Norwick', 'localRoots'], ['Longshaw', 'risingForce'],
      ['Oakenbury', 'defensiveWall'], ['Priorswood', 'counterAttack'], ['Hallowmere', 'defensiveWall'], ['Blackthorn', 'financialTrouble'], ['Harrowgate', 'financialTrouble'],
    ],
  },
  tier4: {
    suffixes: ['Rovers', 'Athletic', 'Town', 'Rangers'],
    rows: [
      ['Wexcombe', 'richOwner'], ['Tarnbrook', 'risingForce'], ['Highmoor', 'attackingFlair'], ['Coldharbour', 'overseasScouting'], ['Stanmere', 'veteranCore'],
      ['Yarrowby', 'youthDevelopment'], ['Pendlefold', 'localRoots'], ['Redcliffe', 'counterAttack'], ['Thornbury', 'defensiveWall'], ['Lowfield', 'attackingFlair'],
      ['Grimsdale', 'veteranCore'], ['Westerleigh', 'overseasScouting'], ['Cranfell', 'youthDevelopment'], ['Ombersley', 'risingForce'], ['Sedgemoor', 'localRoots'],
      ['Dunmarsh', 'defensiveWall'], ['Bexhill Heath', 'counterAttack'], ['Askrigg', 'youthDevelopment'], ['Wetherby Vale', 'counterAttack'], ['Saltmarsh', 'localRoots'],
    ],
  },
  tier3: {
    suffixes: ['County', 'Rangers', 'Town', 'Rovers'],
    rows: [
      ['Halstead', 'richOwner'], ['Brackenridge', 'risingForce'], ['Kestrel Vale', 'attackingFlair'], ['Ludlow Cross', 'overseasScouting'], ['Ravensworth', 'veteranCore'],
      ['Greystones', 'defensiveWall'], ['Ambleside', 'localRoots'], ['Fairhaven', 'youthDevelopment'], ['Stoneleigh', 'counterAttack'], ['Kingsbarns', 'attackingFlair'],
      ['Millbrook', 'veteranCore'], ['Ashdown', 'overseasScouting'], ['Castleford Moor', 'defensiveWall'], ['Marlowe', 'risingForce'], ['Swinbrook', 'youthDevelopment'],
      ['Eastwater', 'localRoots'], ['Dalby', 'counterAttack'], ['Harlow Green', 'youthDevelopment'], ['Nettlebed', 'financialTrouble'], ['Cobbold', 'defensiveWall'],
    ],
  },
  tier2: {
    suffixes: ['City', 'Albion', 'United', 'County'],
    rows: [
      ['Aldermoor', 'richOwner'], ['Braxton', 'risingForce'], ['Corbridge', 'attackingFlair'], ['Devonshire Cross', 'overseasScouting'], ['Eastbrook', 'veteranCore'],
      ['Fallowfield', 'youthDevelopment'], ['Glenmore', 'defensiveWall'], ['Holbrook', 'localRoots'], ['Ingleby', 'counterAttack'], ['Jarrow Vale', 'attackingFlair'],
      ['Kilburn', 'veteranCore'], ['Lancing', 'overseasScouting'], ['Morpeth', 'defensiveWall'], ['Newhaven Rise', 'risingForce'], ['Oldcastle', 'youthDevelopment'],
      ['Penrose', 'counterAttack'], ['Quarrydale', 'localRoots'], ['Rockingham', 'financialTrouble'], ['Selworth', 'counterAttack'], ['Tewkes', 'financialTrouble'],
    ],
  },
  tier1: {
    suffixes: ['City', 'United', 'FC', 'Sovereign'],
    rows: [
      ['Ashmoor', 'richOwner'], ['Belgrave', 'risingForce'], ['Crestwood', 'attackingFlair'], ['Dunstan', 'overseasScouting'], ['Evermere', 'veteranCore'],
      ['Foxbourne', 'youthDevelopment'], ['Garrick', 'defensiveWall'], ['Hartsfield', 'attackingFlair'], ['Ivybridge', 'localRoots'], ['Kensworth', 'counterAttack'],
      ['Lyndhurst', 'veteranCore'], ['Merrivale', 'overseasScouting'], ['Northcote', 'defensiveWall'], ['Oakhampton', 'risingForce'], ['Pemberton', 'youthDevelopment'],
      ['Ravenhill', 'counterAttack'], ['Stourhead', 'localRoots'], ['Thornfield', 'defensiveWall'], ['Underhill', 'financialTrouble'], ['Wyvernshire', 'youthDevelopment'],
    ],
  },
};

const KLASS_BY_INDEX = (i) => (i < 5 ? 'strong' : i < 15 ? 'mid' : 'weak');

// 구단마다 다른 킷 색(리그·순번으로 색상환을 고르게 나눈다)
function kitFor(tierIdx, i) {
  const hue = (tierIdx * 47 + i * 18) % 360;
  return hslToHex(hue, 42, 38);
}
function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return `#${[f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

// 원본 구단에 유형/색채에서 파생되는 게임 값을 붙인다.
// 시작 자금 배율 = 유형 배율 × 색채 배율, 기대치 = 유형 기대치.
export function deriveClub(club) {
  const klass = KLASS[club.klass];
  const color = COLORS[club.color];
  return {
    ...club,
    startingFundsMultiplier: Math.round(klass.fundsMultiplier * color.fundsMultiplier * 100) / 100,
    expectationModifier: klass.expectation,
    demand: klass.demand,
    strength: color.strength,
    weakness: color.weakness,
    klassLabel: klass.label,
    colorLabel: color.label,
    demandBias: color.demandBias,
    eventBias: color.eventBias,
  };
}

export const CLUB_ROSTER = Object.fromEntries(
  Object.entries(ROSTERS).map(([tierId, { suffixes, rows }], tierIdx) => [
    tierId,
    rows.map(([stem, color], i) => ({
      id: `${tierId}-${stem.replace(/\s+/g, '-').toLowerCase()}`,
      name: `${stem} ${suffixes[i % suffixes.length]}`,
      kit: kitFor(tierIdx, i),
      tierId,
      klass: KLASS_BY_INDEX(i),
      color,
    })),
  ])
);

function randomOf(list, rng) {
  return list.splice(Math.floor(rng() * list.length), 1)[0];
}

// 강팀·중위권·약팀에서 1개씩 무작위로 뽑는다(+ extra개는 남은 구단에서 아무나).
function pickByKlass(tierId, extra, rng) {
  const roster = [...CLUB_ROSTER[tierId]];
  const picks = ['strong', 'mid', 'weak'].map((k) => {
    const pool = roster.filter((c) => c.klass === k);
    const club = pool[Math.floor(rng() * pool.length)];
    roster.splice(roster.indexOf(club), 1);
    return club;
  });
  for (let n = 0; n < extra; n++) picks.push(randomOf(roster, rng));
  return picks.map(deriveClub);
}

// 시작 화면: 5부 구단 4개(강·중·약 각 1 + 무작위 1). 런마다 구단이 달라진다.
export function buildStartClubOffers(rng = Math.random) {
  return pickByKlass('tier5', 1, rng).map((c) => ({ ...c, lastSeasonRank: 1 + Math.floor(rng() * 20) }));
}

// 승격 오퍼(이적): 그 리그에서 강·중·약 각 1개. count가 3이 아니면 그만큼 앞에서 자른다.
export function buildTierClubOffers(tierId, count = 3, rng = Math.random) {
  return pickByKlass(tierId, Math.max(0, count - 3), rng).slice(0, count);
}

// 시뮬레이션 순위표용 - 내 구단이 뛰는 리그의 구단 이름/킷만 필요하다.
export function buildLeagueRivals(tierId, count, rng = Math.random) {
  const pool = [...CLUB_ROSTER[tierId]];
  const picked = [];
  while (picked.length < count && pool.length) picked.push(randomOf(pool, rng));
  return picked;
}
