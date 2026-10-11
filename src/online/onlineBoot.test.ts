import { describe, expect, it } from 'vitest';
import {
  chooseMembership,
  onlineContext,
  readLinkParams,
  withoutInvite,
  type Membership,
} from './onlineBoot';

const master: Membership = { gameId: 'g1', gameName: 'Axis', role: 'master', characterId: null };
const player: Membership = {
  gameId: 'g2',
  gameName: 'Outra',
  role: 'player',
  characterId: 'thorin',
};

describe('invite links', () => {
  it('reads the invite token and the game from the URL', () => {
    const url = new URL('https://mesa.example/?invite=abc&game=g2');
    expect(readLinkParams(url)).toEqual({ invite: 'abc', gameId: 'g2' });
  });

  it('drops only the invite, so a reload does not reuse it', () => {
    const url = new URL('https://mesa.example/axis/?invite=abc&game=g2#x');
    expect(withoutInvite(url)).toBe('https://mesa.example/axis/?game=g2#x');
  });
});

describe('chooseMembership', () => {
  it.each([
    { name: 'the requested game', requested: 'g2', expected: player },
    { name: 'the first game when none is requested', requested: null, expected: master },
    {
      name: 'the first game when the requested one is not theirs',
      requested: 'g9',
      expected: master,
    },
  ])('picks $name', ({ requested, expected }) => {
    expect(chooseMembership([master, player], requested)).toBe(expected);
  });

  it('finds nothing for someone without games', () => {
    expect(chooseMembership([], 'g1')).toBeNull();
  });
});

describe('onlineContext', () => {
  it('acts as the master or as the player character from the login', () => {
    expect(onlineContext(master)).toEqual({ actor: { role: 'master' } });
    expect(onlineContext(player)).toEqual({ actor: { role: 'player', characterId: 'thorin' } });
  });
});
