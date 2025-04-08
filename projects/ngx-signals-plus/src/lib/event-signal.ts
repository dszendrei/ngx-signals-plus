import {
  DestroyRef,
  effect,
  EffectRef,
  ElementRef,
  inject,
  Injector,
  isSignal,
  signal,
  Signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, Subscription, throttleTime } from 'rxjs';
import { HasEventTargetAddRemove } from 'rxjs/internal/observable/fromEvent';
import { asyncScheduler } from 'rxjs/internal/scheduler/async';
import { Subject } from 'rxjs/internal/Subject';

export type EventSignal<T> = Signal<T> & {
  attachActivator: (
    activator: true | Signal<boolean> | Observable<boolean>
  ) => void;
  deactivate: () => void;
};

type Listener<T> = {
  listening: boolean;
  target: Signal<ElementRef<HasEventTargetAddRemove<T>> | undefined>;
  eventName: Signal<string | string[]>;
  eventListener: (event: T) => void;
  options?: EventListenerOptions;
};

export type SignalFromEventOptions<T extends Event, R = never> = {
  target?:
    | HasEventTargetAddRemove<T>
    | Signal<ElementRef<HasEventTargetAddRemove<T>> | undefined>;
  eventListenerOptions?: AddEventListenerOptions;
  tap?: (event: T) => void;
  resultSelector?: (event: T) => R;
  initialValue?: R;
  activate?: boolean;
  injector?: Injector;
};

/**
 * Creates an `EventSignal` based on DOM events, similar to the `fromEvent` function from NgRx,
 * but returns a `Signal` with enhanced capabilities, including dynamic event management and
 * activation controls for better performance and usability.
 *
 * @template T The type of the DOM event.
 * @template R The transformed result type of the event, defaulting to `T`. If provided options.resultSelector has to defined.
 *
 * @param {string | string[] | Signal<string | string[]>} eventName
 * The name(s) of the event(s) to listen for. Supports a single string, an array of strings,
 * or a `Signal` that dynamically updates the event names.
 *
 * @param {SignalFromEventOptions<T, R>} [options]
 * Configuration options for the `signalFromEvent`. These options allow for additional customizations:
 *
 * - **target**: Specifies the event target. Supports a `HasEventTargetAddRemove<T>`, a `Signal` resolving
 *   to an `ElementRef` containing the target, or is inferred from the ElementRef of the component automatically when undefined.
 * - **eventListenerOptions**: The options for the underlying `addEventListener` call.
 * - **tap**: A function invoked on every event, allowing side effects without modifying the result.
 * - **resultSelector**: A transformation function that maps the event to the desired output type `R`. If not provided, the event itself is returned (default behavior).
 * - **initialValue**: An initial value for the signal before any events occur. Can only be provided with a resultSelector since giving initial value to an event is not useful.
 * - **activate**: A flag indicating whether the signal should be activated immediately.
 * - **injector**: Specifies a custom dependency injector, defaulting to the current injector. Also used to call the function outside of the injection context.
 *
 * @returns {EventSignal<R | undefined>}
 * Returns an `EventSignal` with additional methods:
 * - **attachActivator**: Attaches an activator to control the event listener's lifecycle.
 *   Accepts `true`, a `Signal<boolean>`, or an `Observable<boolean>`. Deactivating removes the event listener.
 * - **deactivate**: Deactivates the event signal, removing the associated event listeners.
 *
 * ### Features:
 * - **Signal-Based Targets**: Dynamically attach or detach listeners based on the truthiness of a `Signal`.
 * - **Dynamic Event Names**: Supports updating event types dynamically using a `Signal` or a collection of event names.
 * - **Efficient Deactivation**: Removes event listeners when deactivated, reducing memory usage and improving performance
 *   compared to reactive operators like `filter` that retain listeners.
 *
 * ### Example:
 * Getting the mouse's position while moving the mouse over a child element:
 *
 * ```typescript
 * const mousePosition = signalFromEvent<MouseEvent, { x: number, y: number }>('mousemove', {
 *   target: viewChild(...),
 *   resultSelector: (event) => ({ x: event.clientX, y: event.clientY }),
 *   activate: true,
 * });
 *
 * effect(() => {
 *   const { x, y } = mousePosition();
 *   // do something
 * });
 * ```
 *
 * For more details, refer to the **[documentation or article](https://medium.com/p/8138c57353d6)**.
 */
export function signalFromEvent<T extends Event>(
  eventName: string | string[] | Signal<string | string[]>,
  options?: SignalFromEventOptions<T>
): EventSignal<T | undefined>;
export function signalFromEvent<T extends Event, R>(
  eventName: string | string[] | Signal<string | string[]>,
  options: SignalFromEventOptions<T, R> & {
    resultSelector: (event: T) => R;
  } & { initialValue?: never }
): EventSignal<R | undefined>;
export function signalFromEvent<T extends Event, R>(
  eventName: string | string[] | Signal<string | string[]>,
  options: SignalFromEventOptions<T, R> & {
    resultSelector: (event: T) => R;
  } & { initialValue: R }
): EventSignal<R>;

export function signalFromEvent<T extends Event, R = T>(
  eventName: string | string[] | Signal<string | string[]>,
  options?: SignalFromEventOptions<T, R>
): EventSignal<R | undefined> {
  const injector = options?.injector ?? inject(Injector);
  const destroyRef = injector.get(DestroyRef);

  const optionsTarget = options?.target;
  const listenerTarget: Signal<
    ElementRef<HasEventTargetAddRemove<T>> | undefined
  > =
    optionsTarget === undefined
      ? signal(
          injector.get(ElementRef<HasEventTargetAddRemove<T>>)
        ).asReadonly()
      : isSignal(optionsTarget)
      ? optionsTarget
      : signal({ nativeElement: optionsTarget } as ElementRef).asReadonly();

  const eventNameSignal = isSignal(eventName) ? eventName : signal(eventName);

  const eventSignal = signal<R | undefined>(options?.initialValue);

  const resultSelector =
    options?.resultSelector ??
    ((value: T) => {
      return value as unknown as R; // if resultSelector is not defined, R has to be T
    });

  const eventListener: (event: T) => void = (event: T) => {
    if (options?.tap !== undefined) {
      options.tap(event);
    }
    eventSignal.set(resultSelector(event));
  };

  let activatorAttached = false;
  let listener: Listener<T> = {
    listening: false,
    target: listenerTarget,
    eventName: eventNameSignal,
    eventListener,
    options: options?.eventListenerOptions,
  };

  let effectRef: EffectRef | undefined = undefined;
  let subscription: Subscription | undefined = undefined;

  const terminateUpdaters = () => {
    if (effectRef !== undefined) {
      effectRef.destroy();
      effectRef = undefined;
    } else if (subscription !== undefined) {
      subscription.unsubscribe();
      subscription = undefined;
    }
  };

  let deactivate: () => void = () => {
    terminateUpdaters();
    removeEventListenerFromTarget(listener);
    activatorAttached = false;
    activatorProxy = undefined;
  };

  let activatorProxy: true | Signal<boolean> | Observable<boolean> | undefined =
    undefined;

  const activateProxySource = new Subject<void>();
  activateProxySource
    .pipe(
      throttleTime(0, asyncScheduler, { leading: false, trailing: true }),
      takeUntilDestroyed(injector.get(DestroyRef))
    )
    .subscribe(() => {
      if (activatorProxy !== undefined) {
        activatorAttached = false;
        attachActivator(activatorProxy);
      }
    });

  let previousListenerTarget:
    | ElementRef<HasEventTargetAddRemove<T>>
    | undefined = listenerTarget();
  const listenerChangeEffectRef = effect(
    () => {
      const listenerTargetValue = listenerTarget();
      if (
        activatorAttached === false ||
        previousListenerTarget === listenerTargetValue
      ) {
        return;
      }
      if (listenerTargetValue !== undefined) {
        if (previousListenerTarget?.nativeElement !== undefined) {
          removeEventListenerFromTarget(listener, {
            target: previousListenerTarget.nativeElement,
          });
        }
        activateProxySource.next();
      } else {
        listener.listening = false;
      }
      previousListenerTarget = listenerTargetValue;
    },
    { injector }
  );

  let previousEventName = eventNameSignal();
  const eventNameChangeEffectRef = effect(
    () => {
      const eventName = eventNameSignal();
      if (eventName !== previousEventName) {
        removeEventListenerFromTarget(listener, {
          eventName: previousEventName,
        });
        activateProxySource.next();
        previousEventName = eventName;
      }
    },
    { injector }
  );

  destroyRef.onDestroy(() => {
    deactivate();
    listenerChangeEffectRef.destroy();
    eventNameChangeEffectRef.destroy();
  });

  const attachActivator = (
    activator: true | Signal<boolean> | Observable<boolean>
  ) => {
    if (activatorAttached) {
      throw new Error(
        'Cannot attach another activator! EventSignal is already attached to an activator! Call deactivate first!'
      );
    }

    terminateUpdaters();

    activatorAttached = true;
    activatorProxy = activator;

    if (listenerTarget() === undefined) {
      return;
    }

    if (activator === true) {
      addEventListenerToTarget(listener);
    } else if (isSignal(activator)) {
      effectRef = effect(
        () => addOrRemoveEventListener(activator(), listener),
        {
          injector,
          allowSignalWrites: true,
        }
      );
    } else {
      subscription = activator.subscribe((activate) =>
        addOrRemoveEventListener(activate, listener)
      );
    }
  };

  if (options?.activate === true) {
    attachActivator(true);
  }

  return Object.assign(eventSignal.asReadonly(), {
    attachActivator,
    deactivate,
  }) as EventSignal<R | undefined>;
}

function addOrRemoveEventListener<T>(activate: boolean, listener: Listener<T>) {
  activate
    ? addEventListenerToTarget(listener)
    : removeEventListenerFromTarget(listener);
}

function addEventListenerToTarget<T>(listener: Listener<T>) {
  const target = listener.target()?.nativeElement;
  const eventName = listener.eventName();
  if (target !== undefined && listener.listening === false) {
    for (const eName of Array.isArray(eventName) ? eventName : [eventName]) {
      target.addEventListener(eName, listener.eventListener, listener.options);
    }
    listener.listening = true;
  }
}

function removeEventListenerFromTarget<T>(
  listener: Listener<T>,
  previousListener?: {
    target?: HasEventTargetAddRemove<T>;
    eventName?: string | string[];
  }
) {
  const target = previousListener?.target ?? listener.target()?.nativeElement;
  const eventName = previousListener?.eventName ?? listener.eventName();
  if (target !== undefined && listener.listening === true) {
    for (const eName of Array.isArray(eventName) ? eventName : [eventName]) {
      target.removeEventListener(
        eName,
        listener.eventListener,
        listener.options
      );
    }
  }
  listener.listening = false;
}
