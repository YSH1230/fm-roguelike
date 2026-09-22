import { STAFF_LEVELS } from '../engine/constants.mjs';

// 스펙 5.3절 "스태프 2종 × 4등급" — 조합이 8개뿐이라 생성기 불필요, 전부 나열
const ROLES = ['headCoach', 'headScout'];

export const STAFF = ROLES.flatMap((role) =>
  STAFF_LEVELS.map((level) => ({
    id: `${role}-${level}`,
    role,
    level,
  }))
);

// 스태프 시장 UI가 없는 슬라이스라 런 시작 시 코치·스카우터를 하나씩 무작위 배정한다
// (낮은 등급이 더 흔하도록 가중치를 둠 — 신생 구단이 마스터급을 바로 쓰는 건 어색함).
const LEVEL_WEIGHTS = ['academy', 'academy', 'academy', 'proLicense', 'proLicense', 'veteran', 'master'];

export function assignRandomStaff(rng = Math.random) {
  const pick = () => LEVEL_WEIGHTS[Math.floor(rng() * LEVEL_WEIGHTS.length)];
  return {
    headCoach: { role: 'headCoach', level: pick() },
    headScout: { role: 'headScout', level: pick() },
  };
}
