// 스펙 3절/8절 "이벤트" — 슬라이스 범위 카탈로그.
// resolver가 있으면 engine/events.mjs의 함수를, 없으면 modifierRatio를
// engine/economy.mjs의 applyCostModifiers 등에 바로 넘겨 쓴다.
export const EVENTS = [
  {
    id: 'ffpAudit',
    name: 'FFP 긴급 감사',
    type: 'crisis',
    scope: 'general',
    weekRange: [4, 8],
    resolver: 'resolveFfpAudit',
  },
  {
    id: 'agentBacklash',
    name: '에이전트의 뒷공작',
    type: 'crisis',
    scope: 'general',
    weekRange: [4, 11],
    modifierRatio: 0.1, // 영입비 +10% (거부 시 계약 파기)
  },
  {
    id: 'mainSponsorship',
    name: '메인 스폰서십 특수',
    type: 'opportunity',
    scope: 'general',
    weekRange: [1, 3],
    modifierRatio: 0.2, // 시작 이적 예산 +20%
  },
  {
    id: 'faFireSale',
    name: 'FA 급매물 등장',
    type: 'opportunity',
    scope: 'general',
    weekRange: [4, 8],
    modifierRatio: -0.5, // 50% 할인
  },
  {
    id: 'youthGoldenGeneration',
    name: '유스 아카데미 골든 제너레이션',
    type: 'opportunity',
    scope: 'general',
    weekRange: [1, 4],
    freeSeongGolYouth: true, // 0G 성골 유스 확정
  },
  {
    id: 'promotionRenewalHike',
    name: '핵심 선수 재계약 인상',
    type: 'crisis',
    scope: 'promotionOnly',
    weekRange: [1, 12],
    resolver: 'resolvePromotionRenewalHike',
  },
  {
    id: 'promotionTransferDemand',
    name: '핵심 선수 이적 요구',
    type: 'crisis',
    scope: 'promotionOnly',
    weekRange: [1, 12],
    resolver: 'resolvePromotionTransferDemand',
  },
];
