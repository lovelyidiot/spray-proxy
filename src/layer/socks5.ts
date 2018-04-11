import { BaseTransportObject } from "../base";
import { createConnection, Socket } from "net";
import { ServerSocks5SpeedUpLayer, ClientSocks5SpeedUpLayer } from "./socks5-speedup";
import { EventEmitter } from "events";

export class Socks5Protocol {
  public async negotiate(buff: Buffer) {
    if (buff[0] === 0x05) {
      return Buffer.alloc(2, "\x05\x00");
    }
    throw new Error("negotiate version not support");
  }

  public async connect(buff: Buffer) {
    const ver = buff[0];
    const cmd = buff[1];
    if (ver !== 0x05 || cmd !== 0x01)
      throw new Error("connect command not support");

    const host = {
      port: undefined! as number,
      address: undefined! as string,
      reply: Buffer.alloc(10, "\x05\x00\x00\x01\x00\x00\x00\x00\x00\x00")
    };

    const type = buff[3];
    if (type !== 3 && type !== 1) {
      throw new Error("connect request not support");
    }

    /// domain name
    if (type === 0x03) {
      const len = buff[4];
      host.address = buff.slice(5, 5 + len).toString("utf8");
      host.port = buff.readInt16BE(5 + len);
      /// ip address
    } else if (type === 0x01) {
      const ip = buff.slice(4, 8);
      host.address = `${ip[0]}.${ip[1]}.${ip[2]}.${ip[3]}`;
      host.port = buff.readInt16BE(8);
    }
    return host;
  }
}

export class ServerSocks5Layer extends BaseTransportObject implements TransportObject {
  private _packet: number = 0;
  private _protocol: Socks5Protocol = new Socks5Protocol();
  private _event: EventEmitter = new EventEmitter();

  public async fetchDataFromUpStream(data: Buffer) {
    this._context.getTransportEnvBlock().flow.read += data.length;
    return await super.dispatchDataToDownStream(data);
  }

  public async fetchDataFromDownStream(data: Buffer) {
    this._context.getTransportEnvBlock().flow.written += data.length;

    if (this._packet === 0) {
      this._packet++;
      try {
        const buff = await this._protocol.negotiate(data);
        return await super.dispatchDataToDownStream(buff);
      } catch (e) {
        return await this.fetchStateFromUpStream({ type: State.ERROR, value: e });
      }
    }

    if (this._packet === 1) {
      let host: { port: number; address: string; reply: Buffer };
      try {
        host = await this._protocol.connect(data);
      } catch (e) {
        return await this.fetchStateFromUpStream({ type: State.ERROR, value: e });
      }
      console.log("server => connecting to %s,%d", host.address, host.port);
      const client = createConnection(host.port, host.address, () => {
        console.log("server => connected with %s,%d", host.address, host.port);
        super.dispatchDataToDownStream(host.reply);
        client.removeAllListeners("error");

        client.on("data", (buff: Buffer) => {
          // client.pause();
          // super.dispatchDataToDownStream(buff).then(() => {
          //   client.resume();
          // });
          super.dispatchDataToDownStream(buff);
        });

        client.on("close", he => {
          console.log("server => closed %s,%d %d <-> %d", host.address, host.port, client.bytesRead, client.bytesWritten);
          if (!he) super.dispatchStateToDownStream({ type: State.CLOSE });
        });

        client.on("error", (err) => {
          super.dispatchStateToDownStream({ type: State.ERROR, value: err });
        });

        this.fetchDataFromDownStream = async (data: Buffer) => {
          this._context.getTransportEnvBlock().flow.written += data.length;
          client.write(data);
        };

        this._event.once("end", () => {
          client.end();
        });

        this._event.once("destroy", () => {
          client.removeAllListeners();
          client.destroy();
        });
      });
      client.on("error", (err) => {
        super.dispatchStateToDownStream({ type: State.CLOSE });
      });
    }
  }

  public async fetchStateFromUpStream(state: TransportState) {
    return await super.dispatchStateToDownStream(state);
  }

  public async fetchStateFromDownStream(state: TransportState) {
    if (state.type === State.INITIALIZE) {
      const obj = new ServerSocks5SpeedUpLayer();
      this._context.attachObjectToDownStream(obj);
    } else if (state.type === State.END) {
      this._event.emit("end");
    } else if (state.type === State.DESTROY) {
      this._event.emit("destroy");
    }
    return await super.dispatchStateToUpStream(state);
  }
}

export class ClientSocks5Layer extends BaseTransportObject implements TransportObject {
  private _socket: Socket;

  public constructor(socket: Socket) {
    super();
    this._socket = socket;
    this._socket.setNoDelay(true);
    this._socket.pause();
    console.log("client => accepted connect %s,%d", this._socket.remoteAddress, this._socket.remotePort);
  }

  public async fetchDataFromUpStream(data: Buffer) {
    return await super.dispatchDataToDownStream(data);
  }

  public async fetchDataFromDownStream(data: Buffer) {
    this._socket.write(data);
  }

  public async fetchStateFromUpStream(state: TransportState) {
    return await super.dispatchStateToDownStream(state);
  }

  public async fetchStateFromDownStream(state: TransportState) {
    if (state.type === State.INITIALIZE) {
      const obj = new ClientSocks5SpeedUpLayer();
      this._context.attachObjectToDownStream(obj);
    } else if (state.type === State.INITIALIZE_OK) {
      this._socket.setTimeout(60 * 1000);
      this._socket.on("data", (data: Buffer) => {
        // this._socket.pause();
        // this.fetchDataFromUpStream(data).then(() => {
        //   this._socket.resume();
        // });
        this.fetchDataFromUpStream(data);
      });
      this._socket.on("close", (he) => {
        console.log("client => closed %s,%d %d <-> %d", this._socket.remoteAddress, this._socket.remotePort, this._socket.bytesRead, this._socket.bytesWritten);
        if (!he) this.fetchStateFromUpStream({ type: State.CLOSE });
      });
      this._socket.on("error", (err) => {
        this.fetchStateFromUpStream({ type: State.ERROR, value: err });
      });
      this._socket.on("timeout", () => {
        this._socket.end();
      });
      this._socket.resume();
    } else if (state.type === State.END) {
      this._socket.end();
    } else if (state.type === State.DESTROY) {
      this._socket.removeAllListeners();
      this._socket.destroy();
    }
    return await super.dispatchStateToUpStream(state);
  }
}