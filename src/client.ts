import { createConnection, createServer, Socket } from "net";
import { ClientSocketLayer } from "./layer/socket";
import { ClientServiceLayer } from "./layer/service";
import { createTransportSession } from "./api";
import { ClientTunnelLayer } from "./layer/tunnel";
import { ClientSocks5Layer } from "./layer/socks5";
import { SubpackageLayer } from "./layer/subpackage";

import defTransportParameter from "./default-parameter";

const TyFn = <R>(fn: (...args: any[]) => R) => {
  return undefined! as R;
};

const ClientSession = TyFn(createTransportSession);
type ClientSession = typeof ClientSession;

const createClientSessionFactory = (clientMaxConnection: number) => {
  const clientSessions: ClientSession[] = [];

  const getClient = (function* (clientSessions: ClientSession[]) {
    for (let i = 0; ; i = (i + 1) % clientSessions.length || 0) {
      yield clientSessions[i];
    }
  })(clientSessions);

  const queue: Array<(session?: ClientSession) => Promise<void>> = [];
  let nowConnecting = 0;
  return (callback: (session?: ClientSession) => Promise<void>) => {
    const client = getClient.next();
    if (client.value !== undefined) {
      callback(client.value);
    } else {
      queue.push(callback);
    }

    while (clientSessions.length + nowConnecting < clientMaxConnection) {
      const error = (err: Error) => {
        nowConnecting--;
        console.log(err);
        if (nowConnecting === 0) {
          queue.forEach(callback => {
            callback(undefined);
          });
          queue.splice(0);
        }
      };
      const sc = createConnection(defTransportParameter.serverPort, defTransportParameter.serverHost, () => {
        const client = new ClientSocketLayer(sc);
        const service = new ClientServiceLayer();
        const subpackages = new SubpackageLayer();
        const tunnel = new ClientTunnelLayer();

        const block: TransportEnvBlock = {
          param: defTransportParameter,
          control: {
          },

          flow: {
            read: 0,
            written: 0
          },

          pid: process.pid,
          state: "connected",
          src: {
            host: sc.localAddress,
            port: sc.localPort
          },
          dst: {
            host: sc.remoteAddress!,
            port: sc.remotePort!
          },
          time: {
            start: new Date().getTime(),
            end: undefined!
          },
        };
        console.log("client => connect %s,%d", block.src.host, block.src.port);

        const low: TransportObject = {} as any;

        const session = createTransportSession({ block, low }, client, service, subpackages, tunnel);
        low.fetchStateFromUpStream = async (state: TransportState) => {
          if (state.type === State.INITIALIZE_COMPLETED) {
            sc.removeListener("error", error);

            nowConnecting--;
            if (!sc.destroyed) {
              clientSessions.push(session);
              queue.forEach(callback => {
                callback(session);
              });
              queue.splice(0);
            }
            return;
          }
          throw new Error("not impl");
        }

        sc.on("error", (err) => {
          console.log("client => error %s,%d %d <-> %d", block.src.host, block.src.port, block.flow.read, block.flow.written, err);
          clientSessions.splice(clientSessions.indexOf(session), 1);
          session.dispatchStateToUpStream({ type: State.DESTROY });
        });

        sc.once("close", (he) => {
          if (!he) {
            console.log("client => closed %s,%d %d <-> %d", block.src.host, block.src.port, block.flow.read, block.flow.written);
            clientSessions.splice(clientSessions.indexOf(session), 1);
          }
        });

        sc.once("end", () => {
          session.dispatchStateToUpStream({ type: State.END });
        });

        session.dispatchStateToUpStream({ type: State.INITIALIZE });
      });
      sc.on("error", error);
      nowConnecting++;
    }
  };
};

const getClientSession = createClientSessionFactory(defTransportParameter.clientConnection);
const ss = createServer({
  allowHalfOpen: false,
  pauseOnConnect: true
}, (socket: Socket) => {
  getClientSession(async (session?: ClientSession) => {
    if (socket.destroyed) {
      return;
    }
    if (session === undefined) {
      return socket.end();
    }
    const block: TransportEnvBlock = {
      param: defTransportParameter,
      control: {
      },

      flow: {
        read: 0,
        written: 0
      },

      pid: process.pid,
      state: "connected",
      src: {
        host: socket.localAddress,
        port: socket.localPort
      },
      dst: {
        host: socket.remoteAddress!,
        port: socket.remotePort!
      },
      time: {
        start: new Date().getTime(),
        end: undefined!
      },
    };

    session.dispatchStateToDownStream({
      type: State.NEW_CONNECTION_OBJECT_FROM_UPSTREAM,
      block,
      object: new ClientSocks5Layer(socket)
    });
  });
});

ss.listen(defTransportParameter.clientPort,
  defTransportParameter.clientHost,
  defTransportParameter.backlog,
  () => {
    const listen = ss.address();
    console.log("server", listen.family, listen.address, listen.port);
  }
);

process.on("exit", () => {
  console.log("client => exit");
});