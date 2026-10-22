import nextConfig from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const eslintConfig = [
  {
    ignores: ['next-env.d.ts', '.next/**', 'public/**', '__mocks__/**'],
  },
  ...nextConfig,
  ...nextTypescript,
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    rules: {
      // Phase 1 strictness: surface issues as warnings first, then promote to errors.
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', disallowTypeAnnotations: false },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      curly: ['warn', 'all'],
      eqeqeq: ['warn', 'smart'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'warn',
      'no-var': 'warn',
      'object-shorthand': 'warn',
      'prefer-const': 'warn',
      // React Compiler rules from eslint-plugin-react-hooks 7, which
      // eslint-config-next 16.4 turns on as errors. They flag existing
      // patterns (47 places, mostly setState inside useEffect), not breakage:
      // same phase-1 treatment, warn now and promote once they are fixed.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/error-boundaries': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
    },
  },
  {
    files: ['**/*.test.{ts,tsx,js,jsx}', '**/__tests__/**/*.{ts,tsx,js,jsx}'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: ['src/lib/observability/**/*.{ts,tsx,js,jsx}'],
    rules: {
      'no-console': ['warn', { allow: ['info', 'warn', 'error'] }],
    },
  },
];

export default eslintConfig;
