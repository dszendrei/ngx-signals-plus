import {
  computed,
  inject,
  Injectable,
  InjectionToken,
  signal,
} from '@angular/core';
import {
  deepComputed,
  signalStore,
  signalStoreFeature,
  withComputed,
  withMethods,
  withState,
} from '@ngrx/signals';
import { withEntities } from '@ngrx/signals/entities';
import {
  MockSelectorOverrides,
  MockSignalStore,
  createSignalStoreMock,
} from './signal-store.mock';
import { TestBed } from '@angular/core/testing';
import {
  withRootGuard,
  withOptionalHooks,
} from '../../signal-store-plus/public-api';

const initialInjectedState = {
  featureString: 'initial',
  featureNumber: 0,
};

const INJECTED_STATE = new InjectionToken<{
  featureString: string;
  featureNumber: number;
}>('InjectedState', {
  factory: () => initialInjectedState,
});

@Injectable({ providedIn: 'root' })
class TestService {
  increment() {
    //do nothing
  }
}

describe('createSignalStoreMock', () => {
  let exampleStore: ReturnType<typeof createSignalStore>;

  beforeEach(() => {
    // Build a real signal store class with state, computed selectors and methods
    exampleStore = createSignalStore();
  });

  it('should expose same selector and method keys (minus STATE_SOURCE symbol)', () => {
    const mock = createSignalStoreMock(exampleStore, {
      providers: [
        { provide: INJECTED_STATE, useFactory: () => initialInjectedState },
      ],
    });

    // No unexpected loss of selectors
    expect(mock.count).toBeDefined();
    expect(mock.status).toBeDefined();
    expect(mock.nested).toBeDefined();
    expect(mock.nested.value).toBeDefined();
    expect(mock.double).toBeDefined();
    expect(mock.statusLength).toBeDefined();

    // No unexpected loss of signal store feature selectors
    expect(mock.featureString).toBeDefined();
    expect(mock.featureNumber).toBeDefined();
    expect(mock.isFeatureStringEmpty).toBeDefined();
    expect(mock.isFeatureNumberPositive).toBeDefined();

    // No unexpected loss of entity manager store feature selectors
    expect(mock.entities).toBeDefined();
    expect(mock.entityMap).toBeDefined();

    // Methods are mocked
    expect(typeof mock.setStatus).toBe('function');
    expect(typeof mock.increment).toBe('function');

    // Signal store feature methods are mocked
    expect(typeof mock.setFeatureString).toBe('function');
    expect(typeof mock.incrementFeatureNumber).toBe('function');

    // Entity manager store feature methods are mocked
    expect(typeof mock.addEntity).toBe('function');
    expect(typeof mock.removeEntity).toBe('function');
  });

  it('should inherit the initial values', (done) => {
    const safeExampleStore = createSignalStore(true);

    const mock = createSignalStoreMock(safeExampleStore, {
      providers: [INJECTED_STATE],
    });
    let storeInstance: InstanceType<typeof safeExampleStore>;
    TestBed.runInInjectionContext(() => {
      storeInstance = new safeExampleStore();

      expect(mock.count()).toBe(storeInstance.count());
      expect(mock.status()).toBe(storeInstance.status());
      expect(mock.nested()).toBe(storeInstance.nested());
      expect(mock.nested.value()).toBe(storeInstance.nested.value());
      expect(mock.double()).toBe(storeInstance.double());
      expect(mock.statusLength()).toBe(storeInstance.statusLength());

      // Signal store feature selectors
      expect(mock.featureString()).toBe(storeInstance.featureString());
      expect(mock.featureNumber()).toBe(storeInstance.featureNumber());
      expect(mock.isFeatureStringEmpty()).toBe(
        storeInstance.isFeatureStringEmpty()
      );
      expect(mock.isFeatureNumberPositive()).toBe(
        storeInstance.isFeatureNumberPositive()
      );

      // Entity manager store feature selectors are empty initially
      expect(mock.entities()).toEqual([]);
      expect(mock.entityMap()).toEqual({});
      done();
    });
  });

  it('should create jest method mocks if jest is available', () => {
    const execTest = (withoutInitialValues: boolean) => {
      try {
        (globalThis as any).jest = {
          fn: () => () => {
            return { _isMockFunction: true };
          },
        };
        const mock = createSignalStoreMock(exampleStore, {
          providers: [INJECTED_STATE],
          withoutInitialValues,
        });

        expect((mock.setStatus as any)()._isMockFunction).toBeTrue();
        expect((mock.increment as any)()._isMockFunction).toBeTrue();
      } catch (error) {
        (globalThis as any).jest = undefined;
        throw error;
      }
    };

    execTest(false);
    execTest(true);

    (globalThis as any).jest = undefined;
  });

  // local setup is using jasmine for tests
  it('should create jasmine mocks for non-overridden methods', () => {
    const execTest = (withoutInitialValues: boolean) => {
      const mock = createSignalStoreMock(exampleStore, {
        providers: [INJECTED_STATE],
        withoutInitialValues,
      });

      mock.setStatus('loading');
      expect(mock.setStatus).toHaveBeenCalledWith('loading');
      expect(mock.increment).not.toHaveBeenCalled();

      mock.increment();
      expect(mock.increment).toHaveBeenCalledTimes(1);

      // Signal store feature methods
      mock.setFeatureString('newString');
      expect(mock.setFeatureString).toHaveBeenCalledWith('newString');
      expect(mock.incrementFeatureNumber).not.toHaveBeenCalled();
      mock.incrementFeatureNumber();
      expect(mock.incrementFeatureNumber).toHaveBeenCalledTimes(1);

      // Entity manager store feature methods
      mock.addEntity(1, 'Entity1');
      expect(mock.addEntity).toHaveBeenCalledWith(1, 'Entity1');
      expect(mock.removeEntity).not.toHaveBeenCalled();
      mock.removeEntity(1);
      expect(mock.removeEntity).toHaveBeenCalledWith(1);
    };

    execTest(false);
    execTest(true);
  });

  it('should allow overriding selectors with signals', () => {
    const execTest = (withoutInitialValues: boolean) => {
      const statusOverride = signal<'idle' | 'loading' | 'ready'>('loading');
      const countOverride = signal(10);
      const doubleOverride = signal(5);
      const nestedValueOverride = signal(99);
      const nestedOverride = deepComputed(() => ({
        value: nestedValueOverride(),
      }));

      const featureNumberOverride = signal(42);
      const featureStringOverride = signal('overridden');
      const isFeatureNumberPositiveOverride = signal(true);
      const isFeatureStringEmptyOverride = signal(false);

      const entity = { id: 1, text: 'Test Entity', completed: false };
      const entitiesOverride = signal<
        Array<{ id: number; text: string; completed: boolean }>
      >([entity]);
      const entityMapOverride = signal<{
        [id: number]: { id: number; text: string; completed: boolean };
      }>({
        1: entity,
      });

      const selectorOverrides: MockSelectorOverrides<
        MockSignalStore<typeof exampleStore>
      > = {
        status: statusOverride,
        count: countOverride,
        double: doubleOverride,
        nested: nestedOverride,
        featureNumber: featureNumberOverride,
        featureString: featureStringOverride,
        isFeatureNumberPositive: isFeatureNumberPositiveOverride,
        isFeatureStringEmpty: isFeatureStringEmptyOverride,
        entities: entitiesOverride,
        entityMap: entityMapOverride,
      };

      const mock = createSignalStoreMock(exampleStore, {
        overrideSelectors: selectorOverrides,
        providers: [INJECTED_STATE],
        withoutInitialValues,
      });

      // Identity preserved
      expect(mock.status()).toBe(statusOverride());
      expect(mock.count()).toBe(countOverride());
      expect(mock.double()).toBe(doubleOverride());
      expect(mock.nested().value).toBe(nestedValueOverride());

      expect(mock.featureNumber()).toBe(featureNumberOverride());
      expect(mock.featureString()).toBe(featureStringOverride());
      expect(mock.isFeatureNumberPositive()).toBe(
        isFeatureNumberPositiveOverride()
      );
      expect(mock.isFeatureStringEmpty()).toBe(isFeatureStringEmptyOverride());

      expect(mock.entities()).toBe(entitiesOverride());
      expect(mock.entityMap()).toBe(entityMapOverride());

      // Reactive updates propagate
      statusOverride.set('ready');
      countOverride.set(11);
      doubleOverride.set(9);
      nestedValueOverride.set(100);

      featureNumberOverride.set(43);
      featureStringOverride.set('newString');
      isFeatureNumberPositiveOverride.set(false);
      isFeatureStringEmptyOverride.set(true);

      const updatedEntity = { id: 1, text: 'Updated Entity', completed: true };
      entitiesOverride.set([updatedEntity]);
      entityMapOverride.set({ 1: updatedEntity });

      expect(mock.status()).toBe('ready');
      expect(mock.count()).toBe(11);
      expect(mock.double()).toBe(9);
      expect(mock.nested().value).toBe(100);

      expect(mock.featureNumber()).toBe(43);
      expect(mock.featureString()).toBe('newString');
      expect(mock.isFeatureNumberPositive()).toBe(false);
      expect(mock.isFeatureStringEmpty()).toBe(true);

      expect(mock.entities()).toEqual([updatedEntity]);
      expect(mock.entityMap()).toEqual({ 1: updatedEntity });
    };

    execTest(false);
    execTest(true);
  });

  it('should override methods with provided mocks', () => {
    const execTest = (withoutInitialValues: boolean) => {
      let incrementCalls = 0;
      const incrementOverride = () => {
        incrementCalls++;
      };
      let status = '';
      const setStatusOverride = (s: string) => {
        status = s;
      };
      let featureString = '';
      const setFeatureStringOverride = (s: string) => {
        featureString = s;
      };
      let incrementFeatureNumberCalls = 0;
      const incrementFeatureNumberOverride = () => {
        incrementFeatureNumberCalls++;
      };
      let entity = { id: 0, name: '' };
      const addEntityOverride = (id: number, name: string) => {
        entity.id = id;
        entity.name = name;
      };
      let removedEntityId = 0;
      const removeEntityOverride = (id: number) => {
        removedEntityId = id;
      };
      const mock = createSignalStoreMock(exampleStore, {
        overrideMethods: {
          increment: incrementOverride,
          setStatus: setStatusOverride,
          setFeatureString: setFeatureStringOverride,
          incrementFeatureNumber: incrementFeatureNumberOverride,
          addEntity: addEntityOverride,
          removeEntity: removeEntityOverride,
        },
        providers: [INJECTED_STATE],
        withoutInitialValues,
      });

      mock.setStatus('loading');
      expect(status).toBe('loading');
      mock.increment();
      expect(incrementCalls).toBe(1);

      // Signal store feature methods
      mock.setFeatureString('feature');
      expect(featureString).toBe('feature');
      mock.incrementFeatureNumber();
      expect(incrementFeatureNumberCalls).toBe(1);

      // Entity manager store feature methods
      mock.addEntity(2, 'Entity2');
      expect(entity).toEqual({ id: 2, name: 'Entity2' });
      mock.removeEntity(2);
      expect(removedEntityId).toBe(2);
    };

    execTest(false);
    execTest(true);
  });

  it('should reflect signal updates after resubscription-like reads', () => {
    const countSig = signal(5);
    const mock = createSignalStoreMock(exampleStore, {
      overrideSelectors: { count: countSig },
      providers: [INJECTED_STATE],
    });
    expect(mock.count()).toBe(5);
    countSig.set(6);
    expect(mock.count()).toBe(6);
  });
});

function createSignalStore(preventOnInitThrow = false) {
  return signalStore(
    { providedIn: 'root' },
    withRootGuard(),
    withOptionalHooks(() => ({
      onInit: () => {
        inject(TestService); // ensure TestService is injected to test DI in methods
        if (!preventOnInitThrow) {
          throw new Error('Should not be called in tests');
        }
      },
    })),
    withState({
      count: 1,
      status: 'idle' as 'idle' | 'loading' | 'ready',
      nested: { value: 42 },
    }),
    withComputed((store) => ({
      double: computed(() => store.count() * 2),
      statusLength: computed(() => store.status().length),
    })),
    withMethods((store, testService = inject(TestService)) => ({
      setStatus: (s: 'idle' | 'loading' | 'ready') => {}, // irrelevant since it will be mocked,
      increment: () => {
        testService.increment();
      }, // irrelevant since it will be mocked,
    })),
    withSignalStoreFeature(),
    withEntityManagerStoreFeature()
  );
}

function withSignalStoreFeature() {
  return signalStoreFeature(
    withState(() => inject(INJECTED_STATE)),
    withComputed(({ featureString, featureNumber }) => ({
      isFeatureStringEmpty: computed(() => featureString().length === 0),
      isFeatureNumberPositive: computed(() => featureNumber() > 0),
    })),
    withMethods(() => ({
      setFeatureString: (v: string) => {}, // irrelevant since it will be mocked,
      incrementFeatureNumber: () => {}, // irrelevant since it will be mocked,
    }))
  );
}

function withEntityManagerStoreFeature() {
  return signalStoreFeature(
    withEntities<{
      id: number;
      text: string;
      completed: boolean;
    }>(),
    withMethods(() => ({
      addEntity: (id: number, name: string) => {}, // irrelevant since it will be mocked,
      removeEntity: (id: number) => {}, // irrelevant since it will be mocked,
    }))
  );
}
