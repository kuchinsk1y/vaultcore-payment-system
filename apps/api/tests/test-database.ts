/** Throws unless the URL points at a database whose name ends with "_test". */
export function assertTestDatabase(url: string | undefined): void {
  const name = url ? new URL(url).pathname.replace(/^\//, '').split('?')[0] : '';
  if (!name.endsWith('_test')) {
    throw new Error(
      `Refusing to run tests against database "${name || '(none)'}": tests wipe tables, ` +
        'so the database name must end with "_test" (set TEST_DATABASE_URL).',
    );
  }
}
