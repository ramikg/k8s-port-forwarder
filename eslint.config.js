// Based on the ESLint configuration from the gnome-shell-extension repository

import {defineConfig} from '@eslint/config-helpers';
import gnome from 'eslint-config-gnome';
import tseslint from 'typescript-eslint';

export default defineConfig(
    {
        ignores: ['dist/**'],
    },
    {
        extends: [
            gnome.configs.recommended,
            gnome.configs.jsdoc,
            ...tseslint.configs.strict,
        ],
        languageOptions: {
            parserOptions: {
                project: './tsconfig.json',
            },
            globals: {
                global: 'readonly',
            },
        },
        rules: {
            // Deprecated and will be deleted in ESLint 11.
            'nonblock-statement-body-position': 'off',
            camelcase: [
                'error',
                {
                    properties: 'never',
                },
            ],
            'consistent-return': 'error',
            eqeqeq: ['error', 'smart'],
            'key-spacing': [
                'error',
                {
                    mode: 'minimum',
                    beforeColon: false,
                    afterColon: true,
                },
            ],
            'prefer-arrow-callback': 'error',
            'prefer-const': [
                'error',
                {
                    destructuring: 'all',
                },
            ],
            'jsdoc/require-param-description': 'off',
            'jsdoc/require-jsdoc': [
                'error',
                {
                    exemptEmptyFunctions: true,
                    publicOnly: {
                        esm: true,
                    },
                },
            ],
        },
    },
    {
        files: ['eslint.config.js'],
        languageOptions: {
            parserOptions: {
                project: null,
            },
        },
    }
);
