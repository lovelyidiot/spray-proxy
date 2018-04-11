import { BaseTransportObject } from "../base";
import { createTransportSession } from "../api";
import { createServer, Socket, Server } from "net";

const TUNNEL_PREFIX_LENGTH = 6;

class TunnelIndexLayer extends BaseTransportObject implements TransportObject {
  private _prefix: Buffer = undefined!;
  public constructor(prefix: Buffer) {
    super();
    this._prefix = prefix;
  }

  public async fetchDataFromUpStream(data: Buffer) {
    return await super.dispatchDataToDownStream(Buffer.concat([this._prefix, data]));
  }

  public async fetchDataFromDownStream(data: Buffer) {
    return await super.dispatchDataToUpStream(data.slice(this._prefix.length));
  }

  public async fetchStateFromUpStream(state: TransportState) {
    return await super.dispatchStateToDownStream({ ...state, key: this._prefix } as any);
  }

  public async fetchStateFromDownStream(state: TransportState) {
    return await super.dispatchStateToUpStream(state);
  }
}

export class ServerTunnelLayer extends BaseTransportObject implements TransportObject {
  private _ctor: { new(): TransportObject };
  private _object = new Map<number, TransportObject | null>();

  public constructor(ctor: { new(): TransportObject }) {
    super();
    this._ctor = ctor;
  }

  public async fetchDataFromUpStream(data: Buffer) {
    return await super.dispatchDataToDownStream(data);
  }

  public async fetchDataFromDownStream(data: Buffer) {
    const index = data.readUIntBE(0, TUNNEL_PREFIX_LENGTH);
    const object = this._object.get(index);
    if (!object === null) return;

    if (data.length === TUNNEL_PREFIX_LENGTH) {
      if (!object) return;
      this._object.set(index, null);
      return await object!.fetchStateFromDownStream({ type: State.END });
    }

    if (object === undefined) {
      const indexer = new TunnelIndexLayer(data.slice(0, TUNNEL_PREFIX_LENGTH));
      this._object.set(index, indexer);
      const newObject = new this._ctor();

      const init = createTransportSession({ low: this, block: this._context.getTransportEnvBlock() }, indexer, newObject);
      await init.dispatchStateToUpStream({ type: State.INITIALIZE });
      return await indexer.fetchDataFromDownStream(data);
    }

    return await object!.fetchDataFromDownStream(data);
  }

  public async fetchStateFromUpStream(state: TransportState) {
    if (state.type === State.CLOSE || state.type === State.ERROR) {
      const index = (state.key as Buffer).readUIntBE(0, TUNNEL_PREFIX_LENGTH);
      const object = this._object.get(index);
      this._object.delete(index);
      if (object) {
        return await this.fetchDataFromUpStream(state.key);
      }
      return;
    }

    return await super.dispatchStateToDownStream(state);
  }

  public async fetchStateFromDownStream(state: TransportState) {
    if (state.type === State.DESTROY) {
      this._object.forEach((obj, index) => {
        if (obj) {
          this._object.set(index, null);
          obj.fetchStateFromDownStream(state);
        }
        this._object.delete(index);
      });
    }
    return await super.dispatchStateToUpStream(state);
  }
}

export class ClientTunnelLayer extends BaseTransportObject implements TransportObject {
  private _object = new Map<number, TransportObject | null>();

  public constructor() {
    super();
  }

  public async fetchDataFromUpStream(data: Buffer) {
    return await super.dispatchDataToDownStream(data);
  }

  public async fetchDataFromDownStream(data: Buffer) {
    const index = data.readUIntBE(0, TUNNEL_PREFIX_LENGTH);
    const object = this._object.get(index);
    if (!object) return;

    if (data.length === TUNNEL_PREFIX_LENGTH) {
      if (!object) return;
      this._object.set(index, null);
      return await object.fetchStateFromDownStream({ type: State.END });
    }

    return await object!.fetchDataFromDownStream(data);
  }

  public async fetchStateFromUpStream(state: TransportState) {
    if (state.type === State.NEW_CONNECTION_OBJECT_FROM_UPSTREAM) {
      const value = Buffer.alloc(TUNNEL_PREFIX_LENGTH);
      {
        state.block.dst.host.split(".").forEach((val, index) => {
          value.writeUInt8(Number.parseInt(val), index);
        });
        value.writeUInt16BE(state.block.dst.port, 4);
      }
      const index = value.readUIntBE(0, TUNNEL_PREFIX_LENGTH);
      const indexer = new TunnelIndexLayer(value);
      this._object.set(index, indexer);

      const init = createTransportSession({ low: this, block: state.block }, indexer, state.object);
      return await init.dispatchStateToUpStream({ type: State.INITIALIZE });
    } else if (state.type === State.CLOSE || state.type === State.ERROR) {
      const index = (state.key as Buffer).readUIntBE(0, TUNNEL_PREFIX_LENGTH);
      const object = this._object.get(index);
      this._object.delete(index);

      if (object) {
        return this.fetchDataFromUpStream(state.key);
      }
      return;
    }
    return await super.dispatchStateToDownStream(state);
  }

  public async fetchStateFromDownStream(state: TransportState) {
    if (state.type === State.DESTROY) {
      this._object.forEach((obj, index) => {
        if (obj) {
          this._object.set(index, null);
          obj.fetchStateFromDownStream(state);
        }
        this._object.delete(index);
      });
    }
    return await super.dispatchStateToUpStream(state);
  }
}