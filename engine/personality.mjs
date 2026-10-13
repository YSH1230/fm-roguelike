// 선수 성격: 사건(출전 요구·이적 요구)과 관계(토크 반응·판매)만 맡는다. 승점·OVR 직접 영향 없음, 조직력은 소폭.
// 점검: node tools/check-personality.mjs. 유저에게는 공개하지 않는다(사건과 토크 반응 한 줄로만 드러난다). 기획: docs/planning-2026-10-13.md 7절.
export const PERSONALITIES = {
  ambitious: { name: '야심형', chance: 0.15 },
  loyal: { name: '충성형', chance: 0.15 },
  gambler: { name: '승부사', chance: 0.15 },
  mood: { name: '분위기메이커', chance: 0.15 },
};
export const PERSONALITY_IDS = Object.keys(PERSONALITIES);

export function rollPersonality(rng = Math.random) {
  let r = rng();
  for (const id of PERSONALITY_IDS) { r -= PERSONALITIES[id].chance; if (r < 0) return id; }
  return null; // 성격 없음(약 40%)
}

// 라커룸 토크마다 분위기 태그 하나: warm 따뜻함 / pressure 압박 / risk 모험 / stable 안정
export const TALK_MOOD = {
  roar: 'pressure', cheer: 'warm', gamble: 'risk', film: 'stable', freedom: 'risk', market: 'stable', joke: 'warm', carrot: 'pressure',
  thanks: 'warm', review: 'pressure', generation: 'risk', veterans: 'stable', belt: 'pressure', cleanup: 'pressure',
};
// 성격별 반응: +1 좋아함, −1 싫어함
const LIKES = {
  ambitious: { pressure: 1, stable: -1 },
  loyal: { warm: 1, pressure: -1 },
  gambler: { risk: 1, stable: -1 },
  mood: { warm: 1, pressure: -1 },
};
export const TALK_CHEM_CAP = 2;

// 토크 반응: 성격별 반응(−1/0/+1), 조직력 가감(선수단 합을 ±2로 자름), 반응 한 줄.
export function personalityReaction(talkId, squad) {
  const mood = TALK_MOOD[talkId];
  const byType = {};
  let sum = 0;
  for (const id of PERSONALITY_IDS) {
    const r = LIKES[id][mood] ?? 0;
    byType[id] = r;
    sum += r * squad.filter((p) => p.personality === id).length;
  }
  const liked = PERSONALITY_IDS.filter((id) => byType[id] > 0 && squad.some((p) => p.personality === id));
  const disliked = PERSONALITY_IDS.filter((id) => byType[id] < 0 && squad.some((p) => p.personality === id));
  const names = (ids) => ids.map((id) => PERSONALITIES[id].name).join('·');
  const text = [liked.length ? `${names(liked)} 선수들이 반겼어요.` : '', disliked.length ? `${names(disliked)} 선수들은 표정이 굳었어요.` : ''].filter(Boolean).join(' ');
  return { byType, delta: Math.max(-TALK_CHEM_CAP, Math.min(TALK_CHEM_CAP, sum)), text };
}

// 사건 확률 배수: 토크에서 그 성격이 싫어했으면 ×2, 좋아했으면 ×0.5
export const moodMult = (personalityMood, personality) => {
  const r = personalityMood?.[personality] ?? 0;
  return r < 0 ? 2 : r > 0 ? 0.5 : 1;
};

// 출전 요구가 올 만한 벤치 반기 수: 야심형은 1반기(토크에서 싫어했으면 2), 나머지는 2
export const benchHalvesNeeded = (personality, personalityMood) => (personality === 'ambitious' && (personalityMood?.ambitious ?? 0) >= 0 ? 1 : 2);

// 벤치 이적 요구(시즌 종료, 최대 1건): 벤치 2반기 이상 선수가 기본 5%, 야심형 ×3, 충성형 0
export const BENCH_TRANSFER_BASE = 0.05;
export function rollBenchTransferDemand(squad, benchHalves, personalityMood, rng = Math.random) {
  const pool = squad.filter((p) => !p.emergencyYouth && (benchHalves?.[p.id] ?? 0) >= 2 && p.personality !== 'loyal');
  for (const p of [...pool].sort(() => rng() - 0.5)) {
    const chance = BENCH_TRANSFER_BASE * (p.personality === 'ambitious' ? 3 : 1) * moodMult(personalityMood, p.personality);
    if (rng() < chance) return { id: p.id, name: p.name, reason: 'bench' };
  }
  return null;
}

// 주장 성격별 덧붙임 대사(토크 반응 톤별)
export const CAPTAIN_TAIL = {
  ambitious: { good: '저도 더 뛰고 싶습니다.', mixed: '기회만 주시면 됩니다.', bad: '벤치에 앉은 애들 눈빛이 달라졌어요.' },
  loyal: { good: '이 팀은 제가 끝까지 지킵니다.', mixed: '저는 {호칭}을 믿습니다.', bad: '그래도 저는 남습니다.' },
  gambler: { good: '이런 판이 제일 재미있죠.', mixed: '크게 걸어야 크게 땁니다.', bad: '이렇게 가면 재미가 없습니다.' },
  mood: { good: '라커룸은 제가 책임질게요.', mixed: '분위기는 제가 맞춰 볼게요.', bad: '제가 풀어 볼 테니 너무 걱정 마세요.' },
};
