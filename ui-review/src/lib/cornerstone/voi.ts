import { Enums, utilities } from '@cornerstonejs/core';

export type VoiLutMode = 'LINEAR' | 'LINEAR_EXACT' | 'SIGMOID';

export function getVoiLutFunction(mode: VoiLutMode) {
  if (mode === 'SIGMOID') return Enums.VOILUTFunctionType.SAMPLED_SIGMOID;
  if (mode === 'LINEAR_EXACT') return Enums.VOILUTFunctionType.LINEAR_EXACT;
  return Enums.VOILUTFunctionType.LINEAR;
}

export function toVoiRange(windowWidth: number, windowCenter: number, mode: VoiLutMode) {
  return utilities.windowLevel.toLowHighRange(windowWidth, windowCenter, getVoiLutFunction(mode));
}

export function fromVoiRange(lower: number, upper: number, mode: VoiLutMode) {
  if (mode === 'LINEAR_EXACT') {
    return {
      windowWidth: Math.abs(upper - lower),
      windowCenter: (lower + upper) / 2,
    };
  }

  return utilities.windowLevel.toWindowLevel(lower, upper);
}
