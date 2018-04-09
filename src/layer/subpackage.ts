import { BaseTransportObject } from "../base";

export class SubpackageLayer extends BaseTransportObject implements TransportObject {
  private _cache: Buffer = Buffer.alloc(0);
  private subpackage(data: Buffer): Array<Buffer> {
    if (this._cache.length > 0) {
      data = Buffer.concat([this._cache, data]);
      this._cache = Buffer.alloc(0);
    }

    if (data.length <= 4) {
      this._cache = data;
      return [];
    }

    const sub: Array<Buffer> = [];
    for (let len = data.readUIntBE(0, 4); data.length >= len + 4; data.length >= 4 && (len = data.readUIntBE(0, 4))) {
      sub.push(data.slice(4, 4 + len));
      data = data.slice(4 + len);
    }
    if (data.length !== 0) {
      this._cache = data;
    }
    return sub;
  }

  public async fetchDataFromUpStream(data: Buffer) {
    const len = Buffer.alloc(4);
    len.writeUIntBE(data.length, 0, 4);
    return await super.dispatchDataToDownStream(Buffer.concat([len, data]));
  }

  public async fetchDataFromDownStream(data: Buffer) {
    const packages = this.subpackage(data);
    if (packages.length === 0) return;

    for (let i = 0; i < packages.length - 1; i++) {
      await super.dispatchDataToUpStream(packages[i]);
    }

    return await super.dispatchDataToUpStream(packages[packages.length - 1]);
  }

  public async fetchStateFromUpStream(state: TransportState) {
    return await super.dispatchStateToDownStream(state);
  }

  public async fetchStateFromDownStream(state: TransportState) {
    return await super.dispatchStateToUpStream(state);
  }
}