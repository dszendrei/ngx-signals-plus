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
