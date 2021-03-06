import { Socket } from "net";
import { BaseTransportObject } from "../base";

export class RawSocketLayer extends BaseTransportObject implements TransportObject {
  private _socket: Socket;
  public constructor(socket: Socket) {
    super();
    this._socket = socket;
    this._socket.setNoDelay(true);
  }

  public async fetchDataFromUpStream(data: Buffer) {
    if (!this._socket.destroyed && this._socket.writable) {
      this._context.getTransportEnvBlock().flow.written += data.length;
      this._socket.write(data);
    }
  }

  public async fetchDataFromDownStream(data: Buffer) {
    this._context.getTransportEnvBlock().flow.read += data.length;
    return await super.dispatchDataToUpStream(data);
  }

  public async fetchStateFromUpStream(state: TransportState) {
    return await super.dispatchStateToDownStream(state);
  }

  public async fetchStateFromDownStream(state: TransportState) {
    if (state.type === State.INITIALIZE) {
      this._socket.on("data", (data: Buffer) => {
        this.fetchDataFromDownStream(data);
      });
      this._socket.resume();
    } else if (state.type === State.END) {
      this._socket.end();
    } else if (state.type === State.DESTROY) {
      this._socket.removeAllListeners();
      this._socket.destroy();
      await super.dispatchStateToUpStream(state);
    }
    return await super.dispatchStateToUpStream(state);
  }
}

export const ClientSocketLayer = RawSocketLayer;
export const ServerSocketLayer = RawSocketLayer;
