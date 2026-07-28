import { describe, expect, it } from 'vitest';
import {
  advanceBatteryHeat,
  getHazardPhase,
  isBufferedJumpReady,
  isOutsideRoom,
  selectInteractionTarget,
} from './rules';

describe('battery thermal rules', () => {
  it('heats, cools, and clamps the key item state', () => {
    expect(advanceBatteryHeat({ heat: 0.4, overheated: false }, 2, 0.1, 0.4, false)).toEqual({
      heat: 0.6000000000000001,
      overheated: false,
    });
    expect(advanceBatteryHeat({ heat: 0.4, overheated: false }, 2, 0.1, 0.4, true)).toEqual({
      heat: 0,
      overheated: false,
    });
    expect(advanceBatteryHeat({ heat: 0.95, overheated: false }, 1, 0.1, 0.4, false)).toEqual({
      heat: 1,
      overheated: true,
    });
  });
});

describe('hazard phases', () => {
  const timings = { warningMs: 1_000, activeMs: 500, recoveryMs: 1_500 };

  it('cycles through telegraph, active, and recovery windows', () => {
    expect(getHazardPhase(500, timings).phase).toBe('warning');
    expect(getHazardPhase(1_200, timings).phase).toBe('active');
    expect(getHazardPhase(2_000, timings).phase).toBe('recovery');
    expect(getHazardPhase(3_200, timings).phase).toBe('warning');
  });
});

describe('interaction targeting', () => {
  it('prioritizes objective-related targets before ordinary proximity', () => {
    const target = selectInteractionTarget(
      [
        { id: 'crate', distance: 20, kind: 'ordinary' },
        { id: 'battery', distance: 70, kind: 'objective' },
      ],
      100,
    );
    expect(target?.id).toBe('battery');
  });

  it('rejects unreachable targets', () => {
    expect(selectInteractionTarget([{ id: 'far', distance: 101, kind: 'objective' }], 100)).toBeUndefined();
  });
});

describe('recovery bounds', () => {
  it('marks escaped objects for recovery', () => {
    expect(isOutsideRoom({ x: 200, y: 200 }, 2_400, 720)).toBe(false);
    expect(isOutsideRoom({ x: 200, y: 900 }, 2_400, 720)).toBe(true);
  });
});

describe('jump assistance', () => {
  it('accepts coyote time and buffered jump only inside their windows', () => {
    expect(isBufferedJumpReady(1_000, 930, 960, 110, 130)).toBe(true);
    expect(isBufferedJumpReady(1_000, 800, 960, 110, 130)).toBe(false);
    expect(isBufferedJumpReady(1_000, 930, 800, 110, 130)).toBe(false);
  });
});
