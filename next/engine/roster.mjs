import { createPlayer } from './player.mjs';
import { fillerLevel, fillerPositions } from './team.mjs';

// 스타 명단을 통째로 바꾸고 라인업(11명)을 다시 맞춘다.
// 기존 조연은 포지션이 맞으면 그대로 쓰고(기록 유지), 모자란 자리만 새로 만든다.
export function setStars(team, rng, stars) {
  const spare = team.lineup.slice(team.stars.length);
  const level = fillerLevel(team.coaches.attack.stars, team.coaches.defense.stars);
  const fillers = fillerPositions(stars.map((p) => p.position)).map((position) => {
    const at = spare.findIndex((p) => p.position === position);
    if (at >= 0) return spare.splice(at, 1)[0];
    team.fillerCount = (team.fillerCount ?? 0) + 1;
    return createPlayer({ rng, id: `${team.id}-g${team.fillerCount}`, position, age: 24, level });
  });
  team.stars = stars;
  team.lineup = [...stars, ...fillers];
}
