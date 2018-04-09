import { BaseTransportObject } from "../base";
import { Cipher, Decipher, createCipheriv, createDecipheriv } from "crypto";

export class ServerRc4SecureLayer extends BaseTransportObject implements TransportObject {
  private _en: Cipher;
  private _de: Decipher;

  public constructor(enp: { key: Buffer, iv: Buffer }, dep: { key: Buffer, iv: Buffer }) {
    super();
    this._en = createCipheriv("rc4", enp.key, Buffer.alloc(0));
    this._de = createDecipheriv("rc4", dep.key, Buffer.alloc(0));
  }

  public async fetchDataFromUpStream(data: Buffer) {
    const buff = this._en.update(data);
    return await super.dispatchDataToDownStream(buff);
  }

  public async fetchDataFromDownStream(data: Buffer) {
    const buff = this._de.update(data);
    return await super.dispatchDataToUpStream(buff);
  }

  public async fetchStateFromUpStream(state: TransportState) {
    return await super.dispatchStateToDownStream(state);
  }

  public async fetchStateFromDownStream(state: TransportState) {
    return await super.dispatchStateToUpStream(state);
  }
}
