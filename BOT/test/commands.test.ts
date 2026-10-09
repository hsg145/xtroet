import { describe, expect, it } from 'vitest';
import { normalizeArabic, parseCommand, parseTarget, COMMAND_ALIASES } from '../src/core/commands.js';

describe('normalizeArabic', () => {
  it('strips tashkeel', () => {
    expect(normalizeArabic('رَتَبَة')).toBe('رتبه');
    expect(normalizeArabic('مُحَمَّد')).toBe('محمد');
  });

  it('strips tatweel', () => {
    expect(normalizeArabic('رتـــبة')).toBe('رتبه');
  });

  it('folds alef variants', () => {
    expect(normalizeArabic('أ')).toBe(normalizeArabic('ا'));
    expect(normalizeArabic('إ')).toBe(normalizeArabic('ا'));
    expect(normalizeArabic('آ')).toBe(normalizeArabic('ا'));
  });

  it('folds alef maqsura to ya and ta marbuta to ha', () => {
    expect(normalizeArabic('مصطفى')).toBe(normalizeArabic('مصطفي'));
    expect(normalizeArabic('رتبة')).toBe('رتبه');
  });

  it('lowercases and trims', () => {
    expect(normalizeArabic('  TOP  ')).toBe('top');
    expect(normalizeArabic('Rank')).toBe('rank');
  });
});

describe('command aliases', () => {
  const parse = (input: string) => parseCommand(input, '!', COMMAND_ALIASES);

  it('maps !رتبتي to the rank command (the primary spelling)', () => {
    expect(COMMAND_ALIASES['رتبتي']).toBe('rank');
    for (const input of ['!رتبتي', '!رتبتي  ', ' !رتبتي']) {
      expect(parse(input)?.name, input).toBe('rank');
    }
  });

  it('does not confuse !رتب (ladder) with !رتبتي (own rank)', () => {
    expect(parse('!رتبتي')?.name).toBe('rank');
    expect(parse('!رتب')?.name).toBe('ranks');
  });

  it('matches all Arabic spellings of !رتبة', () => {
    for (const input of ['!رتبة', '!رتبه', '!رتبتي', '!رتبة  ', ' !رتبه']) {
      expect(parse(input)?.name, input).toBe('rank');
    }
  });

  it('matches !توب and its aliases', () => {
    for (const input of ['!توب', '!Top', '!TOP', '!top', '!المتصدرين', '!المتصدرون']) {
      expect(parse(input)?.name, input).toBe('top');
    }
  });

  it('matches the ranks list command', () => {
    for (const input of ['!رتب', '!ranks', '!الرتب']) {
      expect(parse(input)?.name, input).toBe('ranks');
    }
  });

  it('matches admin commands and their Arabic aliases', () => {
    expect(parse('!addpts foo 50')?.name).toBe('addpts');
    expect(parse('!اضافة foo 50')?.name).toBe('addpts');
    expect(parse('!setpts foo 50')?.name).toBe('setpts');
    expect(parse('!تعيين foo 50')?.name).toBe('setpts');
    expect(parse('!resetuser foo')?.name).toBe('resetuser');
    expect(parse('!تصفير foo')?.name).toBe('resetuser');
    expect(parse('!ranksbot')?.name).toBe('status');
  });

  it('keeps arguments separate', () => {
    const m = parse('!رتبة @someone');
    expect(m?.name).toBe('rank');
    expect(m?.args).toEqual(['@someone']);
  });

  it('reports unknown commands without throwing', () => {
    const m = parse('!نقاط');
    expect(m?.name).toBe('unknown');
  });

  it('never registers !نقاط or !points (BotRix owns them)', () => {
    expect(COMMAND_ALIASES['نقاط']).toBeUndefined();
    expect(COMMAND_ALIASES['نقاط ']).toBeUndefined();
    expect(COMMAND_ALIASES.points).toBeUndefined();
    expect(parse('!نقاط')?.name).toBe('unknown');
    expect(parse('!points')?.name).toBe('unknown');
  });

  it('ignores messages without the prefix', () => {
    expect(parse('مرحبا')).toBeNull();
    expect(parse('')).toBeNull();
    expect(parse('!')).toBeNull();
  });

  it('respects a custom prefix', () => {
    expect(parseCommand('.رتبة', '.', COMMAND_ALIASES)?.name).toBe('rank');
    expect(parseCommand('!رتبة', '.', COMMAND_ALIASES)).toBeNull();
  });
});

describe('parseTarget', () => {
  it('strips @ and normalizes', () => {
    expect(parseTarget('@Ahmed')).toBe('ahmed');
    expect(parseTarget('  @مصطفى ')).toBe('مصطفي');
  });

  it('returns null for empty input', () => {
    expect(parseTarget(undefined)).toBeNull();
    expect(parseTarget('  @  ')).toBeNull();
  });
});