import { concat, defer, Observable, of } from 'rxjs';

/**
 * Same as the original rxjs startWith operator but the value is created by a factory function at subscription time to lazily evaluate.
 *
 * @param factory to evaluate the start value lazily at subscription time
 * @returns
 */
export function lazyStartWith<T>(factory: () => T) {
  return (source: Observable<T>): Observable<T> =>
    defer(() => concat(of(factory()), source));
}
