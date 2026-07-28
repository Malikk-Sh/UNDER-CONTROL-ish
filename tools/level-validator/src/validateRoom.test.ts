import { describe, expect, it } from 'vitest';
import { factoryRoom } from '@under-control/shared';
import { validateRoom } from './validateRoom';

describe('room validator', () => {
  it('accepts the canonical hot delivery room', () => {
    expect(validateRoom(factoryRoom)).toMatchObject({ valid: true, issues: [] });
  });

  it('rejects a key item without a recovery route', () => {
    const invalid = {
      ...factoryRoom,
      coolingZones: [],
    };
    expect(validateRoom(invalid).issues.map(({ code }) => code)).toContain('recovery.zone_missing');
  });
});
