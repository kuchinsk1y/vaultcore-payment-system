import { render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import en from '../../messages/en.json';

/** Renders with the real English messages, so tests exercise the actual copy and ICU formatting. */
export function renderWithIntl(ui: React.ReactElement, locale = 'en', messages: Record<string, unknown> = en) {
  const wrap = (node: React.ReactElement) => (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {node}
    </NextIntlClientProvider>
  );

  const result = render(wrap(ui));
  return { ...result, rerender: (next: React.ReactElement) => result.rerender(wrap(next)) };
}
