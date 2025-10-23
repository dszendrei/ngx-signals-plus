import {
  InjectionToken,
  Injector,
  NgModule,
  Signal,
  createNgModule,
  isSignal,
  signal,
} from '@angular/core';
import { deepComputed, getState } from '@ngrx/signals';
import { STATE_SOURCE } from '@ngrx/signals/src/state-source';

/**
 * A utility type to create a mock of a SignalStore for testing purposes.
 * Has the same representations as the real store, except the STATE_SOURCE symbol is removed.
 */
export type MockSignalStore<T extends new (...args: unknown[]) => unknown> =
  Omit<InstanceType<T>, typeof STATE_SOURCE>;

type AnyFn = (...args: any[]) => unknown;

type MethodKeys<T> = {
  [K in keyof T]: T[K] extends AnyFn
    ? T[K] extends Signal<unknown>
      ? never
      : K
    : never;
}[keyof T];

type SelectorKeys<T> = Exclude<keyof T, MethodKeys<T>>;

/**
 * A utility type to extract the selectors of a signal store.
 */
export type MockSelectorOverrides<T> = Partial<Pick<T, SelectorKeys<T>>>;

/**
 * A utility type to extract the methods of a signal store and convert them to mocks.
 */
export type MockMethodOverrides<T> = Partial<{
  [K in MethodKeys<T>]: T[K] extends (...args: infer A) => infer R
    ? (...args: A) => R
    : never;
}>;

/**
 * createSignalStoreMock
 * ---------------------
 * Builds a lightweight mock instance of an @ngrx/signals SignalStore.
 *
 * What it does:
 * 1. Instantiates the provided store class (storeConstructor).
 * 2. Extracts its current plain state via getState.
 * 3. Mocks every inject() calls without the injection context (in case of an injected dependency in the withMethods).
 * 4. Wraps every top-level state property in a signal (signalifiedState).
 * 5. Applies selector overrides (overrideSelectors):
 *    - All overridden selector entries are returned the provided signals.
 *    - So in the tests calling the set method on the provided signal will update the value in the store.
 * 6. Creates a deepComputed signal (deepSignal) that unwraps those selector signals to
 *    expose a read-only DeepSignal as how the real store would.
 *    This keeps dependency tracking so updates propagate.
 * 7. Attaches method overrides (overrideMethods) as supplied mock instances to mock the withMethods functions.
 * 8. Auto-mocks any remaining functions (that are not signals).
 *    - Detects availability of jest.fn() or jasmine.createSpy().
 *    - If neither is available, creates a stub: (...args: any[]) => {};.
 * 9. Returns the composite object typed as MockSignalStore<T> (original instance shape minus STATE_SOURCE).
 * 10. Supports additional providers to be injected in the withState factory function in case the withState is resolved
 *     with an injected factory function. You can use the InjectionToken directly or a provider with the useFactory.
 *
 *
 * Why deepComputed?
 * - It returns a DeepSignal just like the real SignalStore.
 * - Consumers expecting the real store read selectors like plain values through
 *   the deep signal; tests can still mutate underlying signals directly.
 *
 * Typing details:
 * - MockSelectorOverrides<T>: only non-method keys (selectors/state slices). Use `deepComputed` for complex objects.
 * - MockMethodOverrides<T>: only method keys, each replaced by a provided jasmine or jest mock.
 *
 * @example
 * Typical usage:
 * ```typescript
 * const MyStore = signalStore(
 *   withState({ status: Status.Initial, error?: { code: number, message: string } }),
 *   withMethods(store => ({update: ...}) )
 * );
 *
 * const status = signal(Status.Initial);
 * const error = signal<{ code: number; message: string } | undefined>(undefined);
 * const update = **jest or jasmine spy**;
 *
 * const store = createSignalStoreMock(MyStore, {
 *   overrideSelectors: { status, deepComputed(error) },
 *   overrideMethods: { update }
 * });
 *
 * status.set(Status.Ready); // mutate
 * expect(store.update).toHaveBeenCalled();
 * ```
 *
 * ### If the withState is using an injected factory function:
 * ```typescript
 * const initialInjectedState = {
 *   featureString: 'initial',
 *   featureNumber: 0,
 * };
 *
 * const INJECTED_STATE = new InjectionToken<{
 *   featureString: string;
 *   featureNumber: number;
 * }>('InjectedState', {
 *   factory: () => initialInjectedState,
 * });
 *
 * const MyStore = signalStore(
 *   withState(() => inject(INJECTED_STATE)),
 *   ...
 * );
 *
 * // Option A — pass the InjectionToken with the factory function:
 * const mockA = createSignalStoreMock(MyStore, {
 *   providers: [INJECTED_STATE]
 * });
 *
 * // Option B — pass a provider with useFactory (explicit):
 * const mockB = createSignalStoreMock(MyStore, {
 *   providers: [{provide: INJECTED_STATE, useFactory: () => initialInjectedState}],
 * });
 * ```
 *
 * @typeParam T - The constructor type of the store being mocked.
 * @param storeConstructor The concrete SignalStore class to mock.
 * @param overrides Optional selector and/or method and/or providers overrides.
 * @returns A mock store object mirroring the public API (minus STATE_SOURCE).
 */
export function createSignalStoreMock<
  T extends new (...args: unknown[]) => any
>(
  storeConstructor: T,
  overrides?: {
    overrideSelectors?: MockSelectorOverrides<MockSignalStore<T>>;
    overrideMethods?: MockMethodOverrides<MockSignalStore<T>>;
    providers?: Array<
      | { provide: unknown; useFactory: (...args: unknown[]) => unknown }
      | InjectionToken<unknown>
    >;
  }
): MockSignalStore<T> {
  let tempInstance: any;

  @NgModule()
  class ProxyModule {
    constructor() {
      tempInstance = new storeConstructor();
    }
  }

  const providerMap = new Map<
    unknown,
    { provide: unknown; useFactory: (...args: unknown[]) => unknown }
  >();
  for (const providerEntry of overrides?.providers ?? []) {
    if (providerEntry instanceof InjectionToken) {
      const prov = (
        providerEntry as InjectionToken<unknown> & {
          ɵprov?: { factory?: AnyFn };
        }
      ).ɵprov;
      const factory = prov?.factory;
      if (typeof factory !== 'function') {
        throw new Error(
          `Cannot use InjectionToken without factory in createSignalStoreMock: ${providerEntry.toString()}`
        );
      }
      providerMap.set(providerEntry, {
        provide: providerEntry,
        useFactory: factory,
      });
    } else {
      providerMap.set(providerEntry.provide, providerEntry);
    }
  }

  const mockedInjector = Injector.create({ providers: [] });
  mockedInjector.get = (token: unknown): unknown => {
    const match = providerMap.get(token);
    if (match) {
      return match.useFactory();
    }
    return {};
  };

  createNgModule(ProxyModule, mockedInjector);

  // Plain state (only withState slices) to keep initial values
  const initialState = getState(tempInstance);
  const signalifiedState = {};
  for (const key of Object.keys(
    initialState
  ) as (keyof typeof initialState)[]) {
    Object.defineProperty(signalifiedState, key, {
      value: signal(initialState[key]),
      enumerable: true,
      writable: true,
    });
  }

  // Add computed selectors (signals) not present in initialState
  for (const key of Object.keys(
    tempInstance
  ) as (keyof typeof tempInstance)[]) {
    const value = tempInstance[key];
    if (isSignal(value) && !(key in signalifiedState)) {
      try {
        // retain original computed signal value without the computation
        Object.defineProperty(signalifiedState, key, {
          value: signal(value()),
          enumerable: true,
          writable: true,
        });
      } catch (error: unknown) {
        const original =
          error instanceof Error ? error : new Error(String(error));
        original.message =
          `${original.message}\n\nThis most probably occurred because of an unresolved initial state in a withState that is using a factory function. ` +
          `Provide the factory function or the InjectionToken in the 'providers' argument of createSignalStoreMock so it can be resolved during mock creation.`;
        throw original;
      }
    }
  }

  const stateWithOverrides = {
    ...signalifiedState,
    ...(overrides?.overrideSelectors || {}),
  };
  const deepSignal = deepComputed(() => {
    const unwrapped = {};
    for (const key of Object.keys(
      stateWithOverrides
    ) as (keyof typeof stateWithOverrides)[]) {
      Object.defineProperty(unwrapped, key, {
        value: (stateWithOverrides[key] as Signal<unknown>)(),
        writable: true,
        enumerable: true,
      });
    }
    return unwrapped;
  });

  const overrideMethods = overrides?.overrideMethods;

  for (const key in tempInstance) {
    const value = tempInstance[key];

    if (overrideMethods && key in overrideMethods) {
      Object.defineProperty(deepSignal, key, {
        value: overrideMethods[key as keyof typeof overrideMethods],
      });
    } else if (typeof value === 'function' && !isSignal(value)) {
      Object.defineProperty(deepSignal, key, {
        value: createMethodMock(key),
        writable: true,
        enumerable: true,
      });
    }
  }
  return deepSignal as unknown as MockSignalStore<T>;
}

function createMethodMock(key: string) {
  // Create a usable mock for methods. Prefer Jest or Jasmine spies if available
  // so consumers can use spy assertions directly. Fall back to a no-op function.
  let methodMock: any;
  try {
    // Jest exposes a `jest` global with `fn`.
    if (
      typeof (globalThis as any).jest === 'object' &&
      typeof (globalThis as any).jest.fn === 'function'
    ) {
      methodMock = (globalThis as any).jest.fn();
    } else if (
      typeof (globalThis as any).jasmine === 'object' &&
      typeof (globalThis as any).jasmine.createSpy === 'function'
    ) {
      // Jasmine provides jasmine.createSpy(name)
      methodMock = (globalThis as any).jasmine.createSpy(String(key));
    } else {
      // Last resort: return a simple function that can be spied on later
      methodMock = (..._args: any[]) => {};
    }
  } catch {
    methodMock = (..._args: any[]) => {};
  }
  return methodMock;
}
