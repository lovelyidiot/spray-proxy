import { LowStateLayer, HighStateLayer } from "./layer/state";
import { ListItem } from "./base/list";

class TransportContextInternal extends ListItem<TransportContextInternal> implements TransportContext {
  public constructor(private readonly _target: TransportObject,
    private _block: TransportEnvBlock) {
    super();
  }

  public async dispatchDataToUpStream(data: Buffer) {
    return await this._next._target.fetchDataFromDownStream(data);
  }

  public async dispatchDataToDownStream(data: Buffer) {
    return await this._previous._target.fetchDataFromUpStream(data);
  }

  public async dispatchStateToUpStream(state: TransportState) {
    return await this._next._target.fetchStateFromDownStream(state);
  }

  public async dispatchStateToDownStream(state: TransportState) {
    return await this._previous._target.fetchStateFromUpStream(state);
  }

  public attachObjectToUpStream(target: TransportObject) {
    const newContextInternal = new TransportContextInternal(target, this._block);
    super.insertToNext(newContextInternal);
    target.setTransportContext(setOwnTransportContextInternal(newContextInternal));
  }

  public attachObjectToDownStream(target: TransportObject) {
    const newContextInternal = new TransportContextInternal(target, this._block);
    super.insertToPrevious(newContextInternal);
    target.setTransportContext(setOwnTransportContextInternal(newContextInternal));
  }

  public detachFromStream() {
    super.delete();
  }

  public getTransportEnvBlock() {
    return this._block;
  }

  static createTransportSession = (attach: { low?: TransportObject; high?: TransportObject }, ...objects: Array<TransportObject>) => {
    objects = [new LowStateLayer(attach.low), ...objects, new HighStateLayer(attach.high)];
    const block: TransportEnvBlock = {} as any;
    const contexts = objects.map(object => new TransportContextInternal(object, block));
    for (let i = 0; i < contexts.length - 1; i++) {
      contexts[i].insertToNext(contexts[i + 1]);
    }

    contexts.forEach((context, index) => {
      objects[index].setTransportContext(createContextProxy(context, SELF_TOKEN));
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

const createContextProxy = (context: TransportContextInternal, token: symbol) => {
  const target: TransportContext = {
    dispatchDataToUpStream: context.dispatchDataToUpStream.bind(context),
    dispatchDataToDownStream: context.dispatchDataToDownStream.bind(context),
    dispatchStateToUpStream: context.dispatchStateToUpStream.bind(context),
    dispatchStateToDownStream: context.dispatchStateToDownStream.bind(context),

    attachObjectToUpStream: context.attachObjectToUpStream.bind(context),
    attachObjectToDownStream: context.attachObjectToDownStream.bind(context),
    detachFromStream: context.detachFromStream.bind(context),

    getTransportEnvBlock: context.getTransportEnvBlock.bind(context)
  };
  Object.freeze(target);
  return new Proxy(target, {
    get: (obj, prop: string | symbol) => {
      if (prop === token) return context;
      return (target as any)[prop];
    },
  });
};

const SELF_TOKEN = Symbol();

const setOwnTransportContextInternal = (context: TransportContextInternal) => {
  return createContextProxy(context, SELF_TOKEN);
};
const getOwnTransportContextInternal = (context: TransportContext) => {
  return (context as any)[SELF_TOKEN] as TransportContextInternal;
};

export const createTransportSession = TransportContextInternal.createTransportSession;
