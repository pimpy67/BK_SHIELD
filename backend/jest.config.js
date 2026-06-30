module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  testTimeout: 20000,
  forceExit: true,
  resolver: '<rootDir>/jest.resolver.js',
};
