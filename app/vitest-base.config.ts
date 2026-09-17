import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Component specs drive real focus and keyboard navigation through jsdom, whose style
    // resolution costs milliseconds per element. The slowest suites sit near four seconds
    // locally, so the 5s default leaves no headroom on the slower shared CI runners.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
