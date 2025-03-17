import {
  CreateSignalOptions,
  DestroyRef,
  EffectRef,
  Injector,
  Signal,
  WritableSignal,
  assertNotInReactiveContext,
  effect,
  inject,
  isSignal,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MonoTypeOperatorFunction, Observable, Subscription, pipe } from 'rxjs';

export type BindableSignal<T> = WritableSignal<T> & {
  bindTo: (source: Observable<T> | Signal<T>) => WritableSignal<T>;
  unbind: () => void;
};

/**
 * Factory method to create a BindableSignal.
 * The BindableSignal is a type of WritableSignal and has a bindTo method that will bind the signal to updates from an observable or another signal.
 *
 * @param initialValue The initial value assigned to the signal.
 * @param options
 * @param options.destroyRef Used when the method is called outside of the injection context. If provided, the signal will be destroyed when the destroyRef is destroyed.
 *                           Note that in case of manualCleanup, the destroyRef will not be used therefor cannot be provided.
 *                           In case of binding to a signal, the destroyRef cannot be provided because it will not provide the neccessary hooks to create the updater effect.
 * @param options.injector Used to bind to a signal or to inject the destroyRef outside of injection context.
 *                         If provided, the signal updater will be destroyed when the injector.get(DestroyRef) is destroyed.
 *                         Note that in case of manualCleanup, the injector will not be used therefor cannot be provided.
 * @param options.manualCleanup When true, the signal will not be destroyed when the destroyRef is destroyed. The operatorFunction has to be provided in this case.
 *                              In case of binding to a signal, the manualCleanup cannot be used.
 * @returns BindableSignal<T> A signal that can be bound to an observable or signal.
 */
export function bindable<T>(
  initialValue: T,
  options?: CreateSignalOptions<T> & {
    destroyRef?: DestroyRef;
    injector?: Injector;
    manualCleanup?: boolean;
  }
): BindableSignal<T> {
  assertNoDestroyRefOrInjectorProvidedWithManualCleanup(options);

  let injector: Injector | undefined = undefined;
  if (options?.destroyRef === undefined && options?.manualCleanup !== true) {
    injector = options?.injector ?? inject(Injector);
  }

  const bindableSignal = signal<T>(initialValue, options);
  let bound = false;

  let effectRef: EffectRef | undefined = undefined;
  let subscription: Subscription | undefined = undefined;
  let unbind: () => void = () => {
    if (effectRef !== undefined) {
      effectRef.destroy();
      effectRef = undefined;
    } else if (subscription !== undefined) {
      subscription.unsubscribe();
      subscription = undefined;
    } else {
      throw new Error(
        'Unbind was called before the BindableSignal was bound to an Observable or Signal!'
      );
    }
    bound = false;
  };

  const bindTo: (source: Observable<T> | Signal<T>) => WritableSignal<T> = (
    source: Observable<T> | Signal<T>
  ) => {
    assertNotInReactiveContext(
      bindTo,
      'Invoking `bindTo` causes new subscriptions every time. ' +
        'Consider moving `bindTo` outside of the reactive context and read the signal value where needed.'
    );
    if (bound) {
      throw new Error(
        'Signal is already bound to an observable. Call unbind() before binding it again.'
      );
    }
    if (isSignal(source)) {
      if (injector === undefined) {
        throw new Error(
          'Tried to bind the signal to a signal without a provided Injector. In this case the bindTo method is creating an effect and there is no ' +
            'possibility to provide a terminator operator unlike with observables. To prevent memory leaks the Injector has to be provided or the ' +
            'bindable() factory method needs to be called in injection context. Providing the DestroyRef will make the Injector undefined.'
        );
      }

      effectRef = effect(() => bindableSignal.set(source()), {
        injector,
        allowSignalWrites: true,
      });
    } else {
      let operatorFunction: MonoTypeOperatorFunction<T>;
      if (options?.manualCleanup === true) {
        operatorFunction = pipe();
      } else {
        const destroyRef = options?.destroyRef ?? injector?.get(DestroyRef);
        if (destroyRef === undefined) {
          throw new Error(
            'Using the bindable() factory function in injection context or prodiving the DestroyRef ' +
              'or the Injector is required when not using manual cleanup to prevent memory leaks.'
          );
        }
        operatorFunction = takeUntilDestroyed(destroyRef);
      }

      subscription = source
        .pipe(operatorFunction)
        .subscribe((value) => bindableSignal.set(value));
    }
    bound = true;
    return bindableSignal;
  };

  return Object.assign(bindableSignal, { bindTo, unbind }) as BindableSignal<T>;
}

function assertNoDestroyRefOrInjectorProvidedWithManualCleanup(options?: {
  manualCleanup?: boolean;
  destroyRef?: DestroyRef;
  injector?: Injector;
}): void {
  if (options?.manualCleanup === true) {
    if (options?.destroyRef !== undefined || options?.injector !== undefined) {
      throw new Error(
        'When using manual cleanup, DestroyRef or Injector will not provide automated cleanup. ' +
          'Make sure that the operator functions contain the take or takeUntil operator to prevent memory leaks.'
      );
    }
  }
}
