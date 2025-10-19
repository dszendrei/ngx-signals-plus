import { of } from 'rxjs';
import { toArray } from 'rxjs/operators';
import { lazyStartWith } from './custom-observables';

describe('lazyStartWith', () => {
  it('should emit the factory value before the source observable', (done) => {
    let callCounter = 0;
    const factory = () => {
      callCounter++;
      return 0;
    };
    const source$ = of(1, 2, 3);

    source$.pipe(lazyStartWith(factory), toArray()).subscribe({
      next: (result) => {
        expect(result).toEqual([0, 1, 2, 3]);
        expect(callCounter).toBe(1);
        done();
      },
      error: done.fail,
    });
  });

  it('should call the factory lazily on each subscription', () => {
    let callCounter = 0;
    const factory = () => {
      callCounter++;
      return 42;
    };
    const source$ = of(100);

    const result1: number[] = [];
    const result2: number[] = [];

    const observable$ = source$.pipe(lazyStartWith(factory));

    observable$.subscribe((value) => result1.push(value));
    observable$.subscribe((value) => result2.push(value));

    expect(callCounter).toBe(2);
    expect(result1).toEqual([42, 100]);
    expect(result2).toEqual([42, 100]);
  });

  it('should propagate error if factory throws', (done) => {
    const factory = (): number => {
      throw new Error('Factory error');
    };
    const source$ = of(1, 2, 3);

    source$.pipe(lazyStartWith(factory)).subscribe({
      next: () => done.fail('Should not emit values'),
      error: (err) => {
        expect(err).toEqual(new Error('Factory error'));
        done();
      },
    });
  });

  it('should work with an empty source observable', (done) => {
    let callCounter = 0;
    const factory = () => {
      callCounter++;
      return 'start';
    };
    const source$ = of();

    source$.pipe(lazyStartWith(factory), toArray()).subscribe({
      next: (result) => {
        expect(result).toEqual(['start']);
        expect(callCounter).toBe(1);
        done();
      },
      error: done.fail,
    });
  });
});
