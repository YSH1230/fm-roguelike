// v3: 부상 4단계. 잔부상·중간 부상은 반기 시뮬 중 발생해 승점만 깎고, 반기 아웃·시즌 아웃은 시장 중간에 알림이 와서 대응할 수 있다.
export const INJURY_KINDS = ['minor', 'mid', 'half', 'season'];
export const INJURY_BASE = { minor: 0.14, mid: 0.06, half: 0.03, season: 0.01 }; // 보통 내구성의 반기당 확률
export const INJURY_LABELS = { minor: '잔부상', mid: '중간 부상', half: '반기 아웃', season: '시즌 아웃' };
export const INJURY_POINTS = { minor: 0.2, mid: 0.6 }; // 선발일 때 깎이는 승점
export const DURABILITY_MULT = { iron: 0.4, normal: 1, fragile: 2 };

// 부상 부위(표시용: 승점·기간에 영향 없음). [키, 표시 이름, 계열, 기본 가중]
export const INJURY_PARTS = {
  season: [
    ['acl', '십자인대 파열', 'ligament', 28], ['achilles', '아킬레스건 파열', 'tendon', 14], ['tibia', '정강이뼈 골절', 'bone', 14],
    ['meniscus', '무릎 연골 손상', 'joint', 14], ['femur', '넓적다리뼈 골절', 'bone', 4], ['ankleFull', '발목 인대 파열', 'ligament', 10],
    ['hamFull', '햄스트링 완전 파열', 'muscle', 8], ['shoulderSurg', '어깨 관절 수술', 'joint', 8],
  ],
  half: [
    ['ham', '햄스트링 파열', 'muscle', 22], ['metatarsal', '중족골 골절', 'bone', 12], ['mcl', '내측인대 손상', 'ligament', 14],
    ['shoulderDis', '어깨 탈구', 'joint', 8], ['ankle', '발목 인대 손상', 'ligament', 12], ['calf', '종아리 근육 파열', 'muscle', 9],
    ['groin', '사타구니 근육 파열', 'muscle', 8], ['rib', '갈비뼈 골절', 'bone', 5], ['clavicle', '쇄골 골절', 'bone', 4],
    ['finger', '손가락 골절', 'bone', 3], ['wrist', '손목 골절', 'bone', 2],
  ],
};
export const INJURY_PART_NAME = Object.fromEntries(Object.values(INJURY_PARTS).flat().map(([k, n]) => [k, n]));
// 포지션별 개연성(가중치 배수, 표에 없으면 ×1)
const POS_PART_MULT = {
  GK: { finger: 6, wrist: 4, shoulderDis: 2.5, shoulderSurg: 3, ham: 0.4, hamFull: 0.4, groin: 0.3, calf: 0.3, achilles: 0.5, acl: 0.6 },
  CB: { tibia: 1.4, rib: 1.5, clavicle: 1.3, shoulderDis: 1.2 },
  DMF: { tibia: 1.4, rib: 1.5, clavicle: 1.3, shoulderDis: 1.2 },
  W: { ham: 1.5, hamFull: 1.5, ankle: 1.3, ankleFull: 1.3, groin: 1.3, achilles: 1.2, metatarsal: 1.2 },
  WB: { ham: 1.5, hamFull: 1.5, ankle: 1.3, ankleFull: 1.3, groin: 1.3, achilles: 1.2, metatarsal: 1.2 },
  ST: { ham: 1.5, hamFull: 1.5, ankle: 1.3, ankleFull: 1.3, groin: 1.3, achilles: 1.2, metatarsal: 1.2 },
  CMF: { meniscus: 1.1, groin: 1.1 },
  AMF: { meniscus: 1.1, groin: 1.1 },
};
const GROUP_DUR_MULT = {
  iron: { bone: 1.4, joint: 1.2, ligament: 0.9, muscle: 0.6, tendon: 0.6 },
  fragile: { muscle: 1.25, tendon: 1.25, ligament: 1.25, bone: 0.8 },
};
const GROUP_AGE_MULT = [
  [(a) => a >= 34, { muscle: 1.5, tendon: 1.5, bone: 0.8 }],
  [(a) => a <= 22, { bone: 1.2, tendon: 0.7 }],
];
// 부상이 났을 때 어느 부위인가: 가중치 비례 추첨. 전체 부상 확률(injuryMult)과는 별개다.
export function rollInjuryPart(p, kind, rng = Math.random) {
  const table = INJURY_PARTS[kind];
  if (!table) return null;
  const weights = table.map(([key, , group, base]) => {
    let w = base * (POS_PART_MULT[p.position]?.[key] ?? 1) * (GROUP_DUR_MULT[p.durability]?.[group] ?? 1);
    for (const [on, m] of GROUP_AGE_MULT) if (on(p.age ?? 0)) w *= m[group] ?? 1;
    return w;
  });
  let r = rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < table.length; i++) { r -= weights[i]; if (r < 0) return table[i][0]; }
  return table[table.length - 1][0];
}

export const injuryMult = (p) => (DURABILITY_MULT[p.durability] ?? 1) * ((p.age ?? 0) >= 34 ? 1.3 : 1);

// 한 번 굴려서 kinds 중 하나(또는 없음)
export function rollInjury(p, rng = Math.random, kinds = INJURY_KINDS, scale = 1) {
  const m = injuryMult(p) * scale;
  let r = rng();
  for (const k of kinds) {
    const pr = Math.min(0.9, INJURY_BASE[k] * m);
    if (r < pr) return k;
    r -= pr;
  }
  return null;
}

// 새로 만든 선수의 지난 시즌 이력(두 반기를 굴린다) - 영입 전에도 힌트가 된다. 중간 부상은 이력에 남기지 않고, 시즌·반기 아웃은 부위도 정한다.
export function sampleInjuryHistory(p, rng = Math.random) {
  const out = [];
  for (let h = 0; h < 2; h++) {
    const k = rollInjury(p, rng, ['season', 'half', 'minor']);
    if (k) out.push(k === 'minor' ? { kind: k, ago: 1 } : { kind: k, ago: 1, part: rollInjuryPart(p, k, rng) });
  }
  return out;
}

// 화면에 보이는 이력 칩. 심한 것부터(시즌 아웃 → 반기 아웃 → 잔부상 많음) 최대 2개, 중간 부상은 제외.
// collapsed = 접힌 칩(부위 없음), expanded = 펼친 줄(부위 포함, 부위 없는 옛 세이브는 접힌 문구 그대로). 정확도·등급과 무관한 사실이다.
export function injuryChips(p) {
  const hist = (p.injHistory ?? []).filter((h) => h.ago <= 1);
  const when = (h) => (h.ago === 0 ? '이번 시즌' : '지난 시즌');
  const collapsed = [];
  const expanded = [];
  for (const k of ['season', 'half']) {
    const h = hist.find((x) => x.kind === k);
    if (!h) continue;
    const text = `${when(h)} ${INJURY_LABELS[k]}`;
    collapsed.push(text);
    expanded.push(INJURY_PART_NAME[h.part] ?? text);
  }
  if (hist.filter((h) => h.kind === 'minor').length >= 2) { collapsed.push('잔부상 많음'); expanded.push('잔부상 많음'); }
  if (!collapsed.length) return { collapsed: ['이력 없음'], expanded: ['이력 없음'] };
  return { collapsed: collapsed.slice(0, 2), expanded: expanded.slice(0, 2) };
}
