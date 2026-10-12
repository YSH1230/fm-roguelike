// v3: 화면에는 OVR 숫자 대신 "별"만 보인다. 별 = 세상의 평가(관측값)이고, 진짜 실력(baseOVR + 시즌 폼)은 숨는다.
// 관측값 = baseOVR + obsErr(선수마다 고정된 평가 오차: 양수면 이름값이 높은 "거품", 음수면 저평가된 "보석").
import { hash32 } from './scouting.mjs';

export const OBS_ERR_SIGMA = 4.5; // 평가 오차 표준편차(OVR). 별 약 0.75칸
export const OVR_PER_STAR = 4; // 리그 평균 선수 = ★3, OVR 4가 별 1칸
export const FORM_SIGMA = { steady: 1.5, normal: 2.5, streaky: 5 }; // 시즌 폼 표준편차(OVR)

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
    obsErr: Math.round(gauss(rng) * OBS_ERR_SIGMA * 10) / 10, volatility, form: rollForm(volatility, rng),
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

// 시즌 폼: 시즌이 시작될 때 선수마다 정해져 그 시즌 내내 유지된다.
export function rollForm(volatility = 'normal', rng = Math.random) {
  return Math.round(gauss(rng) * (FORM_SIGMA[volatility] ?? FORM_SIGMA.normal) * 10) / 10;
}

export const observedOVR = (p) => p.baseOVR + (p.obsErr ?? 0);

// 리그 평균 OVR(mid) 기준 별: 0.5 단위, 1~5
export function starsOf(p, mid) {
  const raw = 3 + (observedOVR(p) - mid) / OVR_PER_STAR;
  return Math.min(5, Math.max(1, Math.round(raw * 2) / 2));
}

// 스카우터 등급별 범위 반폭(별 단위). 중심은 선수·등급마다 고정으로 어긋난다.
export const STAR_RANGE_HALF = { academy: 2, proLicense: 1.5, veteran: 1, master: 0.5 };
export function starRange(p, mid, level = 'academy') {
  const half = STAR_RANGE_HALF[level] ?? 2;
  const s = starsOf(p, mid);
  const jitter = ((hash32(`${p.id}|${level}|star`) % 1001) / 1000 - 0.5) * half * 0.8; // 중심 어긋남 ±0.4×half
  const snap = (v) => Math.min(5, Math.max(1, Math.round(v * 2) / 2));
  const lo = snap(s + jitter - half);
  const hi = snap(s + jitter + half);
  // 관측값 자체는 항상 범위 안에 둔다(범위가 거짓말하지는 않는다)
  return { lo: Math.min(lo, s), hi: Math.max(hi, s) };
}

export const starText = (s) => `★${Number.isInteger(s) ? s : s.toFixed(1)}`;
export const rangeText = ({ lo, hi }) => (lo === hi ? starText(lo) : `${starText(lo)}~${hi}`);

// 별 → 카드 색 등급(기존 CSS 변수 --t-<id> 재사용)
export function tierFromStars(s) {
  return s >= 5 ? 'legendary' : s >= 4 ? 'worldClass' : s >= 3.5 ? 'topClass' : s >= 2.5 ? 'bigLeaguer' : 'local';
}
