// v3: 부상 4단계. 잔부상·중간 부상은 반기 시뮬 중 발생해 승점만 깎고, 반기 아웃·시즌 아웃은 시장 중간에 알림이 와서 대응할 수 있다.
export const INJURY_KINDS = ['minor', 'mid', 'half', 'season'];
export const INJURY_BASE = { minor: 0.14, mid: 0.06, half: 0.03, season: 0.01 }; // 보통 내구성의 반기당 확률
export const INJURY_LABELS = { minor: '잔부상', mid: '중간 부상', half: '반기 아웃', season: '시즌 아웃' };
export const INJURY_POINTS = { minor: 0.2, mid: 0.6 }; // 선발일 때 깎이는 승점
export const DURABILITY_MULT = { iron: 0.4, normal: 1, fragile: 2 };
export const INJURY_CHIP_COUNT = { academy: 1, proLicense: 1, veteran: 2, master: 3 };

export const injuryMult = (p) => (DURABILITY_MULT[p.durability] ?? 1) * ((p.age ?? 0) >= 33 ? 1.3 : 1);

// 한 번 굴려서 kinds 중 하나(또는 없음)
export function rollInjury(p, rng = Math.random, kinds = INJURY_KINDS) {
  const m = injuryMult(p);
  let r = rng();
  for (const k of kinds) {
    const pr = Math.min(0.9, INJURY_BASE[k] * m);
    if (r < pr) return k;
    r -= pr;
  }
  return null;
}

// 새로 만든 선수의 지난 시즌 이력(두 반기를 굴린다) - 영입 전에도 힌트가 된다
export function sampleInjuryHistory(p, rng = Math.random) {
  const out = [];
  for (let h = 0; h < 2; h++) { const k = rollInjury(p, rng); if (k) out.push({ kind: k, ago: 1 }); }
  return out;
}

// 화면에 보이는 이력 칩(정확한 일수는 없다). 심한 것부터, 스카우터 등급이 높을수록 많이 보인다.
export function injuryChips(p, level = 'academy') {
  const hist = (p.injHistory ?? []).filter((h) => h.ago <= 1);
  const when = (h) => (h.ago === 0 ? '이번 시즌' : '지난 시즌');
  const chips = [];
  for (const k of ['season', 'half', 'mid']) {
    const h = hist.find((x) => x.kind === k);
    if (h) chips.push(`${when(h)} ${INJURY_LABELS[k]}`);
  }
  if (hist.filter((h) => h.kind === 'minor').length >= 2) chips.push('잔부상 많음');
  if (!chips.length) return ['부상 이력 없음'];
  return chips.slice(0, INJURY_CHIP_COUNT[level] ?? 1);
}
