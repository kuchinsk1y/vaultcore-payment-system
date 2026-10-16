import { describe, expect, it } from 'vitest';
import de from '../../messages/de.json';
import en from '../../messages/en.json';
import pl from '../../messages/pl.json';
import ru from '../../messages/ru.json';

const flatten = (value: unknown, prefix = ''): string[] =>
  value && typeof value === 'object'
    ? Object.entries(value).flatMap(([key, child]) => flatten(child, `${prefix}${key}.`))
    : [prefix.slice(0, -1)];

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)/g)].map((m) => m[1]).sort();

const get = (obj: unknown, path: string) => path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], obj);

describe('translations', () => {
  const keys = flatten(en);

  it.each([
    ['ru', ru],
    ['de', de],
    ['pl', pl],
  ])('%s defines exactly the same keys as English', (_name, messages) => {
    expect(flatten(messages).sort()).toEqual([...keys].sort());
  });

  it.each([
    ['ru', ru],
    ['de', de],
    ['pl', pl],
  ])('%s uses the same {placeholders} as English in every message', (_name, messages) => {
    for (const key of keys) {
      expect(placeholders(String(get(messages, key))), key).toEqual(placeholders(String(get(en, key))));
    }
  });

  it('has no empty messages', () => {
    for (const messages of [en, ru, de, pl]) {
      for (const key of keys) expect(String(get(messages, key)).trim(), key).not.toBe('');
    }
  });
});
