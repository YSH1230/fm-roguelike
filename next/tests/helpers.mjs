import { createRng } from '../engine/rng.mjs';
import { createTeam } from '../engine/team.mjs';
import { createWorld, isWorldSeasonOver, playWorldChunk } from '../engine/world.mjs';

// 테스트 공용: 내 팀(3부 시작)이 들어간 세계. 계획 5 테스트들이 같이 쓴다.
export function makeWorld(seed = 1) {
  const rng = createRng(seed);
  const me = createTeam({ rng, id: 'ME', starLevel: 46 });
  return { rng, me, world: createWorld({ rng, myTeam: me }) };
}

export function playFullSeason(world, rng) {
  while (!isWorldSeasonOver(world)) playWorldChunk(world, rng);
}
