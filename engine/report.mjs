// 스태프 리포트(순수 함수): 시장 카드는 스카우터, 내 선수단은 코치가 같은 형식으로 알려 준다.
// reportFor(p, level, ctx) → { always: [성장폭, 작년 흐름, 부상 이력], graded: [자리 판단, 이름값, 내구성, 성향] (등급별 앞에서 1/2/3/4개) }
// 각 항목: { id, label, text, tone?: 'good'|'bad'|'flat', ... }. 정확도는 내부 값이라 반환하지 않는다(화면에 표시하지 않는다).
// 같은 선수·같은 등급이면 항상 같은 답이다(hash32 기반). 설계: docs/redesign-v3-stars.md 4절.
import { hash32, fixedGauss, potentialGrade } from './scouting.mjs';
import { starsOf, FORM_SIGMA } from './stars.mjs';
import { injuryChips } from './injury.mjs';
import { TRAIT_PHRASES, activeTraits } from './traits.mjs';

export const REPORT_ACC = { academy: 0.55, proLicense: 0.68, veteran: 0.78, master: 0.8 };
export const REPORT_ACC_MAX = 0.8;
export const REPORT_HELD_BONUS = 0.04; // 코치: 같이 지낸 시즌마다 정확도 +0.04
export const GRADED_COUNT = { academy: 1, proLicense: 2, veteran: 3, master: 4 };
// 영입 후 보유 시즌별 별 오차 sd(OVR, 유형별 MC 보정표). 시장 카드는 0시즌.
export const SD_BY_HELD = {
  steady: [3.05, 1.92, 1.40, 1.20, 1.14, 1.13, 1.13],
  normal: [3.23, 2.52, 2.03, 1.72, 1.54, 1.44, 1.37, 1.34],
  streaky: [3.61, 2.77, 2.37, 2.12, 1.96, 1.88, 1.86, 1.83],
};
export const SIGMA_AGE = 1.2; // 나이 기대 변화의 불확실성(OVR)
const Z80 = 1.2816;

export const reportAccuracy = (level, held = 0, role = 'scout') => Math.min(REPORT_ACC_MAX, (REPORT_ACC[level] ?? REPORT_ACC.academy) + (role === 'coach' ? REPORT_HELD_BONUS * held : 0));

const normCdf = (x) => {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
};
// 정확도 acc(진짜 값이 80% 구간에 들어갈 확률)에서 중심 오차 배수 f를 거꾸로 구한다: acc = 2Φ(1.28/√(1+f²)) − 1
export function centerErrorFactor(acc) {
  if (acc >= REPORT_ACC_MAX - 1e-9) return 0;
  let lo = 0;
  let hi = 5;
  for (let i = 0; i < 40; i++) {
    const f = (lo + hi) / 2;
    if (2 * normCdf(Z80 / Math.sqrt(1 + f * f)) - 1 > acc) lo = f; else hi = f;
  }
  return (lo + hi) / 2;
}

const hash01 = (key) => (hash32(key) % 100000) / 100000;
const snap = (v) => Math.round(v * 2) / 2;

// 나이에 따른 시즌당 기대 별 변화(★). 코치 마스터는 어린 선수를 더 키운다.
export function expectedStarDelta(age, level = 'academy', role = 'scout') {
  if (role === 'coach' && level === 'master') {
    if (age <= 21) return 0.49;
    if (age <= 24) return 0.37;
    if (age <= 27) return 0.17;
  }
  if (age <= 22) return 0.33;
  if (age <= 25) return 0.31;
  if (age <= 28) return 0.17;
  if (age <= 31) return 0;
  if (age <= 34) return -0.06;
  if (age <= 37) return -0.14;
  return -0.25;
}

// ① 성장폭 원자료(반올림 전): 중심·반폭, 정확도에 따른 고정 중심 오차 포함
export function growthBand(p, level, ctx) {
  const { role = 'scout', seasonsHeld = 0, anchor } = ctx;
  const sd = SD_BY_HELD[p.volatility] ?? SD_BY_HELD.normal;
  const sdOvr = sd[Math.min(seasonsHeld, sd.length - 1)];
  const W = Math.sqrt(sdOvr * sdOvr + SIGMA_AGE * SIGMA_AGE) / 6;
  const stars = starsOf(p, anchor);
  const trueCenter = stars + expectedStarDelta(p.age, level, role);
  const f = centerErrorFactor(reportAccuracy(level, seasonsHeld, role));
  const center = trueCenter + fixedGauss(`${p.id}|${level}|growth`) * W * f;
  return { stars, trueCenter, center, W, lo: center - Z80 * W, hi: center + Z80 * W };
}

function growthItem(p, level, ctx) {
  const b = growthBand(p, level, ctx);
  let lo = Math.max(1, Math.min(5, snap(b.lo)));
  let hi = Math.max(1, Math.min(5, snap(b.hi)));
  if (hi - lo < 0.5) { if (hi >= 5) lo = 4.5; else hi = lo + 0.5; } // 폭은 최소 0.5★
  const shift = b.center - b.stars;
  const arrow = p.age >= 38 ? '↘' : shift >= 0.2 ? '↗' : shift <= -0.2 ? '↘' : '→';
  const grade = potentialGrade(p, level, ctx.role === 'coach' ? ctx.seasonsHeld ?? 0 : 0, ctx.noiseMult ?? 1);
  return { id: 'growth', label: '성장폭', text: `★${lo}~${hi}`, lo, hi, arrow, grade, tone: arrow === '↗' ? 'good' : arrow === '↘' ? 'bad' : 'flat' };
}

// ② 작년 흐름: 작년 폼이 ±0.7σ 밖이면 호조/부진(사실, 오차 없음)
function lastYearItem(p) {
  const sigma = FORM_SIGMA[p.volatility] ?? FORM_SIGMA.normal;
  const z = (p.prevForm ?? 0) / sigma;
  const [text, tone] = z >= 0.7 ? ['호조', 'good'] : z <= -0.7 ? ['부진', 'bad'] : ['보통', 'flat'];
  return { id: 'lastYear', label: '작년 흐름', text, tone };
}

// 범주형 오답: 맞으면 참값, 틀리면 인접 범주(양끝은 가운데, 가운데는 임의의 한쪽 끝)
function threeWay(p, level, item, truthIdx, acc) {
  if (hash01(`${p.id}|${level}|report|${item}`) < acc) return truthIdx;
  if (truthIdx !== 1) return 1;
  return hash32(`${p.id}|${level}|report|${item}|side`) % 2 === 0 ? 0 : 2;
}

const POSITION_LABELS = [['즉시 전력', 'good'], ['로테이션', 'flat'], ['미달', 'bad']];
function positionItem(p, level, ctx, acc) {
  const mates = (ctx.lineup ?? []).filter((q) => q.id !== p.id && q.position === p.position);
  const mine = p.baseOVR + (p.form ?? 0);
  const gap = mates.length ? mine - Math.min(...mates.map((q) => q.baseOVR + (q.form ?? 0))) : Infinity; // 같은 자리가 공석이면 즉시 전력
  const truth = gap >= 2 ? 0 : gap > -3 ? 1 : 2;
  const [text, tone] = POSITION_LABELS[threeWay(p, level, 'position', truth, acc)];
  return { id: 'position', label: '자리 판단', text, tone };
}
const NAME_LABELS = [['고평가', 'bad'], ['적정', 'flat'], ['저평가', 'good']];
function nameItem(p, level, acc) {
  const err = p.obsErr ?? 0;
  const truth = err >= 3 ? 0 : err <= -3 ? 2 : 1;
  const [text, tone] = NAME_LABELS[threeWay(p, level, 'name', truth, acc)];
  return { id: 'name', label: '이름값', text, tone };
}
const DUR_LABELS = [['철인', 'good'], ['보통', 'flat'], ['유리몸', 'bad']];
function durabilityItem(p, level, acc) {
  const truth = { iron: 0, normal: 1, fragile: 2 }[p.durability ?? 'normal'];
  let idx = truth;
  if (hash01(`${p.id}|${level}|report|durability`) >= acc) {
    const others = [0, 1, 2].filter((i) => i !== truth);
    idx = others[hash32(`${p.id}|${level}|report|durability|w`) % 2];
  }
  const [text, tone] = DUR_LABELS[idx];
  return { id: 'durability', label: '내구성', text, tone };
}

// ⑦ 성향: 활성 특성 중 우선순위 순으로 최대 2개. 틀리면 전체 문구 중 임의 문구.
const TRAIT_PRIORITY = ['volatility', 'rhythm', 'team', 'adapt', 'settle', 'curve'];
const ALL_PHRASES = Object.values(TRAIT_PHRASES).flatMap((o) => Object.values(o));
function traitItem(p, level, acc) {
  const truths = activeTraits(p).sort((a, b) => TRAIT_PRIORITY.indexOf(a.axis) - TRAIT_PRIORITY.indexOf(b.axis)).slice(0, 2);
  const lines = truths.map((t) => (hash01(`${p.id}|${level}|report|trait|${t.axis}`) < acc
    ? TRAIT_PHRASES[t.axis][t.key]
    : ALL_PHRASES[hash32(`${p.id}|${level}|report|trait|${t.axis}|w`) % ALL_PHRASES.length]));
  const uniq = [...new Set(lines)];
  return { id: 'traits', label: '성향', text: uniq.length ? uniq.join(' · ') : '뚜렷한 성향 없음', lines: uniq };
}

// ctx: { anchor(필수, 리그 별 기준), role: 'scout'|'coach', seasonsHeld(코치: 같이 지낸 시즌), lineup(내 선발, 자리 판단용), noiseMult }
export function reportFor(p, level = 'academy', ctx = {}) {
  const role = ctx.role ?? 'scout';
  const held = ctx.seasonsHeld ?? 0;
  const full = { ...ctx, role, seasonsHeld: held };
  const acc = reportAccuracy(level, held, role);
  const chips = injuryChips(p);
  const always = [
    growthItem(p, level, full),
    lastYearItem(p),
    { id: 'injury', label: '부상 이력', text: chips.collapsed.join(' · '), collapsed: chips.collapsed, expanded: chips.expanded },
  ];
  const graded = [positionItem(p, level, ctx, acc), nameItem(p, level, acc), durabilityItem(p, level, acc), traitItem(p, level, acc)].slice(0, GRADED_COUNT[level] ?? 1);
  return { always, graded };
}
