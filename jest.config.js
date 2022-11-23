module.exports = {
  verbose: true,
  collectCoverage: true,
  coverageDirectory: '<rootDir>/build/reports/jest/coverage/backend',
  collectCoverageFrom: ['<rootDir>/build/nodejs/**/*.js'],
  testMatch: ['<rootDir>/build/nodejs/__test__/**/*.(test|spec).js'],
  coveragePathIgnorePatterns: ['<rootDir>/build/nodejs/__test__']
};
