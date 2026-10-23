/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  moduleNameMapper: { "^(\\.{1,2}/.*)\\.js$": "$1" },
  roots: ["<rootDir>/packages", "<rootDir>/tools", "<rootDir>/services"],
  testMatch: ["**/src/**/*.test.ts"],
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: {
          module: "commonjs",
          moduleResolution: "node",
          esModuleInterop: true,
          resolveJsonModule: true,
          verbatimModuleSyntax: false,
          strict: true,
          noUnusedLocals: true,
          noUnusedParameters: true,
          noUncheckedIndexedAccess: true,
          exactOptionalPropertyTypes: true,
        },
      },
    ],
  },
  collectCoverageFrom: [
    "packages/*/src/**/*.ts",
    "tools/*/src/**/*.ts",
    "services/*/src/**/*.ts",
    "!**/*.test.ts",
    "!**/test-config.ts",
  ],
  coverageThreshold: {
    global: { lines: 80, branches: 70 },
  },
};
