import { DestroyRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { signalStore, withState } from '@ngrx/signals';
import { DISABLE_HOOKS, withOptionalHooks } from './with-optional-hooks';

describe('withOptionalHooks', () => {
  it('should create a signal store with state', (done) => {
    let storeInstance: InstanceType<typeof exampleStore>;
    const exampleStore = createSignalStore(() => ({}));

    TestBed.runInInjectionContext(() => {
      storeInstance = TestBed.inject(exampleStore);
      expect(storeInstance.count()).toBe(1);
      done();
    });
  });

  it('should run the onInit during injection context', (done) => {
    let called = false;
    const exampleStore = createSignalStore(() => ({
      onInit: () => {
        called = true;
      },
    }));

    TestBed.runInInjectionContext(() => {
      TestBed.inject(exampleStore);
      expect(called).toBeTrue();
      done();
    });
  });

  it('should not run the onInit during injection context if DISABLE_HOOKS is true', (done) => {
    const exampleStore = createSignalStore(() => ({
      onInit: () => {
        fail('OnInit should not be called');
      },
    }));

    TestBed.configureTestingModule({
      providers: [
        {
          provide: DISABLE_HOOKS,
          useValue: true,
        },
      ],
    });

    TestBed.runInInjectionContext(() => {
      TestBed.inject(exampleStore);
      done();
    });
  });

  it('should run the onDestroy when the injector is destroyed', (done) => {
    let called = false;
    const exampleStore = createSignalStore(() => ({
      onDestroy: () => {
        called = true;
      },
    }));

    TestBed.runInInjectionContext(() => {
      const destroyRef = TestBed.inject(DestroyRef);
      const onDestroyHooks: (() => void)[] = [];
      collectMockDestroyRefCallbacks(destroyRef, onDestroyHooks);
      TestBed.inject(exampleStore);
      onDestroyHooks.forEach((destroy) => destroy());
      expect(called).toBeTrue();
      done();
    });
  });

  it('should not run the onDestroy when the injector is destroyed if DISABLE_HOOKS is true', (done) => {
    const exampleStore = createSignalStore(() => ({
      onDestroy: () => {
        fail('OnDestroy should not be called');
      },
    }));

    TestBed.configureTestingModule({
      providers: [
        {
          provide: DISABLE_HOOKS,
          useValue: true,
        },
      ],
    });

    TestBed.runInInjectionContext(() => {
      const destroyRef = TestBed.inject(DestroyRef);
      const onDestroyHooks: (() => void)[] = [];
      collectMockDestroyRefCallbacks(destroyRef, onDestroyHooks);
      TestBed.inject(exampleStore);
      onDestroyHooks.forEach((destroy) => destroy());
      done();
    });
  });
});

function createSignalStore(...hooks: Parameters<typeof withOptionalHooks>) {
  return signalStore(
    { providedIn: 'root' },
    withOptionalHooks(...hooks),
    withState({
      count: 1,
    }),
    withOptionalHooks((store) => ({
      onInit: () => {
        store.count(); // HooksFactory
      },
    })),
    withOptionalHooks({
      onInit: () => {
        // HookFn
      },
    })
  );
}

function collectMockDestroyRefCallbacks(
  mockDestroyRef: DestroyRef,
  onDestroyHooks: (() => void)[]
) {
  spyOn(mockDestroyRef, 'onDestroy').and.callFake((fn) => {
    onDestroyHooks.push(fn);
    return () => fn;
  });
}
