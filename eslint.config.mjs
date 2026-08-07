import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['File Hierarchy.js', 'node_modules/', 'mock-test.js'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // The test suite drives the translator against a mocked Zotero, whose
      // whole point is that it is an untyped host API.
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
)
