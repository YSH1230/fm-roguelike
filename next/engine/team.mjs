import { createPlayer } from './player.mjs';

const LINEUP_SIZE = 11;
const DEFAULT_STAR_POSITIONS = ['GK', 'DF', 'DF', 'MF', 'FW', 'FW'];
// 스타가 없는 자리는 조연이 채운다. 먼저 이 최소 구성(골키퍼 1, 수비 3, 미드 2, 공격 1)을 맞추고,
// 남는 자리는 수비·미드·공격 순으로 돌아가며 채운다.
const MIN_SHAPE = [['GK', 1], ['DF', 3], ['MF', 2], ['FW', 1]];
const EXTRA_CYCLE = ['DF', 'MF', 'FW'];

export function fillerPositions(starPositions) {
  const count = { GK: 0, DF: 0, MF: 0, FW: 0 };
  for (const position of starPositions) count[position] += 1;
  const fillers = [];
  const room = () => LINEUP_SIZE - starPositions.length - fillers.length;
  for (const [position, minimum] of MIN_SHAPE) {
    while (count[position] < minimum && room() > 0) {
      fillers.push(position);
      count[position] += 1;
    }
  }
  for (let i = 0; room() > 0; i += 1) fillers.push(EXTRA_CYCLE[i % EXTRA_CYCLE.length]);
  return fillers;
}

// 조연 수준은 코치 별 평균에 따라 정해진다(별 1개당 능력 8).
export const fillerLevel = (attackStars, defenseStars) => 25 + ((attackStars + defenseStars) / 2) * 8;

// 라인업 11명: 스타(관리 대상) 먼저, 나머지는 코치 수준에 맞춘 조연.
export function createTeam({ rng, id, attackStars = 3, defenseStars = 3, starLevel = 60, starPositions = DEFAULT_STAR_POSITIONS }) {
  const stars = starPositions.map((position, i) =>
    createPlayer({ rng, id: `${id}-s${i}`, position, age: 22 + (i % 6) * 2, level: starLevel }),
  );
  const level = fillerLevel(attackStars, defenseStars);
  const fillers = fillerPositions(starPositions).map((position, i) =>
    createPlayer({ rng, id: `${id}-f${i}`, position, age: 24 + i, level }),
  );
  return {
    id,
    coaches: { attack: { stars: attackStars }, defense: { stars: defenseStars } },
    fillerBase: level, // 조연에게 마지막으로 반영된 코치 기준 수준(코치가 바뀌면 syncFillers가 맞춘다)
    stars,
    lineup: [...stars, ...fillers],
  };
}
