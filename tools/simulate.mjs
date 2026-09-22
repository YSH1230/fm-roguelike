// tools/simulate.mjs
import { computeTeamPower, applyVariance } from '../engine/team-power.mjs';
import { convertPowerToPoints, getLeagueTier } from '../engine/league.mjs';

const POSITIONS_11 = ['GK', 'CB', 'CB', 'WB', 'WB', 'CMF', 'CMF', 'AMF', 'W', 'W', 'ST'];

function randomInRange([min, max]) {
  return min + Math.random() * (max - min);
}

function makeRandomLineup(ovrRange) {
  return POSITIONS_11.map((position, i) => ({
    id: `sim-${i}`,
    baseOVR: Math.round(randomInRange(ovrRange)),
    age: 20 + Math.round(Math.random() * 15),
    position,
    playstyleTags: [],
    continentTag: null,
    specialTrait: null,
    isDraftedYouth: false,
    seasonsAtClub: 0,
    acquiredThisSeason: false,
    inBench: false,
  }));
}

function runSimulation(tierId, managerTier, chemistry, runs = 100) {
  const tier = getLeagueTier(tierId);
  const leagueAverageOVR = (tier.averageOVR[0] + tier.averageOVR[1]) / 2;

  const pointsResults = [];
  for (let i = 0; i < runs; i++) {
    const lineup = makeRandomLineup(tier.averageOVR);
    const basePower = computeTeamPower(lineup, [], managerTier, chemistry);
    const finalPower = applyVariance(basePower, 0.05);
    pointsResults.push(convertPowerToPoints(finalPower, leagueAverageOVR));
  }

  const avg = pointsResults.reduce((a, b) => a + b, 0) / pointsResults.length;
  const min = Math.min(...pointsResults);
  const max = Math.max(...pointsResults);
  const safeRate =
    pointsResults.filter((p) => p >= tier.safePoints).length / pointsResults.length;

  console.log(`--- ${tierId} / 감독:${managerTier} / 적응도:${chemistry} (${runs}회) ---`);
  console.log(`승점 평균: ${avg.toFixed(1)}, 최소: ${min.toFixed(1)}, 최대: ${max.toFixed(1)}`);
  console.log(`안전 승점(${tier.safePoints}) 이상 달성률: ${(safeRate * 100).toFixed(1)}%`);
}

runSimulation('tier5', 'rookie', 60);
runSimulation('tier5', 'tactician', 80);
