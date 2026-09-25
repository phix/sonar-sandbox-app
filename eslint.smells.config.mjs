// Local stand-in for a SonarQube scan.
//
// Every rule below is the same analyzer implementation SonarQube runs, exposed
// as an ESLint rule, keyed back to the Sonar rule key it corresponds to. It is
// a pre-flight check, not a replacement: it proves a planted smell is real
// before a scan is spent on it, and catches a catalogue entry that silently
// stopped firing after an edit.
//
//   npm run smells:verify
import sonarjs from 'eslint-plugin-sonarjs';
import tseslint from 'typescript-eslint';

// sonar_rule_key -> the local rule that implements it.
export const RULE_MAP = {
  'javascript:S1481': 'sonarjs/no-unused-vars',
  'javascript:S1128': 'sonarjs/unused-import',
  'javascript:S3504': 'no-var',
  'javascript:S1854': 'sonarjs/no-dead-store',
  'javascript:S3776': 'sonarjs/cognitive-complexity',
  'javascript:S4144': 'sonarjs/no-identical-functions',
  'javascript:S2004': 'sonarjs/no-nested-functions',
  'javascript:S1121': 'sonarjs/no-nested-assignment',
  'typescript:S1128': 'sonarjs/unused-import',
  'typescript:S3504': 'no-var',
  'typescript:S3776': 'sonarjs/cognitive-complexity',
  'typescript:S4144': 'sonarjs/no-identical-functions',
  'typescript:S3358': 'sonarjs/no-nested-conditional',
  'typescript:S6606': '@typescript-eslint/prefer-nullish-coalescing'
};

// Thresholds must match the default Sonar way quality profile, or the local
// check disagrees with the scan for a reason that has nothing to do with code.
const SONAR_WAY = {
  'sonarjs/cognitive-complexity': ['error', 15],
  'sonarjs/no-nested-functions': ['error', { threshold: 5 }],
  'sonarjs/no-identical-functions': 'error',
  'sonarjs/no-dead-store': 'error',
  'sonarjs/unused-import': 'error',
  'sonarjs/no-nested-assignment': 'error',
  'sonarjs/no-nested-conditional': 'error',
  'no-var': 'error'
};

export default [
  { ignores: ['**/dist/**', '**/node_modules/**', '**/.angular/**', 'web/public/**'] },
  {
    files: ['api/src/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module' },
    plugins: { sonarjs },
    rules: { ...SONAR_WAY, 'sonarjs/no-unused-vars': 'error' }
  },
  {
    files: ['web/src/**/*.ts'],
    ignores: ['**/*.spec.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { project: './web/tsconfig.app.json', tsconfigRootDir: import.meta.dirname }
    },
    plugins: { sonarjs, '@typescript-eslint': tseslint.plugin },
    rules: {
      ...SONAR_WAY,
      // Sonar's S6606 ignores primitives on purpose — '' and 0 are legitimate
      // falsy values you might genuinely mean to replace. Matching that here
      // keeps the local oracle from being more eager than the scan, which is
      // exactly how the first PR scan disagreed with it.
      '@typescript-eslint/prefer-nullish-coalescing': ['error', { ignorePrimitives: true }]
    }
  }
];
