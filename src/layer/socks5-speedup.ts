import { BaseTransportObject } from "../base";
import { Socks5Protocol } from "./socks5";

export class ServerSocks5SpeedUpLayer extends BaseTransportObject implements TransportObject {
  private _packet: number = 0;
  private _cache: Buffer[] = undefined!;
  public async fetchDataFromUpStream(data: Buffer) {
    if (this._packet === 0) {
      this._packet++;
      return;
    } else if (this._packet === 1) {
      this._packet++;
      process.nextTick(async () => {
        for (let buff = this._cache.shift(); buff !== undefined; buff = this._cache.shift()) {
          await super.dispatchDataToUpStream(buff);
        }
        this._context.detachSelfFromStream();
      });

      return;
    }
    return await super.dispatchDataToDownStream(data);
  }

  public async fetchDataFromDownStream(data: Buffer) {
    if (this._cache === undefined) {
      this._cache = [];
      return await super.dispatchDataToUpStream(data);
    }
    this._cache.push(data);
  }

  public async fetchStateFromUpStream(state: TransportState) {
    return await super.dispatchStateToDownStream(state);
  }

  public async fetchStateFromDownStream(state: TransportState) {
    if (state.type === State.INITIALIZE_OK) {
      await super.dispatchDataToUpStream(Buffer.alloc(3, "\x05\x00\x00"));
    }
    return await super.dispatchStateToUpStream(state);
  }
}

export class ClientSocks5SpeedUpLayer extends BaseTransportObject implements TransportObject {
  private _protocol: Socks5Protocol = new Socks5Protocol();
  private _packet: number = 0;
  private _cache: Buffer = undefined!;
  public async fetchDataFromUpStream(data: Buffer) {
    if (this._packet === 0) {
      this._packet++;
      try {
        const buff = await this._protocol.negotiate(data);
        return await super.dispatchDataToUpStream(buff);
      } catch (e) {
        return await this.fetchStateFromDownStream({ type: State.END });
      }
    } else if (this._packet === 1) {
      this._packet++;
      if (data[0] !== 0x05) {
        return await this.fetchStateFromDownStream({ type: State.END });
      }

      try {
        const buff = await this._protocol.connect(data);
        this._cache = data;
        return await super.dispatchDataToUpStream(buff.reply);
      } catch (e) {
        return await this.fetchStateFromDownStream({ type: State.END });
      }
    } else if (this._packet === 2) {
      this._packet++;
      await super.dispatchDataToDownStream(this._cache);
      await super.dispatchDataToDownStream(data);
      this._context.detachSelfFromStream();
      return;
    }

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
