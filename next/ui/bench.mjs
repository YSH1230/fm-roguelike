import { ATTRIBUTES } from '../engine/constants.mjs';
import { myLeague } from '../engine/world.mjs';

// 내 리그 다른 팀 스타 중 같은 포지션의 능력치 평균과 최고(내 선수는 빼고 센다). 비교 상대가 없으면 null.
export function benchmarks(game, position) {
  const mine = new Set(game.myTeam.stars);
  const peers = [...myLeague(game.world).teams.values()].flatMap((t) => t.stars).filter((p) => p.position === position && !mine.has(p));
  const out = {};
  for (const key of ATTRIBUTES[position]) {
    const vals = peers.map((p) => p.attrs[key]);
    out[key] = vals.length ? { avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length), best: Math.max(...vals), n: vals.length } : null;
  }
  return out;
}
