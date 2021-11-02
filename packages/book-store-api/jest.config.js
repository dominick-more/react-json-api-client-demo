import { defaults } from 'jest-config';

const defaultExport = {
    ...defaults,
    cacheDirectory: './tmp/jest_cache',
    coverageDirectory: 'coverage',
    roots: ["<rootDir>/src/", "<rootDir>/tests/"],
};

export default defaultExport;