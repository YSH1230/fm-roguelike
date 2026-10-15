// node tools/check-personality.mjs: 성격 규칙 최소 자체 점검
import { benchHalvesNeeded, rollBenchTransferDemand } from '../engine/personality.mjs';
console.assert(benchHalvesNeeded('ambitious', { ambitious: 1 }) === 1 && benchHalvesNeeded('ambitious', { ambitious: -1 }) === 2 && benchHalvesNeeded(null) === 2, 'threshold');
console.assert(rollBenchTransferDemand([{ id: 1, personality: 'loyal' }], { 1: 5 }, {}, () => 0) === null, 'loyal never');
console.log('personality ok');
