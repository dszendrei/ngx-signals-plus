import { ApplicationRef, inject, Injector } from '@angular/core';
import { withHooks } from '@ngrx/signals';

/**
 * Prevents accidental re-provisioning of a root-injected SignalStore in components or feature modules.
 *
 * This feature is intended to be used with globally provided SignalStores ({ providedIn: 'root' }).
 * When applied, it throws an error if the store is instantiated in any injector other than the root injector.
 *
 * This helps enforce singleton usage and avoids subtle bugs caused by multiple instances of the same store.
 *
 * @example
 * return signalStore(
 *   { providedIn: 'root' },
 *   withRootGuard(),
 *   withState({
 *     count: 1,
 *   })
 * );
 *
 * @throws Error if the store is provided in a non-root injector (e.g., inside a component or feature module).
 *
 * @returns A SignalStoreFeature that guards against non-root provisioning.
 */
export const withRootGuard = () =>
  withHooks(() => ({
    onInit: () => {
      const currentInjector = inject(Injector);
      const rootInjector = inject(ApplicationRef).injector;
      if (currentInjector !== rootInjector) {
        throw new Error(
          'Root provided Store must not be provided in modules or components.'
        );
      }
    },
  }));
