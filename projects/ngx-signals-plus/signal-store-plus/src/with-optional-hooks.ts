import { inject, InjectionToken } from '@angular/core';
import {
  EmptyFeatureResult,
  Prettify,
  SignalStoreFeature,
  SignalStoreFeatureResult,
  StateSignals,
  withHooks,
  WritableStateSource,
} from '@ngrx/signals';

/**
 * Injection token used to disable lifecycle hooks in SignalStore features that support conditional execution.
 *
 * When provided with a truthy value in the current injector, features like `withOptionalHooks` will skip executing
 * their `onInit` and `onDestroy` hooks. This is especially useful in testing environments or when mocking stores.
 *
 * @example
 * // In a test setup or mock provider
 * TestBed.configureTestingModule(providers: [{
 *   provide: DISABLE_HOOKS,
 *   useValue: true,
 * }]);
 *
 * @see `withOptionalHooks` for conditional hook application.
 */
export const DISABLE_HOOKS = new InjectionToken<boolean>('IGNORE_WHEN_MOCKED');

export function withOptionalHooks<
  Input extends SignalStoreFeatureResult
>(hooks: {
  onInit?: HookFn<Input>;
  onDestroy?: HookFn<Input>;
}): SignalStoreFeature<Input, EmptyFeatureResult>;
export function withOptionalHooks<Input extends SignalStoreFeatureResult>(
  hooks: HooksFactory<Input>
): SignalStoreFeature<Input, EmptyFeatureResult>;

/**
 * Conditionally applies lifecycle hooks to a SignalStore, allowing them to be disabled via an injection token.
 *
 * This feature behaves like `withHooks`, but adds support for disabling hooks, useful for only running
 * the hooks for a certain provider, testing or mocking scenarios. Combined with the `createSignalStoreMock`, it
 * auto-disables hooks when creating and using the mock store without manually providing the `DISABLE_HOOKS` injection token.
 *
 * If the `DISABLE_HOOKS` injection token is provided with a truthy value, the hooks will be skipped entirely.
 *
 * @example
 * withOptionalHooks((store) => ({
 *   onInit: () => console.log('Store initialized'),
 *   onDestroy: () => console.log('Store destroyed'),
 * }));
 *
 * // OR
 *
 * withOptionalHooks({
 *   onInit: () => console.log('Store initialized'),
 *   onDestroy: () => console.log('Store destroyed'),
 * });
 *
 * @see `DISABLE_HOOKS` injection token to control hook behavior.
 *
 * @returns A SignalStoreFeature that conditionally applies hooks based on the injection context.
 */
export function withOptionalHooks<Input extends SignalStoreFeatureResult>(
  hooksOrFactory:
    | {
        onInit?: HookFn<Input>;
        onDestroy?: HookFn<Input>;
      }
    | HooksFactory<Input>
): SignalStoreFeature<Input, EmptyFeatureResult> {
  return (store) => {
    const disableHooks = inject(DISABLE_HOOKS, {
      optional: true,
    });

    if (disableHooks) {
      return store;
    }

    const feature = withHooks(
      hooksOrFactory as Parameters<typeof withHooks>[0]
    );
    return feature(store);
  };
}

type HooksFactory<
  Input extends SignalStoreFeatureResult & { props?: any; computed?: any }
> = (
  store: Prettify<
    StateSignals<Input['state']> &
      Input['props'] &
      Input['computed'] &
      Input['methods'] &
      WritableStateSource<Input['state']>
  >
) => {
  onInit?: () => void;
  onDestroy?: () => void;
};

type HookFn<
  Input extends SignalStoreFeatureResult & { props?: any; computed?: any }
> = (
  store: Prettify<
    StateSignals<Input['state']> &
      Input['props'] &
      Input['computed'] &
      Input['methods'] &
      WritableStateSource<Prettify<Input['state']>>
  >
) => void;
