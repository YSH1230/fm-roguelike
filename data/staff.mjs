import { STAFF_LEVELS, STAFF_LEVELS_BY_TIER, CONTINENT_TAGS } from '../engine/constants.mjs';
import { pick as pickOne, randomName } from './name-pools.mjs';

// 스펙 5.3절 "스태프 2종 × 4등급" — 조합이 8개뿐이라 생성기 불필요, 전부 나열
const ROLES = ['headCoach', 'headScout'];

export const STAFF = ROLES.flatMap((role) =>
  STAFF_LEVELS.map((level) => ({
    id: `${role}-${level}`,
    role,
    level,
  }))
);

// 얼굴·이름이 없으면 감독·스태프 칸에서 그냥 등급표로만 보인다 - 초상화(대륙
// 태그 필요)를 그릴 수 있게 이름과 대륙을 매 배정/매물마다 새로 뽑는다.
function rollStaffIdentity(rng) {
  const continentTag = pickOne(Object.keys(CONTINENT_TAGS), rng);
  return { name: randomName(continentTag, rng), continentTag };
}

// 런 시작 시 코치·스카우터를 하나씩 무작위 배정한다. 5부 신생 구단이라 낮은 등급이 압도적이다
// (아카데미 85% / 프로 라이선스 15%) - 시작부터 베테랑·마스터급 스태프가 있는 건 비현실적이다.
const START_LEVEL_WEIGHTS = [...Array(17).fill('academy'), ...Array(3).fill('proLicense')];

export function assignRandomStaff(rng = Math.random) {
  const pick = () => START_LEVEL_WEIGHTS[Math.floor(rng() * START_LEVEL_WEIGHTS.length)];
  return {
    headCoach: { role: 'headCoach', level: pick(), focus: 'midfield', ...rollStaffIdentity(rng) }, // focus: 코치 주력 유닛(자유 변경)
    headScout: { role: 'headScout', level: pick(), ...rollStaffIdentity(rng) },
  };
}

// 스태프 시장 후보 이름/얼굴. 등급 버튼을 누르면 이 후보가 그대로 영입된다.
export function generateStaffCandidate(role, level, rng = Math.random) {
  const { name, continentTag } = rollStaffIdentity(rng);
  return { id: `${role}-${level}-${Math.floor(rng() * 1e6)}`, role, level, name, continentTag };
}

// 스태프 시장에 뜨는 등급별 후보 1명씩. 리그가 낮을수록 높은 등급은 안 나온다(STAFF_LEVELS_BY_TIER).
export function generateStaffOffer(rng = Math.random, tierId = 'tier1') {
  const offer = {};
  const levels = STAFF_LEVELS_BY_TIER[tierId] ?? STAFF_LEVELS;
  for (const role of ROLES) {
    for (const level of levels) {
      offer[`${role}:${level}`] = generateStaffCandidate(role, level, rng);
    }
  }
  return offer;
}
