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
        // Basic rules for consistency
        'indent': ['error', 4], // Enforce 4-space indentation
        'semi': ['error', 'always'], // Require semicolons
        'quotes': ['error', 'single'], // Prefer single quotes
        'no-multiple-empty-lines': ['error', { 'max': 1, 'maxEOF': 0 }], // No more than 1 empty line
        'comma-dangle': ['error', 'always-multiline'], // Enforce trailing commas
        'no-trailing-spaces': ['error'], // Disallow trailing spaces

        // TypeScript specific rules (overrides or additions)
        '@typescript-eslint/explicit-module-boundary-types': 'off', // Allow implicit return types for functions
        '@typescript-eslint/no-explicit-any': 'off', // Allow 'any' type
        '@typescript-eslint/no-unused-vars': [ // Configure no-unused-vars to ignore underscore-prefixed vars
            'warn',
            {
                'argsIgnorePattern': '^_',
                'varsIgnorePattern': '^_',
                'caughtErrorsIgnorePattern': '^_',
            },
        ],

        // Rule to disallow comment lines - This is a very strict set of rules
        'no-inline-comments': 'error', // Disallow comments on the same line as code
        'line-comment-position': ['error', { 'position': 'above' }], // Enforce position of line comments
        'multiline-comment-style': ['error', 'starred-block'], // Enforce consistent style for multiline comments
        'spaced-comment': ['error', 'always'], // Enforce consistent spacing after comment markers
        'capitalized-comments': ['error', 'always'], // Enforce or disallow capitalization of the first letter of a comment
        'no-warning-comments': ['error', { 'terms': ['todo', 'fixme', 'hack'], 'location': 'anywhere' }], // Disallow specific warning comments
    },
};
