import { ROSTER_STARS, TRADE_MARGIN, TRADE_MIN_MOOD } from './constants.mjs';
import { marketValue, payroll } from './contract.mjs';
import { overall } from './player.mjs';
import { setStars } from './roster.mjs';
import { weightedPick } from './rng.mjs';
import { refillStars } from './aiWorld.mjs';

// 지명권 가치: 1번 슬롯 68.5 ~ 20번 슬롯 40. slots는 원래 팀 id → 예상 슬롯(꼴찌가 1번)
export const pickValue = (slot, round = 1) => (round === 1 ? 40 + (20 - slot) * 1.5 : 20 + (20 - slot) * 0.8);

// offer는 내 입장: { give: { players: [id], picks: [{year, from}] }, get: { players: [id], picks: [...] } }
const find = (team, id) => team.stars.find((p) => p.id === id);
const same = (a, b) => a.year === b.year && a.from === b.from && (a.round ?? 1) === (b.round ?? 1);
const owns = (team, pick) => (team.picks ?? []).some((q) => same(q, pick));
const sideValue = (players, picks, slots) =>
  players.reduce((s, p) => s + marketValue(p), 0) + picks.reduce((s, k) => s + pickValue(slots.get(k.from) ?? 10, k.round ?? 1), 0);

// 구조가 맞는지만 본다(수락 여부는 aiAccepts). 맞지 않으면 이유를 문자열로 돌려준다.
export function checkOffer(offer, me, ai) {
  const gp = offer.give.players.map((id) => find(me, id));
  const ap = offer.get.players.map((id) => find(ai, id));
  if (gp.includes(undefined) || ap.includes(undefined)) return '교환할 선수가 팀에 없습니다';
  if (!offer.give.picks.every((k) => owns(me, k)) || !offer.get.picks.every((k) => owns(ai, k))) return '지명권을 가지고 있지 않습니다';
  if (gp.length + offer.give.picks.length === 0 || ap.length + offer.get.picks.length === 0) return '서로 한 가지 이상 주고받아야 합니다';
  if (me.stars.length - gp.length + ap.length > ROSTER_STARS) return '스타는 6명을 넘을 수 없습니다(먼저 한 명을 내보내세요)';
  return null;
}

// 거래 뒤 연봉 총액이 각 팀 캡을 넘는지 계산한다.
function payrollsAfter(offer, me, ai) {
  const gp = offer.give.players.map((id) => find(me, id));
  const ap = offer.get.players.map((id) => find(ai, id));
  const sum = (list) => list.reduce((s, p) => s + p.contract.salary, 0);
  return { me: payroll(me) - sum(gp) + sum(ap), ai: payroll(ai) - sum(ap) + sum(gp) };
}

// AI 수락 기준: 받는 가치 ≥ 주는 가치 × 1.1, 거래 뒤 양쪽 캡 이내, 사기 30 미만 선수는 받지 않음.
export function aiAccepts({ offer, me, ai, myCap, aiCap, slots }) {
  const bad = checkOffer(offer, me, ai);
  if (bad) return { accepted: false, reason: 'invalid', detail: bad };
  const gp = offer.give.players.map((id) => find(me, id));
  const ap = offer.get.players.map((id) => find(ai, id));
  if (gp.some((p) => p.mood < TRADE_MIN_MOOD)) return { accepted: false, reason: 'mood' };
  const after = payrollsAfter(offer, me, ai);
  if (after.me > myCap || after.ai > aiCap) return { accepted: false, reason: 'cap' };
  const received = sideValue(gp, offer.give.picks, slots);
  const given = sideValue(ap, offer.get.picks, slots);
  if (received < given * TRADE_MARGIN) return { accepted: false, reason: 'value' };
  return { accepted: true, reason: null };
}

// 거래를 실제로 적용한다(수락 판단은 호출한 쪽 몫). 구조와 캡이 어긋나면 오류.
export function executeTrade({ offer, me, ai, myCap, aiCap, rng }) {
  const bad = checkOffer(offer, me, ai);
  if (bad) throw new Error(bad);
  const after = payrollsAfter(offer, me, ai);
  if (after.me > myCap || after.ai > aiCap) throw new Error('샐러리캡을 넘는 거래입니다');
  const gp = offer.give.players.map((id) => find(me, id));
  const ap = offer.get.players.map((id) => find(ai, id));
  setStars(me, rng, [...me.stars.filter((p) => !gp.includes(p)), ...ap]);
  setStars(ai, rng, [...ai.stars.filter((p) => !ap.includes(p)), ...gp]);
  if (ai.stars.length > ROSTER_STARS) { // 선수를 더 받은 AI 팀은 가장 약한 선수를 내보낸다
    const weakest = [...ai.stars].sort((a, b) => overall(a) - overall(b))[0];
    setStars(ai, rng, ai.stars.filter((p) => p !== weakest));
  }
  if (ai.stars.length < ROSTER_STARS) refillStars(ai, rng); // 선수만 내준 AI 팀은 신인으로 6명을 다시 채운다
  const move = (from, to, picks) => {
    from.picks = from.picks.filter((q) => !picks.some((k) => same(k, q)));
    (to.picks ??= []).push(...picks);
  };
  move(me, ai, offer.give.picks);
  move(ai, me, offer.get.picks);
}

// AI가 내 스타 한 명(가치가 클수록 잘 걸림)에게 보내는 제안. 가치가 가장 비슷한 선수를 맞바꾸자고 하고,
// 그쪽이 더 약하면 자기 지명권 한 장을 덧붙인다. 보낼 수 있는 제안이 없으면 null.
export function proposeAi(rng, me, aiTeams, year) {
  if (me.stars.length === 0) return null;
  const mine = weightedPick(rng, me.stars, marketValue);
  const candidates = aiTeams.filter((t) => t.stars.length > 0);
  if (candidates.length === 0) return null;
  const ai = candidates[Math.floor(rng() * candidates.length)];
  const theirs = ai.stars.reduce((a, b) => (Math.abs(marketValue(b) - marketValue(mine)) < Math.abs(marketValue(a) - marketValue(mine)) ? b : a));
  const sweetener = marketValue(theirs) < marketValue(mine) ? (ai.picks ?? []).filter((k) => k.year === year).slice(0, 1) : [];
  return { aiTeamId: ai.id, give: { players: [mine.id], picks: [] }, get: { players: [theirs.id], picks: sweetener } };
}
