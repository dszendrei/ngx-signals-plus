import {
  DestroyRef,
  effect,
  EffectRef,
  inject,
  Injector,
  Signal,
  untracked,
  VERSION,
} from '@angular/core';
import { ToObservableOptions } from '@angular/core/rxjs-interop';
import { Observable, shareReplay, Subject, tap } from 'rxjs';
import { lazyStartWith } from './custom-observables';

/**
 * Converts a signal to a hot observable with the initial value emitted synchronously.
 * Similar to BehaviorSubject behavior, using shareReplay under the hood.
 * Every following signal value change will be emitted asynchronously just like with the original toObservable method.
 *
 * Use the original toObservable method from '@angular/core/rxjs-interop' if asynchronous initial value readout is sufficient.
 *
 * @param source The source signal to convert to an observable.
 * @param options toBehaviorObservable must be called in an injection context unless an injector is provided via options.
 * @returns An observable that emits the signal's current value synchronously upon subscription, and subsequent values asynchronously.
 */
export const toBehaviorObservable = <T>(
  source: Signal<T>,
  options?: ToObservableOptions
): Observable<T> => {
  const subject = new Subject<T>();
  const injector = options?.injector ?? inject(Injector);
  injector.get(DestroyRef).onDestroy(() => {
    subject.complete();
  });
  let watcher: EffectRef | undefined = undefined;
  let initialValue: T | undefined = undefined;
  return subject.pipe(
    lazyStartWith(() => {
      initialValue = source();
      return initialValue;
    }),
    tap({
      subscribe: () => {
        let skipFirst = true;
        watcher = effect(
          () => {
            try {
              const sourceValue = source();
              // !skipFirst
              // Skipping the first run as the initial value is already emitted by lazyStartWith and the
              // subject should not emit the same value twice in a row, since the effect would emit the
              // initial value asynchronously.
              //
              // initialValue !== sourceValue
              // Still emit the value on the subject in case the signal value changed between the
              // lazyStartWith and the first effect run.
              if (!skipFirst || initialValue !== sourceValue) {
                untracked(() => subject.next(sourceValue));
              }
              skipFirst = false;
            } catch (err) {
              untracked(() => subject.error(err));
            }
          },
          parseInt(VERSION.major) < 19
            ? {
                injector,
                allowSignalWrites: true,
                manualCleanup: true,
              }
            : { injector, manualCleanup: true }
        );
      },
      finalize: () => {
        watcher?.destroy();
      },
    }),
    shareReplay({ bufferSize: 1, refCount: true })
  );
};
