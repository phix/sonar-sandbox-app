import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      // lcov is what Sonar reads; text-summary is what a human reads in the log.
      reporter: ['text-summary', 'lcov'],
      reportsDirectory: 'coverage',
      // Every source file, not just the ones a test happens to import. A file
      // no test touches must report as 0% rather than be absent — absent reads
      // to Sonar as "no coverage data", which is not the same claim.
      include: ['src/**/*.js'],
      all: true,
      exclude: ['src/server.js']
    }
  }
});
