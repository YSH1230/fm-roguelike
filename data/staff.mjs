import { STAFF_LEVELS, STAFF_PRICE_TABLE } from '../engine/constants.mjs';
import { randomInRange } from '../engine/economy.mjs';

// 스펙 5.3절 "스태프 2종 × 4등급" — 조합이 8개뿐이라 생성기 불필요, 전부 나열
const ROLES = ['headCoach', 'headScout'];

export const STAFF = ROLES.flatMap((role) =>
  STAFF_LEVELS.map((level) => ({
    id: `${role}-${level}`,
    role,
    level,
  }))
);

// 주간 스태프 시장 오퍼: 고정 카드에 가격만 매주 새로 굴림 (스펙 7절 "매주 후보 순환")
export function rollStaffOffer(staffId, rng = Math.random) {
  const card = STAFF.find((s) => s.id === staffId);
  if (!card) throw new Error(`Unknown staff id: ${staffId}`);
  const [minPrice, maxPrice] = STAFF_PRICE_TABLE[card.level];
  return { ...card, price: Math.round(randomInRange(minPrice, maxPrice, rng)) };
}
