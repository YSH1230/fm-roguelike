import { DRAFT_SIZE, POSITIONS, ROOKIE_DISCOUNT } from './constants.mjs';
import { askingSalary, marketValue, newContract } from './contract.mjs';
import { createPlayer } from './player.mjs';
import { gauss, randInt } from './rng.mjs';

// 후보 20명: 19~21세, 능력은 35~65, 잠재력은 나이에 따라 따로 붙는다.
export function generateProspects(rng, { count = DRAFT_SIZE, prefix }) {
  return Array.from({ length: count }, (_, i) => createPlayer({
    rng,
    id: `${prefix}-${i}`,
    position: POSITIONS[randInt(rng, 0, POSITIONS.length - 1)],
    age: randInt(rng, 19, 21),
    level: 35 + rng() * 30,
  }));
}

// 지명권은 팀이 들고 다닌다. { year, round, from }은 "from 팀의 year년 round라운드 지명권".
// 한 해에 1라운드와 2라운드 두 장을 받는다. 순번은 from 팀의 그 시즌 순위로 정해진다(꼴찌가 1번).
export const DRAFT_ROUNDS = 2;
export function grantPicks(teams, year) {
  for (const team of teams) {
    for (let round = 1; round <= DRAFT_ROUNDS; round += 1) (team.picks ??= []).push({ year, round, from: team.id });
  }
}

export function spendPicks(teams, year) {
  for (const team of teams) team.picks = (team.picks ?? []).filter((pick) => pick.year !== year);
}

// 직전 성적 역순(꼴찌가 1번)으로 슬롯을 정하고, 슬롯마다 그 지명권을 쥔 팀을 주인으로 적는다.
// standings: 1위부터 정렬된 순위표 행, teams: 팀 배열
// 2라운드면 40칸: 1라운드 20칸 뒤에 2라운드가 같은 순서로 이어진다(slot은 전체 지명 번호).
export function draftOrder(standings, teams, year, rounds = DRAFT_ROUNDS) {
  const worstFirst = [...standings].reverse();
  const out = [];
  for (let round = 1; round <= rounds; round += 1) {
    for (const row of worstFirst) {
      const holder = teams.find((t) => (t.picks ?? []).some((pick) => pick.year === year && (pick.round ?? 1) === round && pick.from === row.id));
      out.push({ slot: out.length + 1, round, from: row.id, owner: holder ? holder.id : row.id });
    }
  }
  return out;
}

// 2라운드 신인을 계약하지 않고 돈(코인)으로 받을 때의 금액: 앞 순번일수록 많다(15 ~ 5코인).
export const buyoutCoins = (slot, teamCount = 20) => {
  const i = Math.max(0, slot - teamCount - 1); // 2라운드 안에서의 순번(0부터)
  return 15 - Math.round((i * 10) / Math.max(1, teamCount - 1));
};

export const createDraft = ({ prospects, order }) => ({ order, pool: [...prospects], picks: [], next: 0 });
export const isDraftOver = (draft) => draft.next >= draft.order.length;

export function draftPick(draft, ownerId, playerId) {
  if (isDraftOver(draft)) throw new Error('드래프트가 끝났습니다');
  if (draft.order[draft.next].owner !== ownerId) throw new Error('지금은 이 팀의 순번이 아닙니다');
  const at = draft.pool.findIndex((p) => p.id === playerId);
  if (at < 0) throw new Error('이미 지명되었거나 후보가 아닌 선수입니다');
  const [player] = draft.pool.splice(at, 1);
  draft.picks.push({ slot: draft.order[draft.next].slot, round: draft.order[draft.next].round ?? 1, owner: ownerId, player });
  draft.next += 1;
  return player;
}

// AI는 가치가 가장 높은 후보를 고르되 약간 흔들린다(스카우트 오차).
function aiChoice(draft, rng) {
  let best = null;
  let bestScore = -Infinity;
  for (const p of draft.pool) {
    const score = marketValue(p) + gauss(rng) * 3;
    if (score > bestScore) { best = p; bestScore = score; }
  }
  return best;
}

// 내 순번이 오거나 드래프트가 끝날 때까지 AI 팀들이 차례로 지명한다.
export function autoPickUntil(draft, myId, rng) {
  while (!isDraftOver(draft) && draft.order[draft.next].owner !== myId) {
    draftPick(draft, draft.order[draft.next].owner, aiChoice(draft, rng).id);
  }
}

// 지명된 선수에게 신인 계약(요구 연봉의 60%, 3년)을 붙여 팀별로 돌려준다.
// year를 주면 선수에게 영입 기록(몇 라운드 몇 번째 지명이었는지)도 남긴다.
export function draftedBy(draft, ownerId, year = null) {
  const teamCount = draft.order.length / Math.max(1, ...draft.order.map((o) => o.round ?? 1));
  return draft.picks.filter((p) => p.owner === ownerId).map((p) => {
    p.player.contract = newContract(Math.max(1, Math.round(askingSalary(p.player) * ROOKIE_DISCOUNT)));
    if (year !== null) p.player.origin = { how: 'draft', year, round: p.round ?? 1, pick: ((p.slot - 1) % teamCount) + 1 };
    return p.player;
  });
}

// 매 라운드 같은 순서로 지명한다(teamIds는 이미 지명 순서대로 정렬된 구단 id). slot은 전체 지명 번호(1부터).
export function repeatOrder(teamIds, rounds) {
  const out = [];
  let slot = 0;
  for (let r = 0; r < rounds; r += 1) {
    for (const id of teamIds) {
      slot += 1;
      out.push({ slot, round: r + 1, from: id, owner: id });
    }
  }
  return out;
}

// 이 팀의 지명 번호들(전체 기준)
export const pickNumbers = (draft, ownerId) => draft.order.filter((o) => o.owner === ownerId).map((o) => o.slot);
