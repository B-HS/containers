import eslint from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
    {
        ignores: ['**/.next/**', '**/dist/**', '**/node_modules/**'],
    },
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['**/*.{ts,tsx}'],
        languageOptions: {
            globals: {
                ...globals.browser,
                ...globals.node,
            },
        },
        rules: {
            '@typescript-eslint/no-explicit-any': 'error',
            'no-restricted-syntax': [
                'error',
                {
                    selector: 'FunctionDeclaration',
                    message: 'Arrow functions만 사용합니다.',
                },
                {
                    selector: 'FunctionExpression',
                    message: 'Arrow functions만 사용합니다.',
                },
            ],
        },
    },
)
