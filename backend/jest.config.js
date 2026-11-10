/** Unit tests live next to the code as `*.spec.ts`. */
module.exports = {
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  // @nestjs/jwt ships ESM only, so it is compiled to CommonJS too. @nestjs/typeorm also needs
  // `import.meta`, which cannot be compiled: it is replaced by a stub (see src/testing).
  moduleNameMapper: { '^@nestjs/typeorm$': '<rootDir>/testing/nestjs-typeorm.stub.ts' },
  transform: {
    '^.+\\.[tj]s$': [
      'ts-jest',
      { tsconfig: '<rootDir>/../tsconfig.json', diagnostics: false, useESM: false },
    ],
  },
  transformIgnorePatterns: ['/node_modules/(?!(@nestjs/jwt)/)'],
  moduleFileExtensions: ['js', 'json', 'ts'],
  testEnvironment: 'node',
  collectCoverageFrom: ['**/*.ts', '!**/*.spec.ts', '!main.ts', '!testing/**', '!**/*.module.ts'],
  coverageDirectory: '../coverage',
};
