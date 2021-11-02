exports = module.exports = {
  env: {
    commonjs: true,
    node: true,
    es2020: true,
  },
  extends: [
    'airbnb-base',
    'plugin:jest/recommended',
    'plugin:prettier/recommended',

  ],
  parserOptions: {
    ecmaVersion : 11,
    sourceType: "module",
  },
  plugins: [
    'jest',
    'prettier',
  ],
  rules: {
    'import/no-unresolved': ['error', {commonjs: true, amd: true}],
    'arrow-body-style': ['off', 'as-needed'],
    'import/prefer-default-export': 'off',
    'linebreak-style': 'off',
    'no-unused-vars': [
      'off',
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
  },
  settings: {
    "import/resolver": {
      node: {
        extensions: [ '.js', '.json'],
        moduleDirectory: ['node_modules', './src/', './tests/'],
      }
    },
  },
};
