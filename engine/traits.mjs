// v3: 선수의 숨은 특성(관측 오차·폼 변동·성장 곡선·시즌 리듬·팀 기여·리그 적응·신입 적응)과, 화면에 보이는 "성향 문구".
// 문구는 진짜 특성의 힌트지만 스카우터 등급이 낮으면 가끔 틀린다(반대 문구나 없는 특성을 보여 준다).
// 이름값(rep)·내구성 문구는 리포트 ⑤ 이름값·⑥ 내구성(engine/report.mjs)으로 옮겼다.
import { hash32 } from './scouting.mjs';

export const TRAIT_PHRASES = {
  volatility: { streaky: '기복이 큰 편', steady: '꾸준한 편' },
  curve: { late: '늦게 터지는 타입', early: '일찍 정점을 찍는 타입' },
  rhythm: { slow: '슬로 스타터', fast: '시즌 초반에 강한 편' },
  team: { team: '팀 플레이를 중시', solo: '혼자 해결하는 타입' },
  adapt: { riser: '큰 무대에 강한 편', lowking: '작은 무대에서 빛나는 편' },
  settle: { fast: '적응이 빠른 편', slow: '새 팀 적응이 느린 편' },
};
const ALL_PHRASES = Object.values(TRAIT_PHRASES).flatMap((o) => Object.values(o));
export const HINT_COUNT = { academy: 1, proLicense: 2, veteran: 2, master: 3 };
export const HINT_ACCURACY = { academy: 0.6, proLicense: 0.75, veteran: 0.85, master: 0.95 };

// 진짜 특성 목록 [{axis, key}]
export function activeTraits(p) {
  const out = [];
  if (p.volatility === 'streaky' || p.volatility === 'steady') out.push({ axis: 'volatility', key: p.volatility });
  for (const axis of ['curve', 'rhythm', 'team', 'adapt', 'settle']) if (p[axis]) out.push({ axis, key: p[axis] });
  return out;
}

// 같은 선수·같은 등급이면 항상 같은 문구(다시 봐도 안 바뀐다)
export function traitHints(p, level = 'academy') {
  const count = HINT_COUNT[level] ?? 1;
  const acc = HINT_ACCURACY[level] ?? 0.6;
  const truths = activeTraits(p).sort((a, b) => hash32(`${p.id}|${level}|${a.axis}`) - hash32(`${p.id}|${level}|${b.axis}`));
  const out = [];
  for (let i = 0; i < count; i++) {
    const r = (hash32(`${p.id}|${level}|r${i}`) % 1000) / 1000;
    const t = truths[i];
    const wrong = ALL_PHRASES[hash32(`${p.id}|${level}|w${i}`) % ALL_PHRASES.length];
    if (t) out.push(r < acc ? TRAIT_PHRASES[t.axis][t.key] : wrong);
    else if (r < 1 - acc) out.push(wrong); // 특성이 없는데도 가끔 있는 것처럼 보인다
  }
  return [...new Set(out)];
}
