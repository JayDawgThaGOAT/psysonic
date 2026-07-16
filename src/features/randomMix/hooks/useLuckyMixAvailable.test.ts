import { describe, expect, it } from 'vitest';
import { isLuckyMixAvailable } from '@/features/randomMix/hooks/useLuckyMixAvailable';

describe('isLuckyMixAvailable', () => {
  it('keeps Lucky Mix available when a selected non-active server supports AudioMuse', () => {
    expect(isLuckyMixAvailable({
      activeServerId: 'plain',
      libraryBrowseServerIds: ['plain', 'audio'],
      audiomuseByServer: { plain: false, audio: true },
      showLuckyMixMenu: true,
    })).toBe(true);
  });

  it('does not expose Lucky Mix for an AudioMuse server outside the selected scope', () => {
    expect(isLuckyMixAvailable({
      activeServerId: 'audio',
      libraryBrowseServerIds: ['plain'],
      audiomuseByServer: { plain: false, audio: true },
      showLuckyMixMenu: true,
    })).toBe(false);
  });
});
