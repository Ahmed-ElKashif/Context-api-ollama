/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'CommonJS',
          moduleResolution: 'node',
          esModuleInterop: true,
          strict: true,
          skipLibCheck: true,
          types: ['jest']
        },
        // Suppress TS2307 "Cannot find module" for LangGraph subpath exports
        // that 'moduleResolution:node' can't see — Jest's moduleNameMapper
        // resolves them correctly at runtime.
        diagnostics: { ignoreCodes: [2307] }
      }
    ]
  },
  moduleNameMapper: {
    '^@langchain/langgraph/prebuilt$': '<rootDir>/src/__mocks__/langgraph-prebuilt.ts'
  },
  clearMocks: true,
  testTimeout: 15000
}
