// Single ESLint flat config for the whole repo (backend: NestJS, frontend: Vue 3).
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/coverage/**', '.claude/**'],
  },

  eslint.configs.recommended,
  ...tseslint.configs.recommended,

  // Shared rules for all TypeScript / JavaScript
  {
    files: ['**/*.{ts,js,mjs,cjs,vue}'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
    },
  },

  // Backend: NestJS (Node, decorators, constructor DI)
  {
    files: ['backend/**/*.ts'],
    languageOptions: { globals: globals.node },
    rules: {
      // Nest DI relies on runtime class references in constructors; type-only imports break it.
      '@typescript-eslint/consistent-type-imports': 'off',
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },

  // Frontend: Vue 3 (browser)
  ...pluginVue.configs['flat/recommended'].map((c) => ({
    ...c,
    files: ['frontend/**/*.{vue,ts,js}'],
  })),
  {
    files: ['frontend/**/*.{vue,ts,js}'],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { parser: tseslint.parser },
    },
    rules: {
      'vue/multi-word-component-names': 'off',
    },
  },

  // Plain Node config files
  {
    files: ['*.{js,mjs,cjs}', '**/*.config.{js,mjs,cjs,ts}'],
    languageOptions: { globals: globals.node },
  },

  // Must be last: disables rules that conflict with Prettier
  prettier,
);
