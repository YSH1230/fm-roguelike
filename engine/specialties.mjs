// 감독 특기. 플레이어가 곧 감독이다 - 정식 임명 때 첫 특기를 고르고, 승격할 때마다 하나씩 더 고른다(최대 5개).
// 같은 특기를 다시 고르면 Lv2로 강화된다. 모티브는 실제 감독 스타일이지만 게임 안에서는 별명만 쓴다.
// 효과는 specialtyEffects()가 한 객체(fx)로 합쳐서 엔진 계산 곳곳에 넘긴다.
export const MAX_SPECIALTIES = 5;

// kind: 'tag'(그 태그가 있어야 힘이 남) / 'always'(바로 체감). early: 첫 특기 후보에 들어가는지.
export const SPECIALTIES = {
  pressing:      { name: '압박의 전도사', kind: 'tag', tag: 'press', early: false, blurb: '전방 압박 태그 선수가 더 강해져요', lv: ['전방 압박 태그 선수 OVR +2', '전방 압박 태그 선수 OVR +3'], effects: [{ tagBonus: { press: 2 } }, { tagBonus: { press: 3 } }] },
  possession:    { name: '점유의 철학자', kind: 'tag', tag: 'pass', early: false, blurb: '패스 플레이 태그 선수가 더 강해져요', lv: ['패스 플레이 태그 선수 OVR +2', '패스 플레이 태그 선수 OVR +3'], effects: [{ tagBonus: { pass: 2 } }, { tagBonus: { pass: 3 } }] },
  counter:       { name: '역습의 마술사', kind: 'tag', tag: 'counter', early: false, blurb: '역습 태그 선수가 더 강해져요', lv: ['역습 태그 선수 OVR +2', '역습 태그 선수 OVR +3'], effects: [{ tagBonus: { counter: 2 } }, { tagBonus: { counter: 3 } }] },
  buildup:       { name: '빌드업 설계자', kind: 'tag', tag: 'buildup', early: false, blurb: '후방 빌드업 태그 선수가 더 강해져요', lv: ['후방 빌드업 태그 선수 OVR +2', '후방 빌드업 태그 선수 OVR +3'], effects: [{ tagBonus: { buildup: 2 } }, { tagBonus: { buildup: 3 } }] },
  romantic:      { name: '낭만 공격수', kind: 'tag', tag: 'dribble', early: false, blurb: '돌파 태그 선수가 더 강해져요', lv: ['돌파 태그 선수 OVR +2', '돌파 태그 선수 OVR +3'], effects: [{ tagBonus: { dribble: 2 } }, { tagBonus: { dribble: 3 } }] },
  pragmatic:     { name: '실용 피지컬 감독', kind: 'tag', tag: 'physical', early: false, blurb: '몸싸움 태그 선수가 더 강해져요', lv: ['몸싸움 태그 선수 OVR +2', '몸싸움 태그 선수 OVR +3'], effects: [{ tagBonus: { physical: 2 } }, { tagBonus: { physical: 3 } }] },
  totalFootball: { name: '토탈 축구 설계자', kind: 'always', early: true, blurb: '포메이션 궁합이 커져요', lv: ['포메이션 궁합 +3 더(합계 +4)', '포메이션 궁합 +4 더(합계 +5)'], effects: [{ formationBonus: 3 }, { formationBonus: 4 }] },
  hairdryer:     { name: '헤어드라이어', kind: 'always', early: true, blurb: '시즌과 겨울이 시작될 때 선수단이 단단해져요', lv: ['여름·겨울 시작 조직력 +4', '여름·겨울 시작 조직력 +6'], effects: [{ startChemistry: 4 }, { startChemistry: 6 }] },
  youngTalent:   { name: '젊은 피 조련사', kind: 'always', early: true, blurb: '유망주를 싸게 사서 비싸게 팔아요', lv: ['성장 초반 선수 영입가 −10%, 팔 때 오퍼 +5%', '성장 초반 선수 영입가 −15%, 팔 때 오퍼 +10%'], effects: [{ growthBuyDiscount: 0.10, growthSaleBonus: 0.05 }, { growthBuyDiscount: 0.15, growthSaleBonus: 0.10 }] },
  catenaccio:    { name: '철벽 수비', kind: 'always', early: true, blurb: '수비 라인이 더 단단해져요', lv: ['골키퍼·수비수·수비형 미드필더 선발 OVR +1', '골키퍼·수비수·수비형 미드필더 선발 OVR +2'], effects: [{ defenseLine: 1 }, { defenseLine: 2 }] },
  lateSurge:     { name: '후반기 강자', kind: 'always', early: true, blurb: '후반기에 승점을 더 따와요', lv: ['후반기 승점 +2', '후반기 승점 +3'], effects: [{ secondHalfPoints: 2 }, { secondHalfPoints: 3 }] },
  marketMaster:  { name: '시장의 달인', kind: 'always', early: true, blurb: '이적시장에서 더 싸게 사요', lv: ['영입가 −7%, 시장 마감 압박 2배', '영입가 −12%, 마감 압박 2배, 협상 인내심 +1'], effects: [{ buyDiscount: 0.07, pressureMult: 2 }, { buyDiscount: 0.12, pressureMult: 2, patienceBonus: 1 }] },
  starHandler:   { name: '스타 군단 관리자', kind: 'tag', early: false, blurb: '월드클래스 선수의 개인 특기가 더 강해져요', lv: ['개인 특기 선수 특기 +1 더', '개인 특기 선수 특기 +2 더'], effects: [{ flairBonus: 1 }, { flairBonus: 2 }] },
  dataAnalyst:   { name: '데이터 분석가', kind: 'always', early: true, blurb: '잠재력 등급을 더 정확히 봐요', lv: ['잠재력 등급 오차 40% 감소', '잠재력 등급 오차 70% 감소'], effects: [{ gradeNoiseMult: 0.6 }, { gradeNoiseMult: 0.3 }] },
  clubFather:    { name: '구단의 아버지', kind: 'always', early: false, blurb: '한 구단에 오래 있을수록 단단해져요', lv: ['시즌 시작 조직력 +2 × 이 구단 시즌 수(최대 +6)', '시즌 시작 조직력 +2 × 이 구단 시즌 수(최대 +9)'], effects: [{ tenureChem: 2, tenureCap: 6 }, { tenureChem: 2, tenureCap: 9 }] },
  underdog:      { name: '언더독의 기적', kind: 'always', early: false, blurb: '승격한 첫 시즌에 기적을 일으켜요', lv: ['승격한 첫 시즌, 반기마다 승점 +2', '승격한 첫 시즌, 반기마다 승점 +3'], effects: [{ promotedPointsPerHalf: 2 }, { promotedPointsPerHalf: 3 }] },
};
export const SPECIALTY_IDS = Object.keys(SPECIALTIES);

// owned = [{ id, level }]
export const specialtyLevel = (owned, id) => owned?.find((s) => s.id === id)?.level ?? 0;

// 선택 카드 3장: 아직 없는 특기(Lv1)와 이미 가진 Lv1 특기의 강화(Lv2). 5개를 채웠으면 강화만 나온다.
// firstPick이면 초반부터 체감되는 특기만 나온다.
export function drawSpecialtyChoices(owned, rng = Math.random, { firstPick = false, count = 3 } = {}) {
  const full = (owned?.length ?? 0) >= MAX_SPECIALTIES;
  const cands = [];
  for (const id of SPECIALTY_IDS) {
    const lv = specialtyLevel(owned, id);
    if (firstPick && !SPECIALTIES[id].early) continue;
    if (lv === 0 && !full) cands.push({ id, level: 1, upgrade: false });
    else if (lv === 1) cands.push({ id, level: 2, upgrade: true });
  }
  for (let i = cands.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cands[i], cands[j]] = [cands[j], cands[i]]; }
  return cands.slice(0, count);
}

export function pickSpecialty(owned, id) {
  const lv = specialtyLevel(owned, id);
  if (lv >= 2 || !SPECIALTIES[id]) return owned ?? [];
  if (lv === 0) return [...(owned ?? []), { id, level: 1 }];
  return owned.map((s) => (s.id === id ? { ...s, level: 2 } : s));
}

// 가진 특기 전부를 한 객체로 합친다. 엔진은 이 fx만 본다.
export const NO_EFFECTS = Object.freeze({
  tagBonus: {}, formationBonus: 0, defenseLine: 0, flairBonus: 0, startChemistry: 0, tenureChem: 0, tenureCap: 0,
  secondHalfPoints: 0, promotedPointsPerHalf: 0, buyDiscount: 0, growthBuyDiscount: 0, growthSaleBonus: 0,
  pressureMult: 1, patienceBonus: 0, gradeNoiseMult: 1,
});
export function specialtyEffects(owned) {
  const fx = { ...NO_EFFECTS, tagBonus: {} };
  for (const s of owned ?? []) {
    const e = SPECIALTIES[s.id]?.effects?.[s.level - 1];
    if (!e) continue;
    for (const [k, v] of Object.entries(e)) {
      if (k === 'tagBonus') for (const [t, n] of Object.entries(v)) fx.tagBonus[t] = (fx.tagBonus[t] ?? 0) + n;
      else if (k === 'gradeNoiseMult') fx.gradeNoiseMult = Math.min(fx.gradeNoiseMult, v);
      else if (k === 'pressureMult' || k === 'tenureCap') fx[k] = Math.max(fx[k], v);
      else fx[k] = (fx[k] ?? 0) + v;
    }
  }
  return fx;
}

// 구단의 아버지: 이 구단에서 보낸 시즌 수(첫 시즌 1)에 비례해 시즌 시작 조직력이 올라 상한까지 간다.
export const tenureChemistry = (fx, seasonsAtClub) => (fx.tenureChem ? Math.min(fx.tenureCap, fx.tenureChem * Math.max(0, seasonsAtClub)) : 0);
