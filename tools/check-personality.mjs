// node tools/check-personality.mjs: 성격 규칙 최소 자체 점검
import { personalityReaction, benchHalvesNeeded, rollBenchTransferDemand } from '../engine/personality.mjs';
const sq = [{ personality: 'ambitious' }, { personality: 'loyal' }, { personality: 'loyal' }, {}];
const r = personalityReaction('roar', sq); // roar = pressure: 야심 +1, 충성 −1×2 → −1
console.assert(r.delta === -1 && r.byType.ambitious === 1 && r.byType.loyal === -1, 'reaction', r);
console.assert(personalityReaction('cheer', sq).delta === 2, 'cap'); // warm: 충성 +2
console.assert(benchHalvesNeeded('ambitious', { ambitious: 1 }) === 1 && benchHalvesNeeded('ambitious', { ambitious: -1 }) === 2 && benchHalvesNeeded(null) === 2, 'threshold');
console.assert(rollBenchTransferDemand([{ id: 1, personality: 'loyal' }], { 1: 5 }, {}, () => 0) === null, 'loyal never');
console.log('personality ok');
