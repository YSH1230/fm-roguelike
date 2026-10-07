import { generateProceduralPlayer } from './generate-player.mjs';
import { resolveFfpAudit } from '../engine/events.mjs';
import { SPONSORSHIP_FUNDS_BONUS_RATIO, EVENT_CHANCE_SUMMER, EVENT_CHANCE_WINTER } from '../engine/constants.mjs';

// 시즌 이벤트 풀 18종. 두 갈래다.
//  - 자동 이벤트(EVENTS): apply가 { squad, funds, chemistry, baseFunds, manager }를 받아 바뀐 값과
//    message("이름: 상세" - UI가 ': '로 제목/상세를 나눈다)를 돌려준다. state는 런 상태에 덧붙일 값.
//  - 선택형 이벤트(CHOICES): 2지선다. prepare가 선택에 필요한 값(대상 선수, 유망주 등)을 한 번 정해
//    저장 가능한 payload로 돌려주고, describe/resolve가 그 payload로 화면과 결과를 만든다.
// 같은 이벤트가 다시 나와도 되지만, 최근에 나온 이벤트는 가중치를 낮춘다(RECENT_WEIGHT).
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const RECENT_WEIGHT = 0.15;

const topBy = (squad, key) => [...squad].sort((a, b) => b[key] - a[key])[0];

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
    // 무료 영입이라 가격이 0 - 재계약비가 0원이 되지 않게 재계약 불가로 둔다(noRenewal).
    id: 'retiringLegend', name: '은퇴 앞둔 레전드', tone: 'good',
    apply: ({ squad }, rng) => {
      const legend = { ...generateProceduralPlayer('bigLeaguer', rng), age: 35, price: 0, specialTrait: 'veteranLeader', contractYearsLeft: 1, noRenewal: true };
      return { squad: [...squad, legend], message: `은퇴 앞둔 레전드: ${legend.name}이(가) 마지막 시즌을 함께합니다(무료 영입, 재계약 불가)` };
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
  // ---- 새 자동 이벤트: 태그·감독과 이어지는 것 2종 + 일상 3종
  {
    id: 'tacticalSeminar', name: '전술 세미나', tone: 'good',
    apply: ({ squad, chemistry, manager }) => {
      const tag = manager?.tacticalTag;
      const holders = squad.filter((p) => tag && p.playstyleTags.includes(tag));
      if (!holders.length) return { chemistry: clamp(chemistry + 5, 0, 100), message: '전술 세미나: 감독의 특강으로 팀이 하나가 됩니다. 적응도 +5' };
      const best = topBy(holders, 'baseOVR');
      return {
        squad: squad.map((p) => (p.id === best.id ? { ...p, baseOVR: Math.min(99, p.baseOVR + 2) } : p)),
        message: `전술 세미나: 감독의 특강으로 ${best.name}이(가) 전술을 깨쳤습니다. OVR +2`,
      };
    },
  },
  {
    id: 'analystJoins', name: '전술 분석관 합류', tone: 'good',
    apply: () => ({ state: { harmonyShield: true }, message: '전술 분석관 합류: 다음 감독 불화 검사에서 불화가 나도 페널티와 누적이 면제됩니다' }),
  },
  {
    id: 'localFestival', name: '지역 축제 초청', tone: 'good',
    apply: ({ funds, chemistry, baseFunds }) => {
      const gift = Math.round(baseFunds * 0.05);
      return { funds: funds + gift, chemistry: clamp(chemistry + 3, 0, 100), message: `지역 축제 초청: 지원금 +${gift}G, 적응도 +3` };
    },
  },
  {
    id: 'facilityTrouble', name: '훈련장 시설 고장', tone: 'bad',
    apply: ({ funds, baseFunds }) => {
      const cost = Math.min(funds, Math.round(baseFunds * 0.06));
      return { funds: funds - cost, message: `훈련장 시설 고장: 수리비 -${cost}G` };
    },
  },
  {
    id: 'scandal', name: '선수 SNS 논란', tone: 'bad',
    apply: ({ squad, chemistry }, rng) => {
      const target = squad[Math.floor(rng() * squad.length)];
      return {
        squad: squad.map((p) => (p.id === target.id ? { ...p, baseOVR: Math.max(1, p.baseOVR - 1) } : p)),
        chemistry: clamp(chemistry - 4, 0, 100),
        message: `선수 SNS 논란: ${target.name}의 부적절한 게시물로 분위기가 가라앉았습니다. 적응도 -4, OVR -1`,
      };
    },
  },
];

// 선택형 이벤트. prepare -> payload(저장 가능), describe -> 화면, resolve(optionIndex) -> 자동 이벤트와 같은 결과 모양.
// 두 선택지는 기대값이 비슷하게 맞춰져 있다(일시금 vs 더 큰 나중 보상, 현금 vs 유지 등).
const oldest = (squad) => [...squad].sort((a, b) => b.age - a.age)[0];
const youngest = (squad) => [...squad].sort((a, b) => a.age - b.age)[0];

const CHOICES = [
  {
    id: 'sponsorOffer', name: '스폰서 계약 제안',
    prepare: () => ({}),
    describe: ({ baseFunds }) => ({
      detail: '새 스폰서가 두 가지 조건을 제시했습니다.',
      options: [
        { label: '일시금', hint: `지금 자금 +${Math.round(baseFunds * 0.12)}G` },
        { label: '장기 계약', hint: '다음 시즌 지급액 +22% (시즌이 끝나야 들어옵니다)' },
      ],
    }),
    resolve: ({ funds, baseFunds }, _p, i) => (i === 0
      ? { funds: funds + Math.round(baseFunds * 0.12), message: `스폰서 계약: 일시금 +${Math.round(baseFunds * 0.12)}G` }
      : { state: { nextGrantBonus: 0.22 }, message: '스폰서 계약: 장기 계약으로 다음 시즌 지급액 +22%' }),
  },
  {
    id: 'bigClubOffer', name: '빅클럽의 이적 제안',
    prepare: ({ squad }) => {
      const star = topBy(squad.filter((p) => !p.boughtThisSeason), 'baseOVR') ?? topBy(squad, 'baseOVR');
      return { playerId: star.id };
    },
    describe: ({ squad }, payload) => {
      const p = squad.find((x) => x.id === payload.playerId);
      return {
        detail: p ? `빅클럽이 ${p.name}(OVR ${p.baseOVR})에게 이적을 제안했습니다.` : '빅클럽이 핵심 선수에게 이적을 제안했습니다.',
        options: [
          { label: '보낸다', hint: p ? `이적료 +${Math.round(p.price * 0.85)}G, 선수단에서 제외` : '이적료를 받고 선수단에서 제외' },
          { label: '붙잡는다', hint: '계약 1년 연장(무료), 적응도 +3' },
        ],
      };
    },
    resolve: ({ squad, funds, chemistry }, payload, i) => {
      const p = squad.find((x) => x.id === payload.playerId);
      if (!p) return { message: '빅클럽의 이적 제안: 해당 선수는 이미 선수단에 없습니다' };
      if (i === 0) {
        const fee = Math.round(p.price * 0.85);
        return { squad: squad.filter((x) => x.id !== p.id), funds: funds + fee, leaving: p, message: `빅클럽의 이적 제안: ${p.name} 이적, 이적료 +${fee}G` };
      }
      return {
        squad: squad.map((x) => (x.id === p.id ? { ...x, contractYearsLeft: (x.contractYearsLeft ?? 2) + 1 } : x)),
        chemistry: clamp(chemistry + 3, 0, 100),
        message: `빅클럽의 이적 제안: ${p.name}이(가) 잔류하며 계약이 1년 연장됐습니다. 적응도 +3`,
      };
    },
  },
  {
    id: 'youthTrial', name: '유망주 테스트',
    prepare: (_ctx, rng) => {
      const youth = { ...generateProceduralPlayer('local', rng), age: 18, price: 0, isDraftedYouth: true, specialTrait: null };
      return { youth };
    },
    describe: ({ baseFunds }, payload) => ({
      detail: `${payload.youth.name}(18세, OVR ${payload.youth.baseOVR})이(가) 입단 테스트를 받았습니다. 어린 선수는 시즌마다 크게 성장합니다.`,
      options: [
        { label: '영입', hint: '무료로 선수단에 합류' },
        { label: '사양', hint: `지원금 +${Math.round(baseFunds * 0.04)}G` },
      ],
    }),
    resolve: ({ squad, funds, baseFunds }, payload, i) => (i === 0
      ? { squad: [...squad, payload.youth], message: `유망주 테스트: ${payload.youth.name} 합류(18세, OVR ${payload.youth.baseOVR})` }
      : { funds: funds + Math.round(baseFunds * 0.04), message: `유망주 테스트: 사양하고 지원금 +${Math.round(baseFunds * 0.04)}G` }),
  },
  {
    id: 'lockerClash', name: '라커룸 갈등',
    prepare: ({ squad }) => ({ vetId: oldest(squad).id, rookieId: youngest(squad).id }),
    describe: ({ squad }, payload) => {
      const vet = squad.find((p) => p.id === payload.vetId);
      const rookie = squad.find((p) => p.id === payload.rookieId);
      return {
        detail: `${vet?.name ?? '베테랑'}(${vet?.age ?? '?'}세)과 ${rookie?.name ?? '신예'}(${rookie?.age ?? '?'}세)가 훈련 중 충돌했습니다. 누구 편을 들까요?`,
        options: [
          { label: '베테랑 편', hint: `적응도 +6, ${rookie?.name ?? '신예'} OVR -1` },
          { label: '신예 편', hint: `${rookie?.name ?? '신예'} OVR +2, 적응도 -4` },
        ],
      };
    },
    resolve: ({ squad, chemistry }, payload, i) => {
      const rookie = squad.find((p) => p.id === payload.rookieId);
      const bump = (delta) => squad.map((p) => (p.id === payload.rookieId ? { ...p, baseOVR: clamp(p.baseOVR + delta, 1, 99) } : p));
      if (i === 0) return { squad: rookie ? bump(-1) : squad, chemistry: clamp(chemistry + 6, 0, 100), message: '라커룸 갈등: 베테랑 편을 들어 분위기가 안정됐습니다. 적응도 +6' };
      return { squad: rookie ? bump(2) : squad, chemistry: clamp(chemistry - 4, 0, 100), message: `라커룸 갈등: 신예 편을 들었습니다. ${rookie?.name ?? '신예'} OVR +2, 적응도 -4` };
    },
  },
];

const ALL = [...EVENTS, ...CHOICES];

// ctx = { squad, funds, chemistry, baseFunds, crisisImmune, manager, recent }
// bias = { [eventId]: 가중치 배수 } - 구단 색채가 특정 이벤트를 더 자주 부른다. recent = 최근 나온 이벤트 id들.
export function rollSeasonEvent(ctx, phase, rng = Math.random, bias = {}) {
  const none = { id: null, tone: null, message: '', squad: ctx.squad, funds: ctx.funds, chemistry: ctx.chemistry, state: {}, choice: null };
  const chance = phase === 'winter' ? EVENT_CHANCE_WINTER : EVENT_CHANCE_SUMMER;
  if (rng() >= chance) return none;

  const recent = ctx.recent ?? [];
  const weights = ALL.map((e) => (bias[e.id] ?? 1) * (recent.includes(e.id) ? RECENT_WEIGHT : 1));
  let pick = rng() * weights.reduce((a, b) => a + b, 0);
  const event = ALL.find((_, i) => (pick -= weights[i]) < 0) ?? ALL.at(-1);

  const choice = CHOICES.find((c) => c.id === event.id);
  if (choice) {
    return { ...none, id: event.id, tone: 'choice', message: `${event.name}`, choice: { id: choice.id, payload: choice.prepare(ctx, rng) } };
  }
  if (event.tone === 'bad' && ctx.crisisImmune) {
    return { ...none, id: event.id, tone: 'good', message: `${event.name}: 위기 관리형 감독이 무효화했습니다` };
  }
  const out = event.apply(ctx, rng);
  return {
    id: event.id, tone: event.tone, message: out.message, state: out.state ?? {}, choice: null,
    squad: out.squad ?? ctx.squad, funds: out.funds ?? ctx.funds, chemistry: out.chemistry ?? ctx.chemistry,
  };
}

// 선택형 이벤트 화면 내용: { name, detail, options: [{ label, hint }] }
export function describeChoice(choice, ctx) {
  const def = CHOICES.find((c) => c.id === choice.id);
  if (!def) return null;
  return { name: def.name, ...def.describe(ctx, choice.payload) };
}

// 선택 결과. 자동 이벤트와 같은 모양({ squad, funds, chemistry, state, message, leaving? })으로 돌려준다.
export function resolveChoice(choice, optionIndex, ctx, rng = Math.random) {
  const def = CHOICES.find((c) => c.id === choice.id);
  const out = def.resolve(ctx, choice.payload, optionIndex, rng);
  return {
    message: out.message, state: out.state ?? {}, leaving: out.leaving ?? null,
    squad: out.squad ?? ctx.squad, funds: out.funds ?? ctx.funds, chemistry: out.chemistry ?? ctx.chemistry,
  };
}

export const EVENT_IDS = ALL.map((e) => e.id);
