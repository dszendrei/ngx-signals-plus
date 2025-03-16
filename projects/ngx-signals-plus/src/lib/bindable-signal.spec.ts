import { DestroyRef, Injector, signal } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { BehaviorSubject, Subject, take, takeUntil } from 'rxjs';
import { bindable } from './bindable-signal';

describe('bindable-signal.ts', () => {
  describe('bindable', () => {
    it('should update the bindable signal if the updater observable has been emitted', fakeAsync(() => {
      const newValue = 'newValue';
      const updaterSource = new BehaviorSubject(newValue);
      const bindableSignal = TestBed.runInInjectionContext(() =>
        bindable('initialValue')
      );

      bindableSignal.bindTo(updaterSource);
      tick();

      expect(bindableSignal()).toBe(newValue);

      const anotherValue = 'anotherValue';
      updaterSource.next(anotherValue);
      tick();

      expect(bindableSignal()).toBe(anotherValue);
    }));

    it('should update the bindable signal if the updater signal has been emitted', fakeAsync(() => {
      const newValue = 'newValue';
      const updaterSignal = signal(newValue);
      const bindableSignal = TestBed.runInInjectionContext(() =>
        bindable('initialValue')
      );

      bindableSignal.bindTo(updaterSignal);
      tick();

      expect(bindableSignal()).toBe(newValue);

      const anotherValue = 'anotherValue';
      updaterSignal.set(anotherValue);
      tick();

      expect(bindableSignal()).toBe(anotherValue);
    }));

    it('should require injection context if injector or destroyRef is not provided and manualCleanup is false', () => {
      expect(() => bindable('initialValue')).toThrow();
    });

    it('should not require injection context if injector is provided', () => {
      const injector = TestBed.inject(Injector);
      const bindableSignal = bindable('initialValue', { injector });

      expect(bindableSignal()).toBeTruthy();
    });

    it('should not require injection context if destroyRef is provided', () => {
      const destroyRef = TestBed.inject(DestroyRef);
      const bindableSignal = bindable('initialValue', { destroyRef });

      expect(bindableSignal()).toBeTruthy();
    });

    it('should not require injection context if manualCleanup is true', () => {
      const bindableSignal = bindable('initialValue', { manualCleanup: true });

      expect(bindableSignal()).toBeTruthy();
    });

    it('should throw if manualCleanup is true and injector is provided', () => {
      const injector = TestBed.inject(Injector);

      expect(() =>
        bindable('initialValue', { manualCleanup: true, injector })
      ).toThrow();
    });

    it('should throw if manualCleanup is true and destroyRef is provided', () => {
      const destroyRef = TestBed.inject(DestroyRef);

      expect(() =>
        bindable('initialValue', { manualCleanup: true, destroyRef })
      ).toThrow();
    });

    it('bindTo should throw if manualCleanup is true and it is binding to a signal', () => {
      const bindableSignal = TestBed.runInInjectionContext(() =>
        bindable('initialValue', { manualCleanup: true })
      );

      expect(() => bindableSignal.bindTo(signal('newValue'))).toThrow();
    });

    it('bindTo should throw if destroyRef provided and it is binding to a signal', () => {
      const destroyRef = TestBed.inject(DestroyRef);
      const bindableSignal = TestBed.runInInjectionContext(() =>
        bindable('initialValue', { destroyRef })
      );

      expect(() => bindableSignal.bindTo(signal('newValue'))).toThrow();
    });

    it('bindTo should not throw if injector was provided, it is binding to a signal and the bindable signal was created outside of injection context', fakeAsync(() => {
      const newValue = 'newValue';
      const injector = TestBed.inject(Injector);
      const bindableSignal = bindable('initialValue', { injector });

      bindableSignal.bindTo(signal(newValue));
      tick();

      expect(bindableSignal()).toBe(newValue);
    }));

    it('should stop updating the bindable signal from an observable if the DestroyRef onDestroy callback was called', fakeAsync(() => {
      const destroyRef = TestBed.inject(DestroyRef);
      const onDestroyHooks: (() => void)[] = [];
      collectMockDestroyRefCallbacks(destroyRef, onDestroyHooks);
      const newValue = 'newValue';
      const updaterSource = new BehaviorSubject(newValue);
      const bindableSignal = bindable('initialValue', { destroyRef });

      bindableSignal.bindTo(updaterSource);
      tick();

      expect(bindableSignal()).toBe(newValue);

      onDestroyHooks.forEach((destroy) => destroy());
      const anotherValue = 'anotherValue';
      updaterSource.next(anotherValue);
      tick();

      expect(bindableSignal()).toBe(newValue);
    }));

    it('should stop updating the bindable signal from an observable if the injected DestroyRef onDestroy callback was called', fakeAsync(() => {
      const injector = TestBed.inject(Injector);
      const destroyRef = TestBed.inject(DestroyRef);
      spyOn(injector, 'get').and.returnValue(destroyRef);
      const onDestroyHooks: (() => void)[] = [];
      collectMockDestroyRefCallbacks(destroyRef, onDestroyHooks);
      const newValue = 'newValue';
      const updaterSource = new BehaviorSubject(newValue);
      const bindableSignal = bindable('initialValue', { injector });

      bindableSignal.bindTo(updaterSource);
      tick();

      expect(bindableSignal()).toBe(newValue);

      onDestroyHooks.forEach((destroy) => destroy());
      const anotherValue = 'anotherValue';
      updaterSource.next(anotherValue);
      tick();

      expect(bindableSignal()).toBe(newValue);
    }));

    it('should stop updating the bindable signal from an observable if the observable was terminated', fakeAsync(() => {
      const newValue = 'newValue';
      const updaterSource = new BehaviorSubject(newValue);
      const bindableSignal = bindable('initialValue', { manualCleanup: true });

      bindableSignal.bindTo(updaterSource.pipe(take(1)));
      tick();

      expect(bindableSignal()).toBe(newValue);

      const anotherValue = 'anotherValue';
      updaterSource.next(anotherValue);
      tick();

      expect(bindableSignal()).toBe(newValue);
    }));

    it('should stop updating the bindable signal from a signal if the injected DestroyRef onDestroy callback was called', fakeAsync(() => {
      const injector = TestBed.inject(Injector);
      const destroyRef = TestBed.inject(DestroyRef);
      const onDestroyHooks: (() => void)[] = [];
      collectMockDestroyRefCallbacks(destroyRef, onDestroyHooks);
      const newValue = 'newValue';
      const upadterSignal = signal(newValue);
      const bindableSignal = bindable('initialValue', { injector });

      bindableSignal.bindTo(upadterSignal);
      tick();

      expect(bindableSignal()).toBe(newValue);

      onDestroyHooks.forEach((destroy) => destroy());
      const anotherValue = 'anotherValue';
      upadterSignal.set(anotherValue);
      tick();

      expect(bindableSignal()).toBe(newValue);
    }));

    it('should stop updating the bindable signal from an observable if unbind() was called', fakeAsync(() => {
      const newValue = 'newValue';
      const updaterSource = new BehaviorSubject(newValue);
      const bindableSignal = TestBed.runInInjectionContext(() =>
        bindable('initialValue')
      );

      bindableSignal.bindTo(updaterSource);
      tick();

      expect(bindableSignal()).toBe(newValue);

      bindableSignal.unbind();
      const anotherValue = 'anotherValue';
      updaterSource.next(anotherValue);
      tick();

      expect(bindableSignal()).toBe(newValue);
    }));

    it('should stop updating the bindable signal from a signal if unbind() was called', fakeAsync(() => {
      const newValue = 'newValue';
      const upadterSignal = signal(newValue);
      const bindableSignal = TestBed.runInInjectionContext(() =>
        bindable('initialValue')
      );

      bindableSignal.bindTo(upadterSignal);
      tick();

      expect(bindableSignal()).toBe(newValue);

      bindableSignal.unbind();
      const anotherValue = 'anotherValue';
      upadterSignal.set(anotherValue);
      tick();

      expect(bindableSignal()).toBe(newValue);
    }));

    it('should throw if unbind() on bindable signal was called before it was bound to an Observable or Signal', () => {
      const bindableSignal = TestBed.runInInjectionContext(() =>
        bindable('initialValue')
      );

      expect(() => bindableSignal.unbind()).toThrow();
    });

    it('should only update from the latest bound observable', fakeAsync(() => {
      const newValue = 'newValue';
      const updaterSource = new BehaviorSubject(newValue);
      const bindableSignal = TestBed.runInInjectionContext(() =>
        bindable('initialValue')
      );

      bindableSignal.bindTo(updaterSource);
      tick();

      expect(bindableSignal()).toBe(newValue);

      bindableSignal.unbind();
      const anotherValue = 'anotherValue';
      const newAnotherValue = 'newAnotherValue';
      const newUpdaterSource = new BehaviorSubject(newAnotherValue);
      bindableSignal.bindTo(newUpdaterSource);
      tick();

      expect(bindableSignal()).toBe(newAnotherValue);

      updaterSource.next(anotherValue);
      tick();

      expect(bindableSignal()).toBe(newAnotherValue);

      const latestValue = 'latestValue';
      newUpdaterSource.next(latestValue);
      tick();

      expect(bindableSignal()).toBe(latestValue);
    }));

    it('should only update from the latest bound signal', fakeAsync(() => {
      const newValue = 'newValue';
      const updaterSignal = signal(newValue);
      const bindableSignal = TestBed.runInInjectionContext(() =>
        bindable('initialValue')
      );

      bindableSignal.bindTo(updaterSignal);
      tick();

      expect(bindableSignal()).toBe(newValue);

      bindableSignal.unbind();
      const anotherValue = 'anotherValue';
      const newAnotherValue = 'newAnotherValue';
      const newUpdaterSignal = signal(newAnotherValue);
      bindableSignal.bindTo(newUpdaterSignal);
      tick();

      expect(bindableSignal()).toBe(newAnotherValue);

      updaterSignal.set(anotherValue);
      tick();

      expect(bindableSignal()).toBe(newAnotherValue);

      const latestValue = 'latestValue';
      newUpdaterSignal.set(latestValue);
      tick();

      expect(bindableSignal()).toBe(latestValue);
    }));

    it('should be able to bind to a signal after it was unbound from an observable', fakeAsync(() => {
      const newValue = 'newValue';
      const updaterSource = new BehaviorSubject(newValue);
      const bindableSignal = TestBed.runInInjectionContext(() =>
        bindable('initialValue')
      );

      bindableSignal.bindTo(updaterSource);
      tick();

      expect(bindableSignal()).toBe(newValue);

      bindableSignal.unbind();
      const anotherValue = 'anotherValue';
      const newAnotherValue = 'newAnotherValue';
      const newUpdaterSignal = signal(newAnotherValue);
      bindableSignal.bindTo(newUpdaterSignal);
      tick();

      expect(bindableSignal()).toBe(newAnotherValue);

      updaterSource.next(anotherValue);
      tick();

      expect(bindableSignal()).toBe(newAnotherValue);
    }));

    it('should be able to bind to an observable after it was unbound from a signal', fakeAsync(() => {
      const newValue = 'newValue';
      const updaterSignal = signal(newValue);
      const bindableSignal = TestBed.runInInjectionContext(() =>
        bindable('initialValue')
      );

      bindableSignal.bindTo(updaterSignal);
      tick();

      expect(bindableSignal()).toBe(newValue);

      bindableSignal.unbind();
      const anotherValue = 'anotherValue';
      const newAnotherValue = 'newAnotherValue';
      const newUpdaterSource = new BehaviorSubject(newAnotherValue);
      bindableSignal.bindTo(newUpdaterSource);
      tick();

      expect(bindableSignal()).toBe(newAnotherValue);

      updaterSignal.set(anotherValue);
      tick();

      expect(bindableSignal()).toBe(newAnotherValue);
    }));

    it('should not throw if unbind() was called on a terminated observable source', fakeAsync(() => {
      const newValue = 'newValue';
      const updaterSource = new BehaviorSubject(newValue);
      const destroySource = new Subject<void>();
      const bindableSignal = bindable('initialValue', { manualCleanup: true });

      bindableSignal.bindTo(updaterSource.pipe(takeUntil(destroySource)));
      tick();

      expect(bindableSignal()).toBe(newValue);

      destroySource.next();
      tick();

      bindableSignal.unbind();

      expect(bindableSignal).toBeTruthy();
    }));

    it('should not throw if the source observable termination was called after unbind()', fakeAsync(() => {
      const newValue = 'newValue';
      const updaterSource = new BehaviorSubject(newValue);
      const destroySource = new Subject<void>();
      const bindableSignal = bindable('initialValue', { manualCleanup: true });

      bindableSignal.bindTo(updaterSource.pipe(takeUntil(destroySource)));
      tick();

      expect(bindableSignal()).toBe(newValue);

      bindableSignal.unbind();
      tick();

      destroySource.next();
      tick();

      expect(bindableSignal).toBeTruthy();
    }));
  });
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
