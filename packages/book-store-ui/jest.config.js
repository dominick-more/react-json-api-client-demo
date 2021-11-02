/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
  cacheDirectory: '<rootDir>/tmp/jest_cache',
  clearMocks: true,
  coverageDirectory: '<rootDir>/coverage',
  moduleFileExtensions: ["js", "json", "jsx", "ts", "tsx", "node"],
  moduleNameMapper: {
    "\\.(jpg|jpeg|png|gif|svg)$": "<rootDir>/tests/mocks/fileMock.ts",
    "\\.(css)$": "identity-obj-proxy",
    "^~/(.*)": "<rootDir>/src/$1",
  },
  preset: 'ts-jest',
  setupFilesAfterEnv: ['<rootDir>/tests/jestSetup.ts'],
  testEnvironment: 'jest-environment-jsdom',
  testMatch: ["<rootDir>/tests/unit/**/*.test.(t|j)s?(x)"],
};