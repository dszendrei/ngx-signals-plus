# Ngx Signals Plus

Additional Signals to improve developer experience.

## Usage

### BindableSignal:

Originally designed as a replacement for Angular's toSignal, it can also be used to convert an Observable into a Signal. However, unlike toSignal, it supports lazy binding, can be unbound at any time, and can even be bound to other Signals. For more details, check out this **[article](https://medium.com/p/3aab51fb0cca)** on Medium.

```ts
@Component({
  selector: "app-loader",
  standalone: true,
  imports: [],
  template: `
    @for (comp of subComponents(); track $index) {
    <div>...</div>
    }
  `,
})
export class LoaderComponent implements OnInit {
  readonly url = input.required<string>();

  private readonly httpClient = inject(HttpClient);

  readonly subComponents: BindableSignal<string[]> = bindable(["default sub component"]);

  ngOnInit(): void {
    this.subComponents.bindTo(this.httpClient.get<string[]>(this.url()));
  }
}
```

### EventSignal & signalFromEvent:

EventSignal is a special type of signal that comes with two additional methods: attachActivator and deactivate. It’s also the return type of signalFromEvent, a function inspired by the popular fromEvent function in NgRx. However, signalFromEvent goes beyond the basics, offering enhanced functionality and returning a signal. Here are some of its standout features:

- Signal-based Targets: Perfect for scenarios using viewChild(), it dynamically adds or removes event listeners based on the truthiness of the target signal.
- Dynamic Event Names: Supports signal-based event names or collections of event names, allowing for the flexible addition and removal of listeners for multiple event types.
- Efficient Deactivation: Event listeners can be deactivated and reactivated with a boolean, a Signal<boolean>, or an Observable<boolean>. Deactivation also removes the event listener, making it more performance-friendly than simply using the filter operator, which blocks emissions but keeps the event listener active.

To demonstrate its functionality, imagine implementing a signal<{ x: number, y: number }> to update the transform property of a child element based on the mouse's position while dragging it. For a more detailed walkthrough, check out this **[article](https://medium.com/p/8138c57353d6)** on Medium.

```ts
type EventTypes = "mousedown" | "mousemove" | "mouseup";

@Component({
  selector: "app-child",
  standalone: true,
  imports: [],
  template: "<p>Text is now draggable!</p>",
})
export class ChildComponent {}

@Component({
  selector: "app-root",
  standalone: true,
  imports: [ChildComponent],
  template: `
    <h1>Hello, Event Signal Fan Club</h1>
    @if (enableViewChild()) {
    <div>
      <app-child [style]="dragCoordinates()"></app-child>
    </div>
    }
  `,
})
export class AppComponent implements OnInit {
  enableViewChild = signal(false);

  viewChildSignal = viewChild(ChildComponent, {
    read: ElementRef<ChildComponent>,
  });
  private readonly activator = signal(false);

  private readonly currentlyListenedType = signal<EventTypes | EventTypes[]>("mousedown");

  private readonly dragSignal = signalFromEvent<MouseEvent, { x: number; y: number }>(this.currentlyListenedType, {
    target: this.viewChildSignal,
    tap: (event) => {
      if (event.type === "mousedown") {
        this.currentlyListenedType.set(["mousemove", "mouseup"]);
      } else if (event.type === "mouseup") {
        this.enableViewChild.set(false);
        this.currentlyListenedType.set("mousedown");
      }
    },
    resultSelector: (event) => {
      return {
        x: event?.pageX ?? 80,
        y: event?.pageY ?? 100,
      };
    },
    initialValue: { x: 80, y: 100 },
  });

  readonly dragCoordinates = computed(() => {
    return `transform: translate(${this.dragSignal().x - 30}px, ${this.dragSignal().y - 30}px)`;
  });

  constructor() {
    this.dragSignal.attachActivator(this.activator);

    signalFromEvent("click", {
      activate: true,
      tap: () => {
        this.enableViewChild.set(true);
      },
    });
  }

  ngOnInit(): void {
    this.activator.set(true);
  }
}
```

### toBehaviorObservable:

This implementation closely resembles the original toObservable() but introduces a few key differences:

- Always up-to-date initial value: The initial value is provided by a custom operator called lazyStartWith, which evaluates the signal at subscription time. This guarantees that the emitted value is the latest signal state, even if the signal was updated just before subscribing.
- Effect created on subscription: The Angular effect that tracks signal changes is only created when the observable is subscribed to. This avoids premature signal access, unnecessary effect binding and updates.
- Hot observable via shareReplay: To avoid creating a new effect for every subscriber, and to ensure consistent initial value delivery, the observable is transformed into a hot stream using shareReplay({ bufferSize: 1, refCount: true }).

Together, these changes make the implementation behave very similarly to a BehaviorSubject: it always has a current value, emits it synchronously on subscription, and continues to emit updates reactively. Hence the name: toBehaviorObservable.

Use toBehaviorObservable() exactly as you would use toObservable(), but with the added benefit of having the latest initial value.
For a more detailed walkthrough, check out this **[article](https://medium.com/p/d6b2b1fa70a8)** on Medium.

### createSignalStoreMock:

Builds a lightweight mock instance of an @ngrx/signals SignalStore. For an explanation and example, check out this **[article](https://medium.com/p/ead7dbe84694)** on Medium.

What it does:

1.  Instantiates the provided store class (storeConstructor).
2.  Extracts its current plain state via getState.
3.  Mocks every inject() calls without the injection context (in case of an injected dependency in the withMethods).
4.  Wraps every top-level state property in a signal (signalifiedState).
5.  Applies selector overrides (overrideSelectors):
    - All overridden selector entries are returned the provided signals.
    - So in the tests calling the set method on the provided signal will update the value in the store.
6.  Creates a deepComputed signal (deepSignal) that unwraps those selector signals to
    expose a read-only DeepSignal as how the real store would.
    This keeps dependency tracking so updates propagate.
7.  Attaches method overrides (overrideMethods) as supplied mock instances to mock the withMethods functions.
8.  Auto-mocks any remaining functions (that are not signals).
    - Detects availability of jest.fn() or jasmine.createSpy().
    - If neither is available, creates a stub: (...args: any[]) => {};.
9.  Returns the composite object typed as MockSignalStore<T> (original instance shape minus STATE_SOURCE).
10. Supports additional providers to be injected in the withState factory function in case the withState is resolved with an injected factory function. You can use the InjectionToken directly or a provider with the useFactory.

Why deepComputed?

- It returns a DeepSignal just like the real SignalStore.
- Consumers expecting the real store read selectors like plain values through
  the deep signal; tests can still mutate underlying signals directly.

Typing details:

- MockSelectorOverrides<T>: only non-method keys (selectors/state slices). Use `deepComputed` for complex objects.
- MockMethodOverrides<T>: only method keys, each replaced by a provided jasmine or jest mock.

Typical usage:

```ts
const MyStore = signalStore(
  withState({ status: Status.Initial, error?: { code: number, message: string } }),
  withMethods(store => ({update: ...}))
);

const status = signal(Status.Initial);
const error = signal<{ code: number; message: string } | undefined>(undefined);
const update = **jest or jasmine spy**;

const store = createSignalStoreMock(MyStore, {
  overrideSelectors: { status, deepComputed(error) },
  overrideMethods: { update }
});

status.set(Status.Ready); // mutate
expect(store.update).toHaveBeenCalled();
```

If the withState is using an injected factory function:

```ts
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

const MyStore = signalStore(
  withState(() => inject(INJECTED_STATE)),
  ...
);

// Option A — pass the InjectionToken with the factory function:
const mockA = createSignalStoreMock(MyStore, {
  providers: [INJECTED_STATE] // will resolve INJECTED_STATE.ɵprov.factory() during mock creation
});

// Option B — pass a provider with useFactory (explicit):
const mockB = createSignalStoreMock(MyStore, {
  providers: [
    {
      provide: INJECTED_STATE,
      useFactory: () => initialInjectedState, // value used as initial state input
    },
  ],
});
```
