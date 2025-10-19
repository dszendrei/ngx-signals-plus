import { DestroyRef, Injector, signal } from '@angular/core';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { toBehaviorObservable } from './to-behavior-observable';

describe('toBehaviorObservable', () => {
  const INITIAL_VALUE = 'initialValue';
  const NEW_VALUE = 'newValue';
  const NEWEST_VALUE = 'newestValue';
  let injector: Injector;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    injector = TestBed.inject(Injector);
  });

  it('should create an observable that emits the signal value', fakeAsync(() => {
    const signalSpy = signal(INITIAL_VALUE);
    const observable = toBehaviorObservable(signalSpy, {
      injector,
    });
    let emittedValue: string | undefined;
    let counter = 0;

    observable.subscribe((value) => {
      emittedValue = value;
      counter++;
    });

    expect(emittedValue).toBe(INITIAL_VALUE);

    tick();

    expect(counter).toBe(1);
  }));

  it('should emit new values when the signal is updated', fakeAsync(() => {
    const signalSpy = signal(INITIAL_VALUE);
    const observable = toBehaviorObservable(signalSpy, {
      injector,
    });
    let emittedValue: string | undefined;
    let counter = 0;

    observable.subscribe((value) => {
      emittedValue = value;
      counter++;
    });

    expect(counter).toBe(1);

    signalSpy.set(NEW_VALUE);
    tick();

    expect(emittedValue).toBe(NEW_VALUE);

    tick();

    expect(counter).toBe(2);
  }));

  it('should not affect other observables from the same signal', fakeAsync(() => {
    const signalSpy = signal(INITIAL_VALUE);
    const observable = toBehaviorObservable(signalSpy, {
      injector,
    });
    const observable2 = toBehaviorObservable(signalSpy, {
      injector,
    });
    let emittedValue: string | undefined;
    let emittedValue2: string | undefined;
    let counter = 0;
    let counter2 = 0;

    observable.subscribe((value) => {
      emittedValue = value;
      counter++;
    });

    observable2.subscribe((value) => {
      emittedValue2 = value;
      counter2++;
    });

    expect(counter).toBe(1);
    expect(counter2).toBe(1);

    signalSpy.set(NEW_VALUE);
    tick();

    expect(emittedValue).toBe(NEW_VALUE);
    expect(emittedValue2).toBe(NEW_VALUE);

    tick();

    expect(counter).toBe(2);
    expect(counter2).toBe(2);
  }));

  it('should not affect other subscriptions from the same observable', fakeAsync(() => {
    const signalSpy = signal(INITIAL_VALUE);
    const observable = toBehaviorObservable(signalSpy, {
      injector,
    });
    let emittedValue: string | undefined;
    let emittedValue2: string | undefined;
    let counter = 0;
    let counter2 = 0;

    observable.subscribe((value) => {
      emittedValue = value;
      counter++;
    });

    observable.subscribe((value) => {
      emittedValue2 = value;
      counter2++;
    });

    expect(counter).toBe(1);
    expect(counter2).toBe(1);

    signalSpy.set(NEW_VALUE);
    tick();

    expect(emittedValue).toBe(NEW_VALUE);
    expect(emittedValue2).toBe(NEW_VALUE);

    tick();

    expect(counter).toBe(2);
    expect(counter2).toBe(2);
  }));

  it('should still emit after terminating the subscription and resubscribing', fakeAsync(() => {
    const signalSpy = signal(INITIAL_VALUE);
    const observable = toBehaviorObservable(signalSpy, {
      injector,
    });
    let emittedValue: string | undefined;
    let counter = 0;

    const sub = observable.subscribe();
    sub.unsubscribe();

    const sub2 = observable.subscribe((value) => {
      emittedValue = value;
    });
    expect(emittedValue).toBe(INITIAL_VALUE);

    signalSpy.set(NEW_VALUE);
    sub2.unsubscribe();

    observable.subscribe((value) => {
      emittedValue = value;
      counter++;
    });
    expect(emittedValue).toBe(NEW_VALUE);
    tick();

    expect(counter).toBe(1);

    signalSpy.set(NEWEST_VALUE);
    tick();

    expect(emittedValue).toBe(NEWEST_VALUE);

    tick();

    expect(counter).toBe(2);
  }));

  it('should not emit anymore once the destroyRef called the destroy callbacks', fakeAsync(() => {
    const destroyRef = TestBed.inject(DestroyRef);
    const onDestroyHooks: (() => void)[] = [];
    collectMockDestroyRefCallbacks(destroyRef, onDestroyHooks);
    const signalSpy = signal(INITIAL_VALUE);
    const observable = toBehaviorObservable(signalSpy, {
      injector,
    });
    let emittedValue: string | undefined;
    let counter = 0;

    observable.subscribe((value) => {
      emittedValue = value;
      counter++;
    });

    signalSpy.set(NEW_VALUE);
    tick();

    expect(emittedValue).toBe(NEW_VALUE);
    expect(counter).toBe(2);

    onDestroyHooks.forEach((destroy) => destroy());

    tick();
    signalSpy.set(NEWEST_VALUE);
    tick();

    expect(emittedValue).toBe(NEW_VALUE);
    expect(counter).toBe(2);
  }));
});

function collectMockDestroyRefCallbacks(
  mockDestroyRef: DestroyRef,
  onDestroyHooks: (() => void)[]
) {
  spyOn(mockDestroyRef, 'onDestroy').and.callFake((fn) => {
    onDestroyHooks.push(fn);
    return () => fn;
  });
}
