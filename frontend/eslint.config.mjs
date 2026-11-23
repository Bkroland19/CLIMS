import js from '@eslint/js';
import next from '@next/eslint-plugin-next';
import queryPlugin from '@tanstack/eslint-plugin-query';
import prettier from 'eslint-config-prettier';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // `design/` holds the prototype pulled from Claude Design: reference only, never imported.
  // `test-results`, `playwright-report` and `.next-e2e` are written by npm run test:e2e.
  {
    ignores: [
      '.next',
      'coverage',
      'node_modules',
      'next-env.d.ts',
      'design',
      'test-results',
      'playwright-report',
      '.next-e2e',
    ],
  },

  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
      react.configs.flat.recommended,
      react.configs.flat['jsx-runtime'],
      reactHooks.configs.flat['recommended-latest'],
      next.configs['core-web-vitals'],
      jsxA11y.flatConfigs.recommended,
      ...queryPlugin.configs['flat/recommended'],
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      // The session token and API payloads are the security boundary of this
      // app; an `any` there turns a contract mismatch into a runtime surprise.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // Numbers in template strings are unambiguous; the rule's default also
      // rejects them, which only produces `String(n)` noise.
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      // React event props are typed `() => void`; handing them an async
      // handler is the normal pattern and the promise is handled inside it.
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      // For strings, `||` is usually deliberate: an empty value should fall
      // back just like a missing one.
      '@typescript-eslint/prefer-nullish-coalescing': [
        'error',
        { ignorePrimitives: { string: true } },
      ],
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
      'react/prop-types': 'off',
      'react/jsx-no-useless-fragment': 'error',
      'react/self-closing-comp': 'error',
    },
  },

  {
    // CLIMS practices 3/5/18: feature screens compose the shared controls.
    files: [
      'src/features/**/*.tsx',
      'src/components/**/*.tsx',
      'src/navigation/**/*.tsx',
      'src/app/**/*.tsx',
    ],
    ignores: ['src/components/ui/**', '**/*.test.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...['button', 'input', 'select', 'textarea'].map((name) => ({
          selector: `JSXOpeningElement[name.name='${name}']`,
          message:
            'Use the shared Button, Input, Select, Textarea, Checkbox or Radio component. See practices.md.',
        })),
      ],
    },
  },
  {
    files: [
      'src/features/**/*.tsx',
      'src/components/**/*.tsx',
      'src/navigation/**/*.tsx',
      'src/app/**/*.tsx',
    ],
    ignores: ['src/components/ui/**', 'src/components/data-table/**', '**/*.test.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/components/ui/table', '**/ui/table'],
              message:
                'Use DataTable (list or embedded), so filtering, states and accessibility stay consistent.',
            },
          ],
        },
      ],
      // Include the control rules here too: flat-config rules replace, rather than append.
      'no-restricted-syntax': [
        'error',
        ...['button', 'input', 'select', 'textarea', 'table', 'Table'].map((name) => ({
          selector: `JSXOpeningElement[name.name='${name}']`,
          message:
            name === 'table' || name === 'Table'
              ? 'Use the shared DataTable. See practices.md.'
              : 'Use a shared control component. See practices.md.',
        })),
      ],
    },
  },

  {
    files: ['**/*.test.{ts,tsx}', 'src/test/**'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      // Test doubles are deliberately partial.
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },

  {
    // Playwright end-to-end tests run in Node and drive the browser from outside.
    files: ['e2e/**/*.ts'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },

  {
    // Generated by the shadcn CLI and kept close to upstream so `shadcn diff`
    // stays readable. Correctness, hooks and accessibility rules still apply;
    // only style preferences are waived.
    files: ['src/components/ui/**/*.tsx'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
      '@typescript-eslint/no-confusing-void-expression': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/no-unnecessary-type-conversion': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/array-type': 'off',
      '@typescript-eslint/consistent-indexed-object-style': 'off',
      '@typescript-eslint/no-unnecessary-template-expression': 'off',
      '@typescript-eslint/no-deprecated': 'off',
      '@typescript-eslint/prefer-optional-chain': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      'react/no-unknown-property': 'off',
      '@typescript-eslint/consistent-type-definitions': 'off',
      // chart.tsx reads Recharts' loosely typed tooltip payloads.
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      // Upstream uses the `== null` idiom to match both null and undefined.
      eqeqeq: 'off',
      // Link primitives receive their content through spread `children`,
      // which the rule cannot see.
      'jsx-a11y/anchor-has-content': 'off',
    },
  },

  {
    // Development tooling that runs in Node (with its types stripped) and is
    // never bundled. Same type-checked rules as the app, Node globals, and it
    // may log to the terminal.
    files: ['dev/**/*.mts'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.node,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      eqeqeq: ['error', 'always'],
    },
  },

  {
    files: ['*.config.{js,mjs,ts,mts}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { globals: globals.node },
  },

  prettier,
);
