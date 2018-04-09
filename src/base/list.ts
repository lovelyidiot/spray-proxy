import { ok } from "assert";

export class ListItem<T extends ListItem<T>> {
  protected _previous: T = undefined!;
  protected _next: T = undefined!;

  protected previous(): T {
    return this._previous;
  }
  protected next(): T {
    return this._next;
  }

  protected delete(): void {
    if (this._next) {
      this._next._previous = this._previous;
    }
    if (this._previous) {
      this._previous._next = this._next;
    }

    delete this._next;
    delete this._previous;
  }

  protected insertToNext(item: T): void {
    ok(item._next === undefined && item._previous === undefined);
    item._next = this._next;
    item._previous = this as any as T;

    if (this._next)
      this._next._previous = item;
    this._next = item;
  }

  protected insertToPrevious(item: T): void {
    ok(item._next === undefined && item._previous === undefined);
    item._previous = this._previous;
    item._next = this as any as T;

    if (this._previous)
      this._previous._next = item;
    this._previous = item;
  }
}



