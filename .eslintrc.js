module.exports = {
    root: true,
    parser: '@typescript-eslint/parser',
    plugins: [
        '@typescript-eslint',
    ],
    extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
    ],
    env: {
        node: true,
        jest: true,
    },
    rules: {
        'indent': ['error', 4],
        'semi': ['error', 'always'],
        'quotes': ['error', 'single'],
        'no-multiple-empty-lines': ['error', { 'max': 1, 'maxEOF': 0 }],
        'comma-dangle': ['error', 'always-multiline'],
        'no-trailing-spaces': ['error'],

        '@typescript-eslint/explicit-module-boundary-types': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-unused-vars': [
            'warn',
            {
                'argsIgnorePattern': '^_',
                'varsIgnorePattern': '^_',
                'caughtErrorsIgnorePattern': '^_',
            },
        ],

        'no-inline-comments': 'error',
        'line-comment-position': ['error', { 'position': 'above' }],
        'multiline-comment-style': ['error', 'starred-block'],
        'spaced-comment': ['error', 'always'],
        'capitalized-comments': ['error', 'always'],
        'no-warning-comments': ['error', { 'terms': ['todo', 'fixme', 'hack'], 'location': 'anywhere' }],
        'no-var': 'off',
    },
};
