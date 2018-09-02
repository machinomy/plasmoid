module.exports = {
  verbose: true,
  transform: {
    "^.+\\.tsx?$": "ts-jest"
  },
  testRegex: "(/__tests__/.*|(\\.|/)(test|spec))\\.tsx?$",
  moduleFileExtensions: [
    "ts",
    "tsx",
    "js",
    "jsx",
    "json",
    "node"
  ],
  runner: "truffle-jest/lib/runner",
  globalSetup: "truffle-jest/lib/setup",
  globalTeardown: "truffle-jest/lib/teardown",
  testEnvironment: "truffle-jest/lib/environment"
}
