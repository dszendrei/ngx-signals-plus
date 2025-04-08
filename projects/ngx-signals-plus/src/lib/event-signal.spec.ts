import {
  Component,
  ElementRef,
  Injector,
  Signal,
  WritableSignal,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import {
  ComponentFixture,
  fakeAsync,
  TestBed,
  tick,
  waitForAsync,
} from '@angular/core/testing';
import {
  EventSignal,
  signalFromEvent,
  SignalFromEventOptions,
} from './event-signal';
import { of, Subject } from 'rxjs';

const MOCK_EVENT_TYPE = 'mockEventType' as const;

@Component({
  selector: 'test-component',
  template: `@if(enableChild()) {
    <div #child></div>
    }`,
})
class TestComponent {
  eventSignal = signalFromEvent(MOCK_EVENT_TYPE);
  injector = inject(Injector);

  enableChild = signal(true);
  child = viewChild<unknown, ElementRef<HTMLElement>>('child', {
    read: ElementRef,
  });

  createEventSignalLazily<T extends Event, R = T>(
    options?: SignalFromEventOptions<T, R> & {
      type?: string | string[] | Signal<string | string[]>;
    }
  ): EventSignal<R | undefined> {
    return signalFromEvent<T, R>(
      options?.type ?? MOCK_EVENT_TYPE,
      options as any // any is used to avoid restrictions with provided R type and resultSelector function
    );
  }
}

describe('event-signal.ts', () => {
  let fixture: ComponentFixture<TestComponent>;
  let component: TestComponent;
  let eventSignal: EventSignal<Event | undefined>;
  let injector: Injector;
  let createEventSignalLazily: <T extends Event, R = T>(
    options?: SignalFromEventOptions<T, R> & {
      type?: string | string[] | Signal<string | string[]>;
    }
  ) => EventSignal<R | undefined>;
  let child: Signal<ElementRef<HTMLElement> | undefined>;
  let enableChild: WritableSignal<boolean>;
  let mockEvent: Event;

  beforeEach(waitForAsync(() => {
    fixture = TestBed.createComponent(TestComponent);
    component = fixture.componentInstance;
    eventSignal = component.eventSignal;
    injector = component.injector;
    createEventSignalLazily = component.createEventSignalLazily;
    child = component.child;
    enableChild = component.enableChild;
    mockEvent = new Event(MOCK_EVENT_TYPE);
  }));

  describe('signalFromEvent', () => {
    it('should create event signal', () => {
      expect(eventSignal).toBeDefined();
    });

    it('should not require injection context if injector is provided', () => {
      const lazyEventSignal = createEventSignalLazily({
        injector,
      });

      expect(lazyEventSignal).toBeDefined();
    });

    it('should require injection context if injector is not provided', () => {
      expect(() =>
        createEventSignalLazily({
          injector: undefined,
        })
      ).toThrow();
    });

    it('should use the elementRef of the component if target is not defined', () => {
      const componentNativeElement = fixture.nativeElement as HTMLElement;
      const addEventListenerSpy = spyOn(
        componentNativeElement,
        'addEventListener'
      ).and.callThrough();

      eventSignal.attachActivator(true);
      componentNativeElement.dispatchEvent(mockEvent);

      expect(addEventListenerSpy).toHaveBeenCalled();
      expect(eventSignal()).toBe(mockEvent);
    });

    it('should use the elementRef of the component if target is not defined and the event signal created lazily', () => {
      const componentNativeElement = fixture.nativeElement as HTMLElement;
      const addEventListenerSpy = spyOn(
        componentNativeElement,
        'addEventListener'
      ).and.callThrough();

      const lazyEventSignal = createEventSignalLazily({
        injector,
        activate: true,
      });
      componentNativeElement.dispatchEvent(mockEvent);

      expect(addEventListenerSpy).toHaveBeenCalled();
      expect(lazyEventSignal()).toBe(mockEvent);
    });

    it('should use the defined target to add event listener instead of the component elementRef', () => {
      const componentNativeElement = fixture.nativeElement as HTMLElement;
      const addEventListenerToElementRefSpy = spyOn(
        componentNativeElement,
        'addEventListener'
      );
      const target = document.createElement('div');
      const addEventListenerToTargetSpy = spyOn(
        target,
        'addEventListener'
      ).and.callThrough();

      const lazyEventSignal = createEventSignalLazily({
        target,
        injector,
        activate: true,
      });
      target.dispatchEvent(mockEvent);

      expect(addEventListenerToElementRefSpy).not.toHaveBeenCalled();
      expect(addEventListenerToTargetSpy).toHaveBeenCalled();
      expect(lazyEventSignal()).toBe(mockEvent);
    });

    it('should use the defined signal target to add event listener instead of the component elementRef', () => {
      const addEventListenerToElementRefSpy = spyOn(
        fixture.nativeElement,
        'addEventListener'
      );

      fixture.detectChanges();

      const childComponent = child()?.nativeElement;
      if (childComponent === undefined) {
        throw new Error('Child component should not be undefined!');
      }
      const addEventListenerToTargetSpy = spyOn(
        childComponent,
        'addEventListener'
      ).and.callThrough();

      const lazyEventSignal = createEventSignalLazily({
        target: child,
        injector,
        activate: true,
      });
      childComponent.dispatchEvent(mockEvent);

      expect(addEventListenerToElementRefSpy).not.toHaveBeenCalled();
      expect(addEventListenerToTargetSpy).toHaveBeenCalled();
      expect(lazyEventSignal()).toBe(mockEvent);
    });

    it('should use the defined signal target to add event listener if signal target is created after the the activator was attached', fakeAsync(() => {
      const addEventListenerToElementRefSpy = spyOn(
        fixture.nativeElement,
        'addEventListener'
      );
      enableChild.set(false);

      fixture.detectChanges();
      const lazyEventSignal = createEventSignalLazily({
        target: child,
        injector,
        activate: true,
      });

      enableChild.set(true);
      fixture.detectChanges();
      tick();

      const childComponent = child()?.nativeElement as HTMLElement;
      expect(childComponent).toBeDefined();
      childComponent.dispatchEvent(mockEvent);

      expect(addEventListenerToElementRefSpy).not.toHaveBeenCalled();
      expect(lazyEventSignal()).toBe(mockEvent);
    }));

    it('should be able to get updates from a recreated child component', fakeAsync(() => {
      fixture.detectChanges();

      const lazyEventSignal = createEventSignalLazily({
        target: child,
        injector,
        activate: true,
      });

      enableChild.set(false);
      fixture.detectChanges();

      let childComponent = child()?.nativeElement as HTMLElement;
      expect(childComponent).not.toBeDefined();

      enableChild.set(true);
      fixture.detectChanges();
      tick();

      childComponent = child()?.nativeElement as HTMLElement;
      expect(childComponent).toBeDefined();
      childComponent.dispatchEvent(mockEvent);

      expect(lazyEventSignal()).toBe(mockEvent);
    }));

    it('should not get updates from a recreated child component if the event signal was deactivated in the meanwhile', fakeAsync(() => {
      fixture.detectChanges();

      const lazyEventSignal = createEventSignalLazily({
        target: child,
        injector,
        activate: true,
      });

      enableChild.set(false);
      fixture.detectChanges();

      let childComponent = child()?.nativeElement as HTMLElement;
      expect(childComponent).not.toBeDefined();

      lazyEventSignal.deactivate();
      enableChild.set(true);
      fixture.detectChanges();
      tick();

      childComponent = child()?.nativeElement as HTMLElement;
      expect(childComponent).toBeDefined();
      childComponent.dispatchEvent(mockEvent);

      expect(lazyEventSignal()).toBe(undefined);
    }));

    it('should be able to get updates from new element if the target changes but not get update from the previous element', fakeAsync(() => {
      const firstElement = document.createElement('div');
      const targetSignal = signal<ElementRef>({
        nativeElement: firstElement,
      });

      fixture.detectChanges();

      const lazyEventSignal = createEventSignalLazily({
        target: targetSignal,
        injector,
        activate: true,
      });

      tick();

      firstElement.dispatchEvent(mockEvent);

      expect(lazyEventSignal()).toBe(mockEvent);

      const secondElement = document.createElement('span');
      targetSignal.set({
        nativeElement: secondElement,
      });

      tick();

      const newEvent = new Event(MOCK_EVENT_TYPE);
      secondElement.dispatchEvent(newEvent);

      const ignoredEvent = new Event(MOCK_EVENT_TYPE);
      firstElement.dispatchEvent(ignoredEvent);

      expect(lazyEventSignal()).toBe(newEvent);
    }));

    it('should not get updates anymore from the first target after the target signal new value is undefined', fakeAsync(() => {
      const firstElement = document.createElement('div');
      const targetSignal = signal<ElementRef>({
        nativeElement: firstElement,
      });

      fixture.detectChanges();

      const lazyEventSignal = createEventSignalLazily({
        target: targetSignal,
        injector,
        activate: true,
      });

      tick();

      firstElement.dispatchEvent(mockEvent);

      expect(lazyEventSignal()).toBe(mockEvent);

      const secondElement = undefined;
      targetSignal.set({
        nativeElement: secondElement,
      });

      tick();

      const ignoredEvent = new Event(MOCK_EVENT_TYPE);
      firstElement.dispatchEvent(ignoredEvent);

      expect(lazyEventSignal()).toBe(mockEvent);
    }));

    it('should get updates for only the latest event name/type', fakeAsync(() => {
      const eventName = signal<string>(MOCK_EVENT_TYPE);
      const componentNativeElement = fixture.nativeElement as HTMLElement;

      fixture.detectChanges();

      const lazyEventSignal = createEventSignalLazily({
        type: eventName,
        injector,
        activate: true,
      });

      componentNativeElement.dispatchEvent(mockEvent);

      expect(lazyEventSignal()).toBe(mockEvent);

      const anotherEventName = 'anotherEventName';
      const anotherEvent = new Event(anotherEventName);
      eventName.set(anotherEventName);

      tick();

      componentNativeElement.dispatchEvent(anotherEvent);

      expect(lazyEventSignal()).toBe(anotherEvent);
    }));

    it('should get updates from all the event names/types', fakeAsync(() => {
      const anotherEventName = 'anotherEventName';
      const componentNativeElement = fixture.nativeElement as HTMLElement;

      fixture.detectChanges();

      const lazyEventSignal = createEventSignalLazily({
        type: signal<string[]>([MOCK_EVENT_TYPE, anotherEventName]),
        injector,
        activate: true,
      });

      componentNativeElement.dispatchEvent(mockEvent);

      expect(lazyEventSignal()).toBe(mockEvent);

      const anotherEvent = new Event(anotherEventName);

      tick();

      componentNativeElement.dispatchEvent(anotherEvent);

      expect(lazyEventSignal()).toBe(anotherEvent);

      componentNativeElement.dispatchEvent(new Event('ignored'));

      expect(lazyEventSignal()).toBe(anotherEvent);
    }));

    it('should not get updates from any of the event names/types after the activator was deactivated', fakeAsync(() => {
      const anotherEventName = 'anotherEventName';
      const componentNativeElement = fixture.nativeElement as HTMLElement;

      fixture.detectChanges();

      const lazyEventSignal = createEventSignalLazily({
        type: signal<string[]>([MOCK_EVENT_TYPE, anotherEventName]),
        injector,
        activate: true,
      });

      lazyEventSignal.deactivate();

      componentNativeElement.dispatchEvent(mockEvent);

      expect(lazyEventSignal()).toBe(undefined);

      const anotherEvent = new Event(anotherEventName);

      tick();

      componentNativeElement.dispatchEvent(anotherEvent);

      expect(lazyEventSignal()).toBe(undefined);
    }));

    it('should get updates for only the latest event name/type and latest elementRef', fakeAsync(() => {
      const firstElement = document.createElement('div');
      spyOn(firstElement, 'removeEventListener').and.callThrough();
      const targetSignal = signal<ElementRef>({
        nativeElement: firstElement,
      });
      const eventName = signal<string>(MOCK_EVENT_TYPE);

      fixture.detectChanges();

      const lazyEventSignal = createEventSignalLazily({
        target: targetSignal,
        type: eventName,
        injector,
        activate: true,
      });

      firstElement.dispatchEvent(mockEvent);

      expect(lazyEventSignal()).toBe(mockEvent);
      const anotherEventName = 'anotherEventName';
      const anotherEvent = new Event(anotherEventName);
      eventName.set(anotherEventName);

      const secondElement = document.createElement('span');
      spyOn(secondElement, 'removeEventListener').and.callThrough();
      targetSignal.set({
        nativeElement: secondElement,
      });

      tick();

      const ignoredEvent = new Event(anotherEvent.type);
      secondElement.dispatchEvent(anotherEvent);
      secondElement.dispatchEvent(mockEvent);
      firstElement.dispatchEvent(ignoredEvent);

      expect(lazyEventSignal()).toBe(anotherEvent);
      // even if two inputs changed, remove of the event listener should not happen unnecessarily.
      expect(firstElement.removeEventListener).toHaveBeenCalledTimes(1);
      expect(secondElement.removeEventListener).not.toHaveBeenCalled();
    }));

    it('should call the tap function on every event', fakeAsync(() => {
      let lastEvent: Event | undefined = undefined;
      const tap = (event: Event) => {
        lastEvent = event;
      };
      const firstElement = document.createElement('div');
      const targetSignal = signal<ElementRef>({
        nativeElement: firstElement,
      });
      const eventName = signal<string>(MOCK_EVENT_TYPE);

      fixture.detectChanges();

      createEventSignalLazily({
        target: targetSignal,
        type: eventName,
        injector,
        activate: true,
        tap,
      });

      firstElement.dispatchEvent(mockEvent);

      expect(lastEvent!).toBe(mockEvent);
      lastEvent = undefined;
      const anotherEventName = 'anotherEventName';
      const anotherEvent = new Event(anotherEventName);
      eventName.set(anotherEventName);

      const secondElement = document.createElement('span');
      targetSignal.set({
        nativeElement: secondElement,
      });

      tick();

      const ignoredEvent = new Event(anotherEvent.type);
      secondElement.dispatchEvent(anotherEvent);
      secondElement.dispatchEvent(mockEvent);
      firstElement.dispatchEvent(ignoredEvent);

      expect(lastEvent!).toBe(anotherEvent);
    }));

    it('should transform the value with the resultSelector on every event', fakeAsync(() => {
      const resultSelector = (event: Event) => {
        return event.type;
      };
      const firstElement = document.createElement('div');
      const targetSignal = signal<ElementRef>({
        nativeElement: firstElement,
      });
      const eventName = signal<string>(MOCK_EVENT_TYPE);

      fixture.detectChanges();

      const eventSignal = createEventSignalLazily<Event, string>({
        target: targetSignal,
        type: eventName,
        injector,
        activate: true,
        resultSelector,
      });

      firstElement.dispatchEvent(mockEvent);

      expect(eventSignal()).toBe(MOCK_EVENT_TYPE);
      const anotherEventName = 'anotherEventName';
      const anotherEvent = new Event(anotherEventName);
      eventName.set(anotherEventName);

      const secondElement = document.createElement('span');
      targetSignal.set({
        nativeElement: secondElement,
      });

      tick();

      const ignoredEvent = new Event(anotherEvent.type);
      secondElement.dispatchEvent(anotherEvent);
      secondElement.dispatchEvent(mockEvent);
      firstElement.dispatchEvent(ignoredEvent);

      expect(eventSignal()).toBe(anotherEventName);
    }));
  });

  describe('attachActivator/deactivate', () => {
    it('should only start getting updates once the activator was attached', () => {
      const componentNativeElement = fixture.nativeElement as HTMLElement;
      const addEventListenerSpy = spyOn(
        componentNativeElement,
        'addEventListener'
      ).and.callThrough();

      const ignoredEvent = new Event(mockEvent.type);
      componentNativeElement.dispatchEvent(ignoredEvent);

      expect(addEventListenerSpy).not.toHaveBeenCalled();
      expect(eventSignal()).toBe(undefined);

      eventSignal.attachActivator(true);
      componentNativeElement.dispatchEvent(mockEvent);

      expect(addEventListenerSpy).toHaveBeenCalled();
      expect(eventSignal()).toBe(mockEvent);
    });

    it('should stop getting updates once the activator was deactivated', () => {
      const componentNativeElement = fixture.nativeElement as HTMLElement;
      const addEventListenerSpy = spyOn(
        componentNativeElement,
        'addEventListener'
      ).and.callThrough();

      eventSignal.attachActivator(true);
      componentNativeElement.dispatchEvent(mockEvent);

      expect(addEventListenerSpy).toHaveBeenCalled();
      expect(eventSignal()).toBe(mockEvent);

      eventSignal.deactivate();
      const ignoredEvent = new Event(mockEvent.type);
      componentNativeElement.dispatchEvent(ignoredEvent);

      expect(eventSignal()).toBe(mockEvent);
    });

    it('should only get updates if the attached activator was a signal and the signal value is true', () => {
      const componentNativeElement = fixture.nativeElement as HTMLElement;
      const addEventListenerSpy = spyOn(
        componentNativeElement,
        'addEventListener'
      ).and.callThrough();
      const activatorSignal = signal(false);

      eventSignal.attachActivator(activatorSignal);

      const ignoredEvent = new Event(mockEvent.type);
      componentNativeElement.dispatchEvent(ignoredEvent);

      expect(addEventListenerSpy).not.toHaveBeenCalled();
      expect(eventSignal()).toBe(undefined);

      activatorSignal.set(true);
      fixture.detectChanges();
      componentNativeElement.dispatchEvent(mockEvent);

      expect(addEventListenerSpy).toHaveBeenCalled();
      expect(eventSignal()).toBe(mockEvent);

      activatorSignal.set(false);
      fixture.detectChanges();
      componentNativeElement.dispatchEvent(ignoredEvent);

      expect(eventSignal()).toBe(mockEvent);

      activatorSignal.set(true);
      fixture.detectChanges();
      const anotherEvent = new Event(mockEvent.type);
      componentNativeElement.dispatchEvent(anotherEvent);

      expect(eventSignal()).toBe(anotherEvent);
    });

    it('should only get updates until the deactivate was called even if the attached activator was a signal and the signal value is true', () => {
      const componentNativeElement = fixture.nativeElement as HTMLElement;
      const addEventListenerSpy = spyOn(
        componentNativeElement,
        'addEventListener'
      ).and.callThrough();
      const removeEventListenerSpy = spyOn(
        componentNativeElement,
        'removeEventListener'
      ).and.callThrough();
      const activatorSignal = signal(false);

      eventSignal.attachActivator(activatorSignal);

      const ignoredEvent = new Event(mockEvent.type);
      componentNativeElement.dispatchEvent(ignoredEvent);

      expect(addEventListenerSpy).not.toHaveBeenCalled();
      expect(eventSignal()).toBe(undefined);

      activatorSignal.set(true);
      fixture.detectChanges();
      eventSignal.deactivate();
      componentNativeElement.dispatchEvent(mockEvent);

      expect(addEventListenerSpy).toHaveBeenCalled();
      expect(removeEventListenerSpy).toHaveBeenCalled();
      expect(eventSignal()).toBe(undefined);

      addEventListenerSpy.calls.reset();
      removeEventListenerSpy.calls.reset();

      activatorSignal.set(false);
      fixture.detectChanges();
      activatorSignal.set(true);
      fixture.detectChanges();
      componentNativeElement.dispatchEvent(ignoredEvent);

      expect(eventSignal()).toBe(undefined);
      expect(addEventListenerSpy).not.toHaveBeenCalled();
      expect(removeEventListenerSpy).not.toHaveBeenCalled();
    });

    it('should only get updates if the attached activator was a signal and the observable value is true', () => {
      const componentNativeElement = fixture.nativeElement as HTMLElement;
      const addEventListenerSpy = spyOn(
        componentNativeElement,
        'addEventListener'
      ).and.callThrough();
      const activatorSource = new Subject<boolean>();

      eventSignal.attachActivator(activatorSource);

      const ignoredEvent = new Event(mockEvent.type);
      componentNativeElement.dispatchEvent(ignoredEvent);

      expect(addEventListenerSpy).not.toHaveBeenCalled();
      expect(eventSignal()).toBe(undefined);

      activatorSource.next(true);
      componentNativeElement.dispatchEvent(mockEvent);

      expect(addEventListenerSpy).toHaveBeenCalled();
      expect(eventSignal()).toBe(mockEvent);

      activatorSource.next(false);
      componentNativeElement.dispatchEvent(ignoredEvent);

      expect(eventSignal()).toBe(mockEvent);

      activatorSource.next(true);
      const anotherEvent = new Event(mockEvent.type);
      componentNativeElement.dispatchEvent(anotherEvent);

      expect(eventSignal()).toBe(anotherEvent);
    });

    it('should only get updates until the deactivate was called even if the attached activator was an observable and the observable value is true', () => {
      const componentNativeElement = fixture.nativeElement as HTMLElement;
      const addEventListenerSpy = spyOn(
        componentNativeElement,
        'addEventListener'
      ).and.callThrough();
      const removeEventListenerSpy = spyOn(
        componentNativeElement,
        'removeEventListener'
      ).and.callThrough();
      const activatorSource = new Subject<boolean>();

      eventSignal.attachActivator(activatorSource);

      const ignoredEvent = new Event(mockEvent.type);
      componentNativeElement.dispatchEvent(ignoredEvent);

      expect(addEventListenerSpy).not.toHaveBeenCalled();
      expect(eventSignal()).toBe(undefined);

      activatorSource.next(true);
      eventSignal.deactivate();
      componentNativeElement.dispatchEvent(mockEvent);

      expect(addEventListenerSpy).toHaveBeenCalled();
      expect(removeEventListenerSpy).toHaveBeenCalled();
      expect(eventSignal()).toBe(undefined);

      addEventListenerSpy.calls.reset();
      removeEventListenerSpy.calls.reset();

      activatorSource.next(false);
      activatorSource.next(true);
      componentNativeElement.dispatchEvent(ignoredEvent);

      expect(eventSignal()).toBe(undefined);
      expect(addEventListenerSpy).not.toHaveBeenCalled();
      expect(removeEventListenerSpy).not.toHaveBeenCalled();
    });

    it('should be able to get updates after reattaching another type of activator after deactivating', () => {
      const componentNativeElement = fixture.nativeElement as HTMLElement;
      const addEventListenerSpy = spyOn(
        componentNativeElement,
        'addEventListener'
      ).and.callThrough();
      const removeEventListenerSpy = spyOn(
        componentNativeElement,
        'removeEventListener'
      ).and.callThrough();
      const activatorSignal = signal(true);

      eventSignal.attachActivator(activatorSignal);
      fixture.detectChanges();
      componentNativeElement.dispatchEvent(mockEvent);

      expect(addEventListenerSpy).toHaveBeenCalled();
      expect(eventSignal()).toBe(mockEvent);

      eventSignal.deactivate();
      expect(removeEventListenerSpy).toHaveBeenCalled();

      addEventListenerSpy.calls.reset();
      removeEventListenerSpy.calls.reset();

      const activatorSource = of(true);
      eventSignal.attachActivator(activatorSource);

      const anotherEvent = new Event(mockEvent.type);
      componentNativeElement.dispatchEvent(anotherEvent);

      expect(eventSignal()).toBe(anotherEvent);
      expect(addEventListenerSpy).toHaveBeenCalled();
      expect(removeEventListenerSpy).not.toHaveBeenCalled();
    });

    it('should throw after reattaching another activator without deactivating the previous', () => {
      const activatorSignal = signal(true);

      eventSignal.attachActivator(activatorSignal);
      fixture.detectChanges();

      expect(() => eventSignal.attachActivator(activatorSignal)).toThrow();
    });
  });
});
