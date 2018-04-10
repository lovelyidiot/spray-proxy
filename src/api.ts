import { LowStateLayer, HighStateLayer } from "./layer/state";
import { ok } from "assert";

class TransportContextInternal {
  static TOKEN: symbol = Symbol();

  protected _previous: TransportContextInternal = undefined!;
  protected _next: TransportContextInternal = undefined!;

  protected constructor(private readonly _target: TransportObject,
    private _block: TransportEnvBlock) {
  }

  protected previous(): TransportContextInternal {
    return this._previous;
  }
  protected next(): TransportContextInternal {
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

  protected insertToNext(item: TransportContextInternal): void {
    ok(item._next === undefined && item._previous === undefined);
    item._next = this._next;
    item._previous = this;

    if (this._next)
      this._next._previous = item;
    this._next = item;
  }

  protected insertToPrevious(item: TransportContextInternal): void {
    ok(item._next === undefined && item._previous === undefined);
    item._previous = this._previous;
    item._next = this;

    if (this._previous)
      this._previous._next = item;
    this._previous = item;
  }

  static setOwnTransportContextInternal = (context: TransportContextInternal) => {
    return TransportContextInternal.createContextProxy(context, TransportContextInternal.TOKEN);
  };

  static getOwnTransportContextInternal = (context: TransportContext) => {
    return (context as any)[TransportContextInternal.TOKEN] as TransportContextInternal;
  };

  static createContextProxy = (context: TransportContextInternal, token: symbol) => {
    const target: TransportContext = {
      async dispatchDataToUpStream(data: Buffer) {
        return await context._next._target.fetchDataFromDownStream(data);
      },
      async dispatchDataToDownStream(data: Buffer) {
        return await context._previous._target.fetchDataFromUpStream(data);
      },
      async dispatchStateToUpStream(state: TransportState) {
        return await context._next._target.fetchStateFromDownStream(state);
      },
      async dispatchStateToDownStream(state: TransportState) {
        return await context._previous._target.fetchStateFromUpStream(state);
      },
      attachObjectToUpStream(target: TransportObject) {
        const newContextInternal = new TransportContextInternal(target, context._block);
        context.insertToNext(newContextInternal);
        target.setTransportContext(TransportContextInternal.setOwnTransportContextInternal(newContextInternal));
      },
      attachObjectToDownStream(target: TransportObject) {
        const newContextInternal = new TransportContextInternal(target, context._block);
        context.insertToPrevious(newContextInternal);
        target.setTransportContext(TransportContextInternal.setOwnTransportContextInternal(newContextInternal));
      },
      detachFromStream() {
        context.delete();
      },
      getTransportEnvBlock() {
        return context._block;
      },
    };
    Object.freeze(target);
    return new Proxy(target, {
      get: (obj, prop: string | symbol) => {
        if (prop === token) return context;
        return (target as any)[prop];
      },
    });
  };

  static createTransportSession = (param: { low?: TransportObject; high?: TransportObject; block: TransportEnvBlock }, ...objects: Array<TransportObject>) => {
    objects = [new LowStateLayer(param.low), ...objects, new HighStateLayer(param.high)];

    const contexts = objects.map(object => new TransportContextInternal(object, param.block));
    for (let i = 0; i < contexts.length - 1; i++) {
      contexts[i].insertToNext(contexts[i + 1]);
    }

    contexts.forEach((context, index) => {
      objects[index].setTransportContext(TransportContextInternal.setOwnTransportContextInternal(context));
    });

    return {
      dispatchStateToUpStream: async (state: TransportState) => {
        return await objects[0].fetchStateFromDownStream(state);
      },
      dispatchStateToDownStream: async (state: TransportState) => {
        return await objects[objects.length - 1].fetchStateFromUpStream(state);
      },
    };
  };
}

export const createTransportSession = TransportContextInternal.createTransportSession;
