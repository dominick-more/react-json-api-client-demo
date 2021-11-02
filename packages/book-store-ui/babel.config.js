module.exports = function (api) {
  api.cache(true);
  const config = {
    env: {
      production: {
        plugins: ['babel-plugin-jsx-remove-data-test-id'],
      },
    },
    presets: [
      [
        '@babel/preset-env',
        {
          "useBuiltIns": "entry",
        },
      ],
      '@babel/react',
      '@babel/preset-typescript',
    ],
    plugins: [
      [
        '@babel/plugin-transform-runtime',
        {
          absoluteRuntime: false,
          corejs: 3,
          helpers: true,
          regenerator: true,
        },
        '@babel/plugin-proposal-class-properties',
      ],
    ],
  };
  return config;
};
