import { ok } from "assert";

export class BaseTransportObject {
  protected _context: TransportContext = undefined!;

  public setTransportContext(context: TransportContext) {
    ok(this._context === undefined || context === undefined, "context must be undefined");
    this._context = context;
  }

  protected async dispatchDataToUpStream(data: Buffer) {
    return await this._context.dispatchDataToUpStream(data);
  }

  protected async dispatchDataToDownStream(data: Buffer) {
    return await this._context.dispatchDataToDownStream(data);
  }

  protected async dispatchStateToUpStream(state: TransportState) {
    return await this._context.dispatchStateToUpStream(state);
  }

  protected async dispatchStateToDownStream(state: TransportState) {
    return await this._context.dispatchStateToDownStream(state);
  }
}

export class BaseTransportObjectTemplate extends BaseTransportObject implements TransportObject {
  public constructor() {
    super();
  }

  public async fetchDataFromUpStream(data: Buffer) {
    return await super.dispatchDataToDownStream(data);
  }

  public async fetchDataFromDownStream(data: Buffer) {
    return await super.dispatchDataToUpStream(data);
  }

  public async fetchStateFromUpStream(state: TransportState) {
    return await super.dispatchStateToDownStream(state);
  }

  public async fetchStateFromDownStream(state: TransportState) {
    return await super.dispatchStateToUpStream(state);
  }
}