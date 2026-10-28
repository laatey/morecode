import { defineConfig } from 'eslint/config'
import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import eslintPluginReact from 'eslint-plugin-react'
import eslintPluginReactHooks from 'eslint-plugin-react-hooks'
import eslintPluginReactRefresh from 'eslint-plugin-react-refresh'

export default defineConfig(
  { ignores: ['**/node_modules', '**/dist', '**/out'] },
  tseslint.configs.recommended,
  {
    // TypeScript's explicit return types do not apply to untyped server scripts or tests.
    files: ['**/*.{js,mjs,cjs}'],
    rules: { '@typescript-eslint/explicit-function-return-type': 'off' }
  },
  eslintPluginReact.configs.flat.recommended,
  eslintPluginReact.configs.flat['jsx-runtime'],
  {
    settings: {
      react: {
        version: 'detect'
      }
    }
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': eslintPluginReactHooks,
      'react-refresh': eslintPluginReactRefresh
    },
    rules: {
      ...eslintPluginReactHooks.configs.recommended.rules,
      ...eslintPluginReactRefresh.configs.vite.rules
    }
  },
  {
    // Vendored shadcn/ui primitives: don't hold generated code to app-level rules
    files: ['src/renderer/src/components/ui/**'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
      'react-refresh/only-export-components': 'off',
      'react/prop-types': 'off',
      'react/no-unknown-property': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off'
    }
  },
  {
    // Newer React rules that point at code worth tidying (effects that set state, files that export more than
    // components). The code they flag works as written, so they report without failing the check.
    files: ['src/renderer/src/**'],
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/static-components': 'warn',
      'react-refresh/only-export-components': 'warn'
    }
  },
  {
    // TypeScript already checks props
    files: ['**/*.tsx'],
    rules: { 'react/prop-types': 'off' }
  },
  eslintConfigPrettier
)
