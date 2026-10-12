import { describe, expect, it } from 'vitest';
import { bannerLines, lanAddress, main, needsBuild, parsePlayArgs, parsePort, portsFromEnv } from './play.mjs';

describe('npm run play: arguments', () => {
  it('defaults to an automatic build and no help', () => {
    expect(parsePlayArgs([])).toEqual({ build: 'auto', help: false });
  });

  it('reads --build, --no-build and --help', () => {
    expect(parsePlayArgs(['--build']).build).toBe('force');
    expect(parsePlayArgs(['--no-build']).build).toBe('skip');
    expect(parsePlayArgs(['--help']).help).toBe(true);
    expect(parsePlayArgs(['-h']).help).toBe(true);
  });

  it('refuses both build flags and unknown options', () => {
    expect(() => parsePlayArgs(['--build', '--no-build'])).toThrow(/cannot be used together/);
    expect(() => parsePlayArgs(['--no-build', '--build'])).toThrow(/cannot be used together/);
    expect(() => parsePlayArgs(['--port=9'])).toThrow(/Unknown option/);
  });
});

describe('npm run play: ports', () => {
  it('uses web 3000 and world 8797 by default', () => {
    expect(portsFromEnv({})).toEqual({ web: 3000, world: 8797 });
    expect(portsFromEnv({ PLAY_WEB_PORT: '', PLAY_WORLD_PORT: '' })).toEqual({ web: 3000, world: 8797 });
  });

  it('takes the ports from the environment', () => {
    expect(portsFromEnv({ PLAY_WEB_PORT: '3332', PLAY_WORLD_PORT: '8929' })).toEqual({ web: 3332, world: 8929 });
  });

  it('refuses a port that is not a number in range, and two equal ports', () => {
    expect(() => parsePort('abc', 'X')).toThrow(/X must be a port number/);
    expect(() => parsePort('70000', 'X')).toThrow(/between 1 and 65535/);
    expect(() => parsePort('0', 'X')).toThrow(/between 1 and 65535/);
    expect(() => parsePort('80.5', 'X')).toThrow(/port number/);
    expect(() => portsFromEnv({ PLAY_WEB_PORT: '4000', PLAY_WORLD_PORT: '4000' })).toThrow(/must differ/);
  });
});

describe('npm run play: build staleness and addresses', () => {
  it('builds when there is no build, or a source is newer than the build', () => {
    expect(needsBuild(null, 100)).toBe(true);
    expect(needsBuild(200, 100)).toBe(false);
    expect(needsBuild(100, 200)).toBe(true);
    expect(needsBuild(100, null)).toBe(false);
  });

  it('picks the first external IPv4 address, not loopback or IPv6', () => {
    const ifaces = {
      lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
      eth: [{ address: 'fe80::1', family: 'IPv6', internal: false }, { address: '192.168.1.20', family: 'IPv4', internal: false }],
    };
    expect(lanAddress(ifaces)).toBe('192.168.1.20');
    expect(lanAddress({ lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }] })).toBeNull();
    expect(lanAddress({ eth: [{ address: '10.0.0.4', family: 4, internal: false }] })).toBe('10.0.0.4');
  });

  it('prints the local and LAN addresses and how to stop', () => {
    const text = bannerLines({ web: 3000, world: 8797, lan: '192.168.1.20' }).join('\n');
    expect(text).toContain('http://localhost:3000');
    expect(text).toContain('http://192.168.1.20:3000');
    expect(text).toContain('port 8797');
    expect(text).toContain('Ctrl+C');
    expect(bannerLines({ web: 3000, world: 8797, lan: null }).join('\n')).toContain('no network address');
  });
});

describe('npm run play: entry point', () => {
  it('prints usage and exits 0 for --help, and exits 2 on a bad argument without starting anything', async () => {
    expect(await main(['--help'], {} as unknown as NodeJS.ProcessEnv, process.cwd())).toBe(0);
    expect(await main(['--bogus'], {} as unknown as NodeJS.ProcessEnv, process.cwd())).toBe(2);
    expect(await main([], { PLAY_WEB_PORT: 'x' } as unknown as NodeJS.ProcessEnv, process.cwd())).toBe(2);
  });
});
