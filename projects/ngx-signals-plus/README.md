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
