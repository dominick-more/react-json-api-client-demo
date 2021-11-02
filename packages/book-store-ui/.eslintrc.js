module.exports = {
  env: {
    browser: true
  },
  extends: [
    'airbnb',
    'airbnb-typescript',
    'plugin:jest/recommended',
    'plugin:prettier/recommended',
    'plugin:react/recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaFeatures: {
      jsx: true,
    },
    ecmaVersion: 12,
    project: './tsconfig.json',
    sourceType: 'module',
  },
  plugins: [
    'jest',
    'prettier',
    'react',
    '@typescript-eslint',
  ],
  rules: {
    'arrow-body-style': ['off', 'as-needed'],
    'import/prefer-default-export': 'off',
    'jsx-a11y/label-has-associated-control': 'off',
    'linebreak-style': 'off',
    'react/no-unused-prop-types': [
      'off',
      {
        'skipShapeProps': true,
      }
    ],
    'react/require-default-props': 'off',
    'no-unused-vars': [
      'error',
      {
        'vars': 'all',
        'args': 'after-used',
        'ignoreRestSiblings': false
      },
    ],
    '@typescript-eslint/no-unused-vars': [
      'warn',
      {
        'vars': 'all',
        'args': 'after-used',
        'ignoreRestSiblings': false
      },
    ],
    'object-curly-newline': [
      'error',
      {
        'ObjectPattern': {
          'multiline': true,
        },
      },
    ],
    'prettier/prettier': [
      'error',
      {
        'endOfLine': 'auto',
      }
    ],
    'react/jsx-props-no-spreading': [
      'error',
      {
        'custom': 'enforce',
        'explicitSpread': 'enforce',
        'html': 'ignore',
      },
    ],
  },
  settings: {
    'import/resolver': {
      alias: {
        map: [['~', './src/']],
        extensions: [, '.js', '.jsx', '.ts', '.tsx'],
      },
    },
  },
};
