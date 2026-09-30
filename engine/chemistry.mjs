import {
  CHEMISTRY_DECAY_PER_TRANSACTION,
  CHEMISTRY_RECOVERY_PER_STABLE_WEEK,
  CHEMISTRY_CURVE,
} from './constants.mjs';

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function chemistryMultiplier(chemistry) {
  const c = clamp(chemistry, 0, 100);
  for (let i = 1; i < CHEMISTRY_CURVE.length; i++) {
    const [x0, y0] = CHEMISTRY_CURVE[i - 1];
    const [x1, y1] = CHEMISTRY_CURVE[i];
    if (c <= x1) return y0 + ((c - x0) / (x1 - x0)) * (y1 - y0);
  }
  return CHEMISTRY_CURVE.at(-1)[1];
}

export function applyTransactionDecay(chemistry, transactionCount, decayPerTransaction = CHEMISTRY_DECAY_PER_TRANSACTION) {
  return clamp(chemistry - transactionCount * decayPerTransaction, 0, 100);
}

export function applyStableWeekRecovery(chemistry, recovery = CHEMISTRY_RECOVERY_PER_STABLE_WEEK) {
  return clamp(chemistry + recovery, 0, 100);
}
