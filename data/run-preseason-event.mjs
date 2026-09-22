import { generateProceduralPlayer } from './generate-player.mjs';
import { resolveFfpAudit } from '../engine/events.mjs';
import { SPONSORSHIP_FUNDS_BONUS_RATIO } from '../engine/constants.mjs';

// 스펙 3절 "초기 정비기(Week 1~3)" 이벤트 중, 실제로 자금/스쿼드를 바꿀 수
// 있는 3종만 여기서 굴린다(faFireSale·agentBacklash는 실제 영입 순간에
// 붙는 이벤트라 매매 흐름이 생기기 전까지는 연결하지 않음 — 스펙 3절 참고).
const CANDIDATES = ['mainSponsorship', 'ffpAudit', 'youthGoldenGeneration', null];

export function rollPreseasonEvent(squad, funds, rng = Math.random) {
  const id = CANDIDATES[Math.floor(rng() * CANDIDATES.length)];

  if (id === 'mainSponsorship') {
    return {
      id,
      funds: Math.round(funds * (1 + SPONSORSHIP_FUNDS_BONUS_RATIO)),
      squad,
      message: '메인 스폰서십 특수: 시작 자금 +20%',
    };
  }

  if (id === 'ffpAudit') {
    const { payCost } = resolveFfpAudit();
    if (funds >= payCost) {
      return { id, funds: funds - payCost, squad, message: `FFP 긴급 감사: ${payCost}G 납부` };
    }
    // 자금이 모자라면 스쿼드에서 가장 약한 카드를 무료로 방출한다.
    const weakest = [...squad].sort((a, b) => a.baseOVR - b.baseOVR)[0];
    const squadAfterRelease = squad.filter((p) => p.id !== weakest.id);
    return {
      id,
      funds,
      squad: squadAfterRelease,
      message: `FFP 긴급 감사: 자금 부족 — ${weakest.name} 무료 방출`,
    };
  }

  if (id === 'youthGoldenGeneration') {
    const freeYouth = {
      ...generateProceduralPlayer('local', rng),
      price: 0,
      specialTrait: 'seongGolYouth',
      isDraftedYouth: true,
    };
    return {
      id,
      funds,
      squad: [...squad, freeYouth],
      message: `유스 아카데미 골든 제너레이션: ${freeYouth.name} 무료 영입`,
    };
  }

  return { id: null, funds, squad, message: '이번 시즌 이적시장 이벤트 없음' };
}
