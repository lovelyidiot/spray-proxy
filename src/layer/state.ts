import { BaseTransportObject } from "../base";


export class LowStateLayer extends BaseTransportObject implements TransportObject {
  private _proxy?: TransportObject;
  public constructor(proxy?: TransportObject) {
    super();
    this._proxy = proxy;
  }

  public async fetchDataFromUpStream(data: Buffer) {
    if (this._proxy) {
      return await this._proxy.fetchDataFromUpStream(data);
    }
    throw new Error(`LowStateLayer->fetchDataFromUpStream not support`);
  }

  public async fetchDataFromDownStream(data: Buffer) {
    throw new Error(`LowStateLayer->fetchDataFromDownStream not support`);
  }

  public async fetchStateFromUpStream(state: TransportState) {
    if (this._proxy) {
      return await this._proxy.fetchStateFromUpStream(state);
    }
    if (state.type === State.ERROR) {
      return await super.dispatchStateToUpStream({ type: State.DESTROY });
    }
  }

  public async fetchStateFromDownStream(state: TransportState) {
    return await super.dispatchStateToUpStream(state);
  }
}

export class HighStateLayer extends BaseTransportObject implements TransportObject {
  private _proxy?: TransportObject;
  public constructor(proxy?: TransportObject) {
    super();
    this._proxy = proxy;
  }

  public async fetchDataFromUpStream(data: Buffer) {
    throw new Error(`HighStateLayer->fetchDataFromUpStream not support`);
  }

  public async fetchDataFromDownStream(data: Buffer) {
    if (this._proxy) {
      return await this._proxy.fetchDataFromDownStream(data);
    }
    throw new Error(`HighStateLayer->fetchDataFromDownStream not support`);
  }

  public async fetchStateFromUpStream(state: TransportState) {
    return await super.dispatchStateToDownStream(state);
  }

  public async fetchStateFromDownStream(state: TransportState) {
    if (this._proxy) {
      return await this._proxy.fetchStateFromDownStream(state);
    }

    if (state.type === State.INITIALIZE) {
      await this.fetchStateFromUpStream({ type: State.INITIALIZE_COMPLETED });
    }
  }
}