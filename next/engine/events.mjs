import { earn, spend } from './economy.mjs';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// 효과는 선택 전에 아이콘으로 보여 주므로 데이터로 둔다.
// effects: teamMood(스타 전원 사기), playerMood(면담 선수 사기), fans, coins, rest(다음 구간 휴식)
const PRESS = {
  winning: [
    { id: 'win-secret', text: '연승 비결이 뭔가요?', options: [
      { label: '선수들 덕분입니다', effects: { teamMood: 3 } },
      { label: '제 전술 덕분입니다', effects: { fans: 2, teamMood: -1 } },
    ] },
    { id: 'win-title', text: '우승 도전, 가능할까요?', options: [
      { label: '자신 있습니다', effects: { fans: 3, teamMood: 1 } },
      { label: '한 경기씩 가겠습니다', effects: { teamMood: 2 } },
    ] },
  ],
  losing: [
    { id: 'lose-blame', text: '부진의 책임은 누구에게 있나요?', options: [
      { label: '제 책임입니다', effects: { teamMood: 3, fans: -1 } },
      { label: '선수들이 더 해줘야죠', effects: { teamMood: -4, fans: 1 } },
    ] },
    { id: 'lose-job', text: '감독직을 지킬 수 있을까요?', options: [
      { label: '결과로 증명하겠습니다', effects: { fans: 1 } },
      { label: '구단에 맡기겠습니다', effects: { fans: -2, teamMood: -1 } },
    ] },
  ],
  even: [
    { id: 'even-goal', text: '다음 구간 목표는요?', options: [
      { label: '상위권 도약', effects: { fans: 2, teamMood: -1 } },
      { label: '안정적 운영', effects: { teamMood: 1 } },
    ] },
    { id: 'even-sponsor', text: '스폰서 행사 참석 요청이 왔습니다', options: [
      { label: '참석한다', effects: { coins: 10, teamMood: -2 } },
      { label: '거절한다', effects: { teamMood: 1 } },
    ] },
  ],
};

const INTERVIEWS = {
  unhappy: { id: 'iv-unhappy', text: '출전과 대우에 불만이 있습니다', options: [
    { label: '연봉 인상을 약속한다', effects: { coins: -10, playerMood: 12 } },
    { label: '기다리라고 한다', effects: { playerMood: -4 } },
  ] },
  tired: { id: 'iv-tired', text: '몸이 많이 무겁습니다', options: [
    { label: '다음 구간은 쉬게 한다', effects: { playerMood: 6, rest: true } },
    { label: '버텨 달라고 한다', effects: { playerMood: -5 } },
  ] },
  slump: { id: 'iv-slump', text: '골이 안 터져서 답답합니다', options: [
    { label: '격려한다', effects: { playerMood: 5 } },
    { label: '채찍질한다', effects: { playerMood: -3 } },
  ] },
  ad: { id: 'iv-ad', text: '광고 촬영 제안이 왔습니다', options: [
    { label: '촬영을 수락한다', effects: { coins: 15, playerMood: -5 } },
    { label: '거절한다', effects: { playerMood: 3 } },
  ] },
};

// 구간 성적(승 - 패)이 +4 이상이면 연승 분위기, -4 이하면 부진, 그 사이는 평범.
export const pressSituation = ({ won, lost }) => (won - lost >= 4 ? 'winning' : (won - lost <= -4 ? 'losing' : 'even'));

export function pickPress(rng, situation) {
  const list = PRESS[situation];
  if (!list) throw new Error(`알 수 없는 상황: ${situation}`);
  return list[Math.floor(rng() * list.length)];
}

// 선수 상태에 맞는 면담 하나. 사기 낮음 > 컨디션 낮음 > 득점 슬럼프 > 광고(사기 60 이상, 25%) 순이고 없으면 null.
export function interviewFor(rng, p) {
  if (p.mood < 45) return INTERVIEWS.unhappy;
  if (p.condition < 50) return INTERVIEWS.tired;
  if (p.stats.apps >= 10 && p.stats.goals === 0 && (p.position === 'FW' || p.position === 'MF')) return INTERVIEWS.slump;
  if (p.mood >= 60 && rng() < 0.25) return INTERVIEWS.ad;
  return null;
}

// 코인이 모자라 못 고르는 선택지인지 미리 알려 준다(화면에서 흐리게 표시).
export const canChoose = (club, option) => (option.effects.coins ?? 0) + club.coins >= 0;

// 선택을 적용한다. 코인이 모자라면 아무것도 바꾸지 않고 오류. player는 면담 대상(기자회견은 생략).
export function applyChoice({ club, team, option, player }) {
  const e = option.effects;
  if (!canChoose(club, option)) throw new Error('코인이 모자랍니다');
  if ((e.playerMood !== undefined || e.rest) && !player) throw new Error('면담 선수가 필요합니다');
  if (e.coins > 0) earn(club, e.coins);
  if (e.coins < 0) spend(club, -e.coins);
  if (e.fans) club.fans = clamp(club.fans + e.fans, 0, 100);
  if (e.teamMood) for (const p of team.stars) p.mood = clamp(p.mood + e.teamMood, 0, 100);
  if (e.playerMood) player.mood = clamp(player.mood + e.playerMood, 0, 100);
  if (e.rest) player.resting = true;
}
