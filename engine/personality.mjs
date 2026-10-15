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

// 사건 확률 배수(성격별 기분 값이 있을 때만; 토크 삭제 뒤에는 항상 중립 ×1)
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
