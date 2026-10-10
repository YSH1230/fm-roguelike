// 스카우터(시장 카드)와 코치(내 선수단)가 알려 주는 "전성기 추정 범위". 아무리 좋아도 정확하지는 않다.
// 보이는 범위는 [중심 - 폭, 중심 + 폭]이고, 폭 안에 진짜 전성기가 들어갈 확률이 hit이다(최상급도 80%).
// 중심의 오차는 선수·등급마다 고정(같은 선수를 다시 봐도 안 바뀜). 같이 지낸 시즌이 쌓이면 폭이 줄어든다(최소 2).
export const SCOUT_ACCURACY = {
  academy: { half: 10, hit: 0.6 },
  proLicense: { half: 6, hit: 0.75 },
  veteran: { half: 4, hit: 0.8 },
  master: { half: 2, hit: 0.8 },
};
export const MIN_HALF_WIDTH = 2;
// 정규분포에서 양쪽 hit 확률을 덮는 z값
const Z = { 0.6: 0.8416, 0.75: 1.1503, 0.8: 1.2816 };

export function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  // 마지막에 비트를 한 번 더 섞는다(비슷한 문자열이 비슷한 값으로 나오면 오차가 한쪽으로 쏠린다)
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h >>> 0;
}
// 문자열에서 고정된 표준정규 난수 하나
function fixedGauss(seed) {
  const u1 = (hash32(`${seed}|a`) + 1) / 4294967297;
  const u2 = (hash32(`${seed}|b`) + 1) / 4294967297;
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function estimatePeak(p, level = 'academy', seasonsKnown = 0) {
  if (p.peakOVR == null) return null;
  const acc = SCOUT_ACCURACY[level] ?? SCOUT_ACCURACY.academy;
  const half = Math.max(MIN_HALF_WIDTH, acc.half - seasonsKnown);
  const sigma = (half + 0.5) / Z[acc.hit]; // 정수로 반올림해서 보이는 폭이 +0.5씩 넓어지는 것까지 감안
  const center = p.peakOVR + fixedGauss(`${p.id}|${level}`) * sigma;
  const lo = Math.max(p.baseOVR, Math.round(center - half));
  const hi = Math.min(99, Math.max(lo, Math.round(center + half)));
  return { lo, hi };
}

// 잠재력 등급(A/B/C): 전성기까지 오를 폭으로 나눈다. 스카우터·코치가 보는 값은 정확하지 않아서
// 등급이 한 칸 틀릴 수 있다(좋은 등급일수록 덜 틀린다). 같은 선수·같은 등급이면 항상 같은 답이다.
export const GRADE_CUTS = { A: 7, B: 4, C: 1 }; // 전성기까지 +7 이상 A, +4~6 B, +1~3 C
export const GRADE_NOISE = { academy: 3.5, proLicense: 2.5, veteran: 1.8, master: 1.2 };
const gradeOf = (up) => (up >= GRADE_CUTS.A ? 'A' : up >= GRADE_CUTS.B ? 'B' : up >= GRADE_CUTS.C ? 'C' : null);
export function potentialGrade(p, level = 'academy', seasonsKnown = 0) {
  if (p.peakOVR == null) return null;
  const up = p.peakOVR - p.baseOVR;
  if (up < GRADE_CUTS.C) return null; // 더 오를 여지가 없다
  const sigma = Math.max(0.8, (GRADE_NOISE[level] ?? GRADE_NOISE.academy) - 0.3 * seasonsKnown);
  const seen = up + fixedGauss(`${p.id}|${level}|grade`) * sigma;
  return gradeOf(seen) ?? 'C'; // 오를 선수를 "성장 없음"으로 보여 주지는 않는다
}
