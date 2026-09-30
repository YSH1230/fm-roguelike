import { generateProceduralPlayer } from './generate-player.mjs';
import { resolveFfpAudit } from '../engine/events.mjs';
import { SPONSORSHIP_FUNDS_BONUS_RATIO, EVENT_CHANCE_SUMMER, EVENT_CHANCE_WINTER } from '../engine/constants.mjs';

// 시즌 이벤트 풀. apply는 { squad, funds, chemistry, baseFunds }를 받아 바뀐 값과
// message("이름: 상세" - UI가 ': '로 제목/상세를 나눈다)를 돌려준다.
// 같은 이벤트가 다시 나와도 된다(중복 방지 없음).
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const EVENTS = [
  {
    id: 'mainSponsorship', name: '메인 스폰서십 특수', tone: 'good',
    apply: ({ funds }) => ({ funds: Math.round(funds * (1 + SPONSORSHIP_FUNDS_BONUS_RATIO)), message: `메인 스폰서십 특수: 자금 +${SPONSORSHIP_FUNDS_BONUS_RATIO * 100}%` }),
  },
  {
    id: 'ffpAudit', name: 'FFP 긴급 감사', tone: 'bad',
    apply: ({ squad, funds }) => {
      const { payCost } = resolveFfpAudit();
      if (funds >= payCost) return { funds: funds - payCost, message: `FFP 긴급 감사: ${payCost}G 납부` };
      // 자금이 모자라면 가장 약한 카드를 무료로 방출한다.
      const weakest = [...squad].sort((a, b) => a.baseOVR - b.baseOVR)[0];
      return { squad: squad.filter((p) => p.id !== weakest.id), message: `FFP 긴급 감사: 자금 부족. ${weakest.name} 무료 방출` };
    },
  },
  {
    id: 'youthGoldenGeneration', name: '유스 아카데미 골든 제너레이션', tone: 'good',
    apply: ({ squad }, rng) => {
      const youth = { ...generateProceduralPlayer('local', rng), price: 0, specialTrait: 'seongGolYouth', isDraftedYouth: true };
      return { squad: [...squad, youth], message: `유스 아카데미 골든 제너레이션: ${youth.name} 무료 영입` };
    },
  },
  {
    id: 'supportersFund', name: '서포터즈 모금', tone: 'good',
    apply: ({ funds, baseFunds }) => {
      const gift = Math.round(baseFunds * 0.08);
      return { funds: funds + gift, message: `서포터즈 모금: 자금 +${gift}G` };
    },
  },
  {
    id: 'pressPraise', name: '언론의 호평', tone: 'good',
    apply: ({ chemistry }) => ({ chemistry: clamp(chemistry + 8, 0, 100), message: '언론의 호평: 팀 분위기가 좋아졌습니다. 적응도 +8' }),
  },
  {
    id: 'pressCriticism', name: '언론의 융단 폭격', tone: 'bad',
    apply: ({ chemistry }) => ({ chemistry: clamp(chemistry - 8, 0, 100), message: '언론의 융단 폭격: 라커룸이 뒤숭숭합니다. 적응도 -8' }),
  },
  {
    id: 'retiringLegend', name: '은퇴 앞둔 레전드', tone: 'good',
    apply: ({ squad }, rng) => {
      const legend = { ...generateProceduralPlayer('bigLeaguer', rng), age: 35, price: 0, specialTrait: 'veteranLeader', contractYearsLeft: 1 };
      return { squad: [...squad, legend], message: `은퇴 앞둔 레전드: ${legend.name}이(가) 마지막 시즌을 함께합니다(무료 영입)` };
    },
  },
  {
    id: 'rivalPoach', name: '라이벌의 러브콜', tone: 'bad',
    apply: ({ squad }) => {
      const ace = [...squad].sort((a, b) => b.baseOVR - a.baseOVR)[0];
      if ((ace.contractYearsLeft ?? 2) <= 1) return { message: `라이벌의 러브콜: ${ace.name}이(가) 흔들렸지만 버텼습니다` };
      return {
        squad: squad.map((p) => (p.id === ace.id ? { ...p, contractYearsLeft: 1 } : p)),
        message: `라이벌의 러브콜: ${ace.name}의 계약이 1년 남은 것으로 조정됐습니다`,
      };
    },
  },
  {
    id: 'injuryAftermath', name: '부상 후유증', tone: 'bad',
    apply: ({ squad }, rng) => {
      const target = squad[Math.floor(rng() * squad.length)];
      return {
        squad: squad.map((p) => (p.id === target.id ? { ...p, baseOVR: Math.max(1, p.baseOVR - 3) } : p)),
        message: `부상 후유증: ${target.name}의 OVR -3`,
      };
    },
  },
];

// ctx = { squad, funds, chemistry, baseFunds, crisisImmune }
// bias = { [eventId]: 가중치 배수 } - 구단 색채가 특정 이벤트를 더 자주 부른다.
export function rollSeasonEvent(ctx, phase, rng = Math.random, bias = {}) {
  const none = { id: null, tone: null, message: '', squad: ctx.squad, funds: ctx.funds, chemistry: ctx.chemistry };
  const chance = phase === 'winter' ? EVENT_CHANCE_WINTER : EVENT_CHANCE_SUMMER;
  if (rng() >= chance) return none;

  const weights = EVENTS.map((e) => bias[e.id] ?? 1);
  let pick = rng() * weights.reduce((a, b) => a + b, 0);
  const event = EVENTS.find((_, i) => (pick -= weights[i]) < 0) ?? EVENTS.at(-1);

  if (event.tone === 'bad' && ctx.crisisImmune) {
    return { ...none, id: event.id, tone: 'good', message: `${event.name}: 위기 관리형 감독이 무효화했습니다` };
  }
  const out = event.apply(ctx, rng);
  return {
    id: event.id, tone: event.tone, message: out.message,
    squad: out.squad ?? ctx.squad, funds: out.funds ?? ctx.funds, chemistry: out.chemistry ?? ctx.chemistry,
  };
}
