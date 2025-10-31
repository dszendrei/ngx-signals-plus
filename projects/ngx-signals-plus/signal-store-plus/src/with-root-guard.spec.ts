import {
  ApplicationRef,
  Component,
  createNgModule,
  inject,
  NgModule,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { signalStore, withState } from '@ngrx/signals';
import { withRootGuard } from './with-root-guard';

describe('withRootGuard', () => {
  it('should create a signal store with state', (done) => {
    let exampleStore: ReturnType<typeof createSignalStore>;
    let storeInstance: InstanceType<typeof exampleStore>;
    exampleStore = createSignalStore();

    TestBed.runInInjectionContext(() => {
      storeInstance = inject(exampleStore);
      expect(storeInstance).toBeDefined();
      done();
    });
  });

  it('should throw an error if the store is provided a component', async () => {
    const exampleStore = createSignalStore();

    @Component({
      selector: 'app-root',
      template: `{{ store.count() }}`,
      providers: [exampleStore],
      standalone: false,
    })
    class TestAppComponent {
      readonly store = inject(exampleStore);
    }

    await TestBed.configureTestingModule({
      declarations: [TestAppComponent],
    }).compileComponents();

    expect(() => {
      TestBed.createComponent(TestAppComponent);
    }).toThrowError(
      'Root provided Store must not be provided in modules or components.'
    );
  });

  it('should throw an error if the store is provided a standalone component', async () => {
    const exampleStore = createSignalStore();

    @Component({
      selector: 'app-root',
      template: `{{ store.count() }}`,
      providers: [exampleStore],
      standalone: true,
    })
    class TestAppComponent {
      readonly store = inject(exampleStore);
    }

    await TestBed.configureTestingModule({
      imports: [TestAppComponent],
    }).compileComponents();

    expect(() => {
      TestBed.createComponent(TestAppComponent);
    }).toThrowError(
      'Root provided Store must not be provided in modules or components.'
    );
  });

  it('should throw an error if the store is provided a module', () => {
    const exampleStore = createSignalStore();

    @NgModule({
      providers: [exampleStore],
    })
    class TestAppModule {
      readonly store = inject(exampleStore);
    }

    expect(() => {
      createNgModule(TestAppModule, TestBed.inject(ApplicationRef).injector);
    }).toThrowError(
      'Root provided Store must not be provided in modules or components.'
    );
  });
});

function createSignalStore() {
  return signalStore(
    { providedIn: 'root' },
    withRootGuard(),
    withState({
      count: 1,
    })
  );
}
