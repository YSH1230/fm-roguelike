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
