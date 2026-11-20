import { Dispatcher, setGlobalDispatcher } from 'undici';

// vitest setupFiles: no test reaches a network. Global fetch and undici's
// global dispatcher (which Node's own fetch uses) refuse every request, so a
// test must install a fake fetch (test/fakeV2.ts, test/contentV2.ts,
// vi.stubGlobal) for the calls it makes; restoring the "original" fetch
// restores this guard.

function refused(target: string): Error {
  return new Error(
    `test tried to reach the network (${target}); install a fake fetch`
  );
}

class RefusingDispatcher extends Dispatcher {
  dispatch(options: Dispatcher.DispatchOptions): boolean {
    throw refused(`${options.method} ${options.origin ?? ''}${options.path}`);
  }

  async close(): Promise<void> {}

  async destroy(): Promise<void> {}
}

setGlobalDispatcher(new RefusingDispatcher());

globalThis.fetch = async (input: string | URL | Request) => {
  throw refused(input instanceof Request ? input.url : String(input));
};
