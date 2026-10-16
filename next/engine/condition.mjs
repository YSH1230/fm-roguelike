import {
  FATIGUE_PER_ROUND, INJURY_BASE, INJURY_MAX_CHUNKS, NATURAL_RECOVERY, REST_RECOVERY, UNDERPAID_RATIO,
} from './constants.mjs';
import { askingSalary } from './contract.mjs';
import { facilityEffects } from './economy.mjs';
import { addXp, chunkXp, coachMul } from './growth.mjs';
import { createPlayer } from './player.mjs';
import { randInt } from './rng.mjs';
import { fillerLevel } from './team.mjs';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const isInjured = (p) => (p.injury?.chunksLeft ?? 0) > 0;
export const isAvailable = (p) => !p.resting && !isInjured(p);
export const teamMorale = (team) => (team.stars.length === 0 ? 0 : team.stars.reduce((s, p) => s + p.mood, 0) / team.stars.length);

// 구간 시작 전에 기록을 찍어 두면 끝난 뒤 그 구간의 증가분을 구할 수 있다.
export const snapshotStats = (team) => new Map(team.lineup.map((p) => [p.id, { ...p.stats }]));
const statDelta = (p, before) => {
  const b = before.get(p.id) ?? { apps: 0, goals: 0, assists: 0 };
  return { apps: p.stats.apps - b.apps, goals: p.stats.goals - b.goals, assists: p.stats.assists - b.assists };
};

// 이번 구간에 쉬게 할 스타를 지정한다(이전 지정은 모두 덮어쓴다). 이 팀 스타가 아니면 오류.
export function setRest(team, ids) {
  for (const id of ids) if (!team.stars.some((p) => p.id === id)) throw new Error(`이 팀의 스타가 아닙니다: ${id}`);
  for (const p of team.stars) p.resting = ids.includes(p.id);
}

// 쉬는 스타와 다친 스타 자리를 같은 포지션 대체 선수가 메운 팀 보기. simulateMatch에 그대로 넘길 수 있다.
// 대체 선수는 team.subs에 보관해 기록이 이어진다. 리그에서는 league.teams.set(id, view) 후 playChunk, 끝나면 원래 팀을 되돌린다.
export function lineupView(team, rng) {
  const available = team.stars.filter(isAvailable);
  const fillers = team.lineup.slice(team.stars.length);
  const used = {};
  const subs = team.stars.filter((p) => !isAvailable(p)).map((p) => {
    used[p.position] = (used[p.position] ?? 0) + 1;
    const key = `${p.position}${used[p.position]}`;
    team.subs ??= {};
    team.subs[key] ??= createPlayer({
      rng,
      id: `${team.id}-sub-${key}`,
      position: p.position,
      age: 25,
      level: fillerLevel(team.coaches.attack.stars, team.coaches.defense.stars),
    });
    return team.subs[key];
  });
  return { ...team, stars: available, lineup: [...available, ...fillers, ...subs] };
}

// 뛴 선수: 라운드 x 1.3 x 강도 배율만큼 줄고 8 회복. 쉬거나 다친 선수: 35 회복.
export function nextCondition(p, { played, rounds, fatigue }) {
  if (!played) return clamp(p.condition + REST_RECOVERY, 0, 100);
  return clamp(p.condition - rounds * FATIGUE_PER_ROUND * fatigue + NATURAL_RECOVERY, 0, 100);
}

// 뛴 선수만 다친다. 컨디션이 50 아래면 확률이 올라가고, 재활 시설이 좋으면 회복 구간이 줄어든다(최소 1).
export function rollInjury(p, rng, { injuryMul, healMultiplier }) {
  const tired = p.condition < 50 ? 1 + (50 - p.condition) / 25 : 1;
  if (rng() >= INJURY_BASE * injuryMul * tired) return false;
  p.injury = { chunksLeft: Math.max(1, Math.round(randInt(rng, 1, INJURY_MAX_CHUNKS) / healMultiplier)) };
  return true;
}

// 사기: 출전 +0.5, 쉼 0, 다쳐서 못 뜀 -1, 벤치 -2. 득점 +1, 도움 +0.5, 코치 강도·특성, 연봉이 요구액의 80% 미만이면 -1.
export function nextMood(p, d, { rested, wasInjured, coachMood }) {
  let delta = d.apps > 0 ? 0.5 : (wasInjured ? -1 : (rested ? 0 : -2));
  delta += d.goals + d.assists * 0.5 + coachMood;
  if (p.contract.salary < askingSalary(p) * UNDERPAID_RATIO) delta -= 1;
  return clamp(p.mood + delta, 0, 100);
}

// 구간 하나가 끝난 뒤 스타 전원의 XP·컨디션·사기·부상을 한꺼번에 갱신한다.
// before: snapshotStats(team), rounds: 이 구간 라운드 수(14/14/10). 요약 목록을 돌려준다.
export function chunkStep({ team, before, rng, club, rounds }) {
  const heal = facilityEffects(club).healMultiplier;
  const summary = team.stars.map((p) => {
    const wasInjured = isInjured(p);
    const rested = Boolean(p.resting);
    const d = statDelta(p, before);
    const played = d.apps > 0;
    const xp = chunkXp(p, d, { team, club });
    const levelUps = addXp(p, xp);
    p.condition = nextCondition(p, { played, rounds, fatigue: coachMul(team, p.position, 'fatigue') });
    const moodBefore = p.mood;
    p.mood = nextMood(p, d, { rested, wasInjured, coachMood: coachMul(team, p.position, 'mood') });
    if (wasInjured) {
      p.injury.chunksLeft -= 1;
      if (p.injury.chunksLeft <= 0) delete p.injury;
    }
    const injured = played && rollInjury(p, rng, { injuryMul: coachMul(team, p.position, 'injury'), healMultiplier: heal });
    p.resting = false;
    return { id: p.id, xp, levelUps, condition: p.condition, moodDelta: p.mood - moodBefore, injured };
  });
  return summary;
}
