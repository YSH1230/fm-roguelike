// 감독의 성향은 두 겹이다.
//  1) 전술 철학(영구): 정식 임명 때 하나를 고르고, 승격할 때마다(최대 4번) 한 단계씩 강해진다(Lv1 → Lv5).
//  2) 라커룸 토크(시즌 단위): 시즌을 시작할 때와 마칠 때 라커룸 장면에서 3장 중 하나를 고른다. 고르고 나서야
//     선수들의 반응(장점과 단점)이 정해진다. 같은 토크도 반응이 매번 달라서 외워 둔 정답이 없다. 누적되지 않는다.
// 모티브는 실제 감독 스타일이지만 게임 안에서는 별명만 쓴다. 효과는 engine 계산 곳곳에 fx 객체 하나로 넘긴다.
export const MAX_PHILOSOPHY_LEVEL = 5;

// ---------- 전술 철학 ----------
// kind: 'tag'(그 태그 선수가 3명 이상 있어야 힘이 남) / 'always'. levels = 단계별 효과(Lv1~Lv5).
// 수치는 "승점 환산"으로 맞췄다: Lv1 약 1.5점 → Lv5 약 4.5점(선발 평균 OVR 1점 ≈ 승점 2.5점, tools/balance 분석 참고).
const tagLevels = (tag) => [2, 2.5, 3, 4, 5].map((v) => ({ tagBonus: { [tag]: v } }));
export const PHILOSOPHIES = {
  pressing:      { name: '압박의 전도사', kind: 'tag', tag: 'press', blurb: '전방 압박 태그 선수가 더 강해져요', line: '"공을 뺏는 순간이 가장 빠른 공격이다."', levels: tagLevels('press') },
  possession:    { name: '점유의 철학자', kind: 'tag', tag: 'pass', blurb: '패스 플레이 태그 선수가 더 강해져요', line: '"공을 가진 쪽이 경기를 지배한다."', levels: tagLevels('pass') },
  counter:       { name: '역습의 마술사', kind: 'tag', tag: 'counter', blurb: '역습 태그 선수가 더 강해져요', line: '"기다렸다가, 한 번에 찌른다."', levels: tagLevels('counter') },
  buildup:       { name: '빌드업 설계자', kind: 'tag', tag: 'buildup', blurb: '후방 빌드업 태그 선수가 더 강해져요', line: '"공격은 골키퍼부터 시작한다."', levels: tagLevels('buildup') },
  romantic:      { name: '낭만 공격수', kind: 'tag', tag: 'dribble', blurb: '돌파 태그 선수가 더 강해져요', line: '"지더라도 화끈하게 가자."', levels: tagLevels('dribble') },
  pragmatic:     { name: '실용 피지컬 감독', kind: 'tag', tag: 'physical', blurb: '몸싸움 태그 선수가 더 강해져요', line: '"축구는 결국 힘과 투지다."', levels: tagLevels('physical') },
  totalFootball: { name: '토탈 축구 설계자', kind: 'always', blurb: '포메이션 궁합이 커져요', line: '"모두가 공격하고 모두가 수비한다."', levels: [2, 3, 4, 5, 6].map((v) => ({ formationBonus: v })) },
  catenaccio:    { name: '철벽 수비', kind: 'always', blurb: '수비 라인이 더 단단해져요', line: '"무실점이 곧 승점이다."', levels: [1, 1.5, 2, 2.5, 3].map((v) => ({ defenseLine: v })) },
};
export const PHILOSOPHY_IDS = Object.keys(PHILOSOPHIES);
export const philosophyText = (id, level) => {
  const p = PHILOSOPHIES[id]; const e = p.levels[level - 1];
  if (e.tagBonus) return `${TAG_NAME[p.tag]} 태그 선수 OVR +${e.tagBonus[p.tag]}`;
  if (e.formationBonus) return `포메이션 궁합 +${e.formationBonus} 더(합계 +${e.formationBonus + 1})`;
  return `골키퍼·수비수·수비형 미드필더 선발 OVR +${e.defenseLine}`;
};
const TAG_NAME = { press: '전방 압박', pass: '패스 플레이', counter: '역습', buildup: '후방 빌드업', dribble: '돌파', physical: '몸싸움' };

// 철학 3택1(정식 임명). owned는 이미 고른 철학이 없을 때만 부른다.
export function drawPhilosophyChoices(rng = Math.random, count = 3) {
  const ids = [...PHILOSOPHY_IDS];
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  return ids.slice(0, count);
}
// philosophy = { id, level } | null
// 승격 때 철학을 바꾸면 새 철학은 max(1, 현재 Lv − 2)로 시작한다.
export const switchPhilosophy = (ph, newId) => ({ id: newId, level: Math.max(1, (ph?.level ?? 1) - 2) });
export const levelUpPhilosophy = (ph) => (ph && ph.level < MAX_PHILOSOPHY_LEVEL ? { ...ph, level: ph.level + 1 } : ph);

// 라커룸 토크는 삭제했다(게임이 느슨해진다는 사용자 판단). 토크가 만들던 효과 필드는 NO_EFFECTS의 중립 기본값으로만 남는다.

// ---------- 효과 합치기 ----------
export const NO_EFFECTS = Object.freeze({
  tagBonus: {}, formationBonus: 0, defenseLine: 0, flairBonus: 0,
  txDecayMult: 1, buyDiscount: 0, saleMult: 1, pointsFirst: 0, pointsSecond: 0, patienceBonus: 0, gradeNoiseMult: 1, recoveryDelta: 0, growthBoost: 0,
  // 예전 호출부 호환(철학으로 바뀌며 쓰이지 않는 값)
  startChemistry: 0, tenureChem: 0, tenureCap: 0, secondHalfPoints: 0, promotedPointsPerHalf: 0, growthBuyDiscount: 0, growthSaleBonus: 0, pressureMult: 1,
});
// philosophy = { id, level } | null
export function specialtyEffects(philosophy) {
  const fx = { ...NO_EFFECTS, tagBonus: {} };
  const e = philosophy ? PHILOSOPHIES[philosophy.id]?.levels?.[philosophy.level - 1] : null;
  if (e) {
    if (e.tagBonus) for (const [t, n] of Object.entries(e.tagBonus)) fx.tagBonus[t] = (fx.tagBonus[t] ?? 0) + n;
    if (e.formationBonus) fx.formationBonus += e.formationBonus;
    if (e.defenseLine) fx.defenseLine += e.defenseLine;
  }
  fx.secondHalfPoints = fx.pointsSecond; // 호환
  return fx;
}
