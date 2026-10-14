// v3: 화면에는 OVR 숫자 대신 "별"만 보인다. 별 = 세상의 평가(관측값)이고, 진짜 실력(baseOVR + 시즌 폼)은 숨는다.
// 관측값 = baseOVR + obsErr(선수마다 고정된 평가 오차: 양수면 이름값이 높은 "거품", 음수면 저평가된 "보석").

// 별 눈금(S4): OVR 6점 = 별 1칸. 기준은 그 리그 영입 풀 중앙값(고정 상수표, 영입 풀 가중치를 바꾸면 시뮬로 다시 계산).
export const OVR_PER_STAR = 6;
export const STAR_ANCHOR_BY_TIER = { tier5: 59, tier4: 64, tier3: 72, tier2: 77, tier1: 83 };
export const anchorOf = (tierId) => STAR_ANCHOR_BY_TIER[tierId] ?? STAR_ANCHOR_BY_TIER.tier5;
export const FORM_SIGMA = { steady: 1.5, normal: 2.5, streaky: 4 }; // 시즌 폼 표준편차(OVR)
export const FORM_RHO = { steady: 0.5, normal: 0.25, streaky: 0.05 }; // 폼이 작년에서 이어지는 정도
export const OBS_R = { steady: 38, normal: 66, streaky: 25 }; // 칼만 관측 분산
export const OBS_KMIN = { steady: 0.25, normal: 0.15, streaky: 0.15 }; // 칼만 이득 하한(유형별)
export const EVAL_NOISE_SIGMA = 3.0; // 영입 직전 평가 잡음(OVR)

function gauss(rng) {
  return Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
}

// 선수 생성 때 붙는 숨은 속성: 평가 오차와 폼 변동 크기
export function rollHiddenTraits(rng = Math.random) {
  const r = rng();
  const volatility = r < 0.2 ? 'streaky' : r < 0.45 ? 'steady' : 'normal';
  const axis = (a, b) => (rng() < 0.3 ? (rng() < 0.5 ? a : b) : null); // 축마다 30%만 활성(선수당 보통 3~4개 특성)
  const d = rng();
  return {
    durability: d < 0.2 ? 'iron' : d < 0.8 ? 'normal' : 'fragile', // 내구성(부상 확률, engine/injury.mjs)
    ...rollInitialObservation(volatility, rng), volatility,
    curve: axis('late', 'early'), rhythm: axis('slow', 'fast'), team: axis('team', 'solo'), adapt: axis('riser', 'lowking'), settle: axis('fast', 'slow'),
  };
}

// 숨은 특성이 이번 상황에서 실력에 보태는 값. fx.leagueIdx(0=5부~4=1부)·fx.half(1|2)가 있어야 그 축이 작동한다.
export function hiddenShift(p, fx = null) {
  let v = 0;
  if (p.team === 'solo') v += 2; else if (p.team === 'team') v -= 1; // 혼자 해결하는 선수는 강하지만 팀 시너지가 약하다(ovr.mjs)
  if (p.adapt && fx?.leagueIdx != null) { const d = (fx.leagueIdx - 2) * 0.75; v += p.adapt === 'riser' ? d : -d; }
  if (p.acquiredThisSeason) { if (p.settle === 'fast') v += 1; else if (p.settle === 'slow') v -= 2; }
  if (p.rhythm && fx?.half) { const s = p.rhythm === 'slow' ? -2 : 2; v += fx.half === 1 ? s : -s; }
  return v;
}
// 화면 표시용: 숨은 값을 전부 지운 선수(팀 효과 표시가 숨은 값을 새지 않게)
export const hideHidden = (p) => ({ ...p, form: 0, team: null, adapt: null, settle: null, rhythm: null });

const r1 = (x) => Math.round(x * 10) / 10;
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
// 폼 지속 계수: 유형별 기본값 + OVR 연동(기준보다 높을수록 오래). anchor가 없으면 OVR 연동 없음.
export const formRho = (p, anchor = null) => {
  const vol = p.volatility ?? 'normal';
  const link = anchor == null ? 0 : 0.15 * clamp(((p.baseOVR ?? anchor) - anchor) / 12, -1, 1);
  return clamp(FORM_RHO[vol] + link, 0, 0.85);
};
// 영입 시 초기값(C-2): 작년 폼 prev, 평가 잡음 3.0 + 0.5×prev, 올해 폼, 별 오차 분산 obsP.
export function rollInitialObservation(volatility = 'normal', rng = Math.random) {
  const sig = FORM_SIGMA[volatility] ?? FORM_SIGMA.normal;
  const rho = FORM_RHO[volatility] ?? FORM_RHO.normal;
  const prev = sig * gauss(rng);
  return {
    obsErr: r1(EVAL_NOISE_SIGMA * gauss(rng) + 0.5 * prev),
    form: r1(rho * prev + Math.sqrt(1 - rho * rho) * sig * gauss(rng)),
    prevForm: r1(prev),
    obsP: EVAL_NOISE_SIGMA ** 2 + (0.5 * sig) ** 2,
  };
}
// 시즌 시작마다 폼이 새로 정해진다(작년에서 ρ만큼 이어진다). 갱신 전 폼은 prevForm에 남긴다.
export function nextForm(p, anchor, rng = Math.random) {
  const sig = FORM_SIGMA[p.volatility] ?? FORM_SIGMA.normal;
  const rho = formRho(p, anchor);
  const prev = p.form ?? 0;
  return { form: r1(rho * prev + Math.sqrt(1 - rho * rho) * sig * gauss(rng)), prevForm: prev };
}
// 칼만 갱신: 별 오차(obsErr)가 이번 활약(perf)을 향해 움직인다. 유형별 이득 하한 때문에 기복형도 수렴한다. 옛 세이브(obsP 없음)는 초기값으로 본다.
export function obsUpdate(p, perf) {
  const vol = p.volatility ?? 'normal';
  const sig = FORM_SIGMA[vol] ?? FORM_SIGMA.normal;
  const P = p.obsP ?? EVAL_NOISE_SIGMA ** 2 + (0.5 * sig) ** 2;
  const K = Math.max(P / (P + OBS_R[vol]), OBS_KMIN[vol]);
  return { obsErr: r1((p.obsErr ?? 0) + K * (perf - (p.obsErr ?? 0))), obsP: (1 - K) ** 2 * P + K * K * sig * sig };
}

export const observedOVR = (p) => p.baseOVR + (p.obsErr ?? 0);

// 리그 기준(anchor) 별: 0.5 단위, 1~5
export function starsOf(p, anchor) {
  const raw = 3 + (observedOVR(p) - anchor) / OVR_PER_STAR;
  return Math.min(5, Math.max(1, Math.round(raw * 2) / 2));
}

export const starText = (s) => `★${Number.isInteger(s) ? s : s.toFixed(1)}`;

// 별 → 카드 색 등급(기존 CSS 변수 --t-<id> 재사용)
export function tierFromStars(s) {
  return s >= 5 ? 'legendary' : s >= 4 ? 'worldClass' : s >= 3.5 ? 'topClass' : s >= 2.5 ? 'bigLeaguer' : 'local';
}
