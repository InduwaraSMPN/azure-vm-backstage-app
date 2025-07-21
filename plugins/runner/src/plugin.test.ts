import { runnerPlugin } from './plugin';

describe('runner', () => {
  it('should export plugin', () => {
    expect(runnerPlugin).toBeDefined();
  });
});
