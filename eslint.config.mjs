import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { FlatCompat } from '@eslint/eslintrc'

/**
 * Configuração plana do ESLint 9.
 *
 * O `next lint` foi descontinuado e sai no Next 16, então o lint passa a
 * rodar pela CLI do ESLint. O `eslint-config-next` ainda é publicado no
 * formato antigo (eslintrc), por isso o FlatCompat faz a tradução.
 */
const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) })

const config = [
  {
    ignores: ['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'coverage/**'],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript', 'prettier'),
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
]

export default config
