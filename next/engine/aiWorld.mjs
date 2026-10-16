import { AI_REPLACEMENT_AGE, TIER_PARAMS } from './constants.mjs';
import { endOfSeason } from './aging.mjs';
import { syncFillers } from './coach.mjs';
import { createPlayer, overall } from './player.mjs';
import { gauss, randInt, weightedPick } from './rng.mjs';
import { setStars } from './roster.mjs';
import { allTeams } from './world.mjs';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const SHAPE = ['GK', 'DF', 'DF', 'MF', 'FW', 'FW'];

export const topThree = (team) => [...team.stars].sort((a, b) => overall(b) - overall(a)).slice(0, 3);

// 해마다 AI 팀은 리그 단계의 기준 수준 쪽으로 10%씩 끌려가며 흔들린다. 코치 별은 25% 확률로 반 칸 변한다.
export function driftTeam(team, rng) {
  const target = TIER_PARAMS[team.tier].target;
  for (const p of team.stars) {
    for (const key of Object.keys(p.attrs)) {
      p.attrs[key] = clamp(Math.round(p.attrs[key] + (target - p.attrs[key]) * 0.1 + gauss(rng) * 2), 1, 99);
    }
    for (const key of Object.keys(p.attrs)) if (p.caps) p.caps[key] = Math.max(p.caps[key], p.attrs[key]);
    p.potential = Math.max(p.potential, Math.round(overall(p)));
  }
  for (const kind of ['attack', 'defense']) {
    if (rng() < 0.25) team.coaches[kind].stars = clamp(team.coaches[kind].stars + (rng() < 0.5 ? 0.5 : -0.5), 1, 5);
  }
  syncFillers(team);
}

// 스타가 6명보다 적으면 부족한 포지션(기본 구성 기준)에 어린 신인을 채운다.
export function refillStars(team, rng) {
  const stars = [...team.stars];
  const base = stars.length === 0 ? TIER_PARAMS[team.tier].target : stars.reduce((s, p) => s + overall(p), 0) / stars.length;
  while (stars.length < 6) {
    const missing = [...SHAPE];
    for (const p of stars) { const at = missing.indexOf(p.position); if (at >= 0) missing.splice(at, 1); }
    team.newCount = (team.newCount ?? 0) + 1;
    stars.push(createPlayer({
      rng,
      id: `${team.id}-n${team.newCount}`,
      position: missing[0] ?? SHAPE[randInt(rng, 0, 5)],
      age: randInt(rng, AI_REPLACEMENT_AGE[0], AI_REPLACEMENT_AGE[1]),
      level: base - 5,
    }));
  }
  setStars(team, rng, stars);
  team.named = topThree(team);
}

// 시즌 종료 처리: 나이 +1, 하락, 확률 은퇴(40세 강제) 뒤 빈자리를 신인으로 메운다. 은퇴자 목록을 돌려준다.
export function ageAiTeam(team, rng) {
  const retired = endOfSeason(team, rng);
  refillStars(team, rng);
  return retired;
}

// 일부 AI 선수가 FA로 풀린다: 이름 있는 선수 중 나이가 많을수록 잘 뽑힌다. 풀린 자리는 신인이 메운다.
export function releaseAiPlayers(rng, aiTeams, count) {
  const released = [];
  for (let i = 0; i < count; i += 1) {
    const pool = aiTeams.flatMap((t) => (t.named ?? []).filter((p) => t.stars.includes(p)).map((p) => ({ team: t, p })));
    if (pool.length === 0) break;
    const { team, p } = weightedPick(rng, pool, ({ p: q }) => Math.max(1, q.age - 26));
    setStars(team, rng, team.stars.filter((s) => s !== p));
    refillStars(team, rng);
    released.push(p);
  }
  return released;
}

// 계획 2의 aiSign으로 이름 있는 선수 목록에 들어온 FA를 실제 스타로 넣는다(가장 약한 스타를 밀어낸다).
export function integrateNamed(team, rng) {
  const incoming = (team.named ?? []).filter((p) => !team.stars.includes(p));
  const stars = [...team.stars];
  for (const p of incoming) {
    const weakest = stars.reduce((w, s, i) => (overall(s) < overall(stars[w]) ? i : w), 0);
    stars[weakest] = p;
  }
  if (incoming.length > 0) setStars(team, rng, stars);
  team.named = topThree(team);
}

// 시즌 사이 AI 팀 전체 갱신(내 팀 제외): 기준 수준 쪽 변동 -> 나이·은퇴·신인 보충 -> 이름 있는 선수 갱신.
export function offseasonAi(world, rng) {
  const retired = [];
  for (const team of allTeams(world)) {
    if (team.id === world.myTeamId) continue;
    driftTeam(team, rng);
    retired.push(...ageAiTeam(team, rng));
  }
  return retired;
}
