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
type Client = typeof ClientSession;

const clients: Client[] = [];
const clientMaxConnection = defTransportParameter.clientConnection;
const getClient = function* () {
  for (let i = 0; i < clients.length; i = (i + 1) % clients.length) {
    yield clients[i];
  }
};

const newClient = () => {
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

    const init = createTransportSession({ block }, client, service, subpackages, tunnel);
    clients.push(init);
    init.dispatchStateToUpStream({ type: State.INITIALIZE });

    sc.on("error", (err) => {
      console.log("client => error %s,%d %d <-> %d", block.src.host, block.src.port, block.flow.read, block.flow.written, err);
      newClient();
      clients.splice(clients.indexOf(init), 1);
      init.dispatchStateToUpStream({ type: State.DESTROY });
    });

    sc.on("close", (he) => {
      if (!he) {
        console.log("client => closed %s,%d %d <-> %d", block.src.host, block.src.port, block.flow.read, block.flow.written);
        clients.splice(clients.indexOf(init), 1);
      }
    });

    sc.setTimeout(defTransportParameter.timeout, () => {
      console.log("client => timeout %s,%d %d <-> %d", block.src.host, block.src.port, block.flow.read, block.flow.written);
      init.dispatchStateToUpStream({ type: State.END });
    });
  });
  return sc;
};

{
  console.log("client => create connect to server %s,%d",
    defTransportParameter.serverHost,
    defTransportParameter.serverPort);
  for (let i = 0; i < clientMaxConnection; i++) {
    newClient();
  }
}

const init = getClient();
const ss = createServer({
  allowHalfOpen: false,
  pauseOnConnect: false
}, (socket: Socket) => {
  const tunnel = init.next();
  if (tunnel.done) {
    socket.destroy();
  } else {
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

    tunnel.value.dispatchStateToDownStream({
      type: State.NEW_CONNECTION_OBJECT_FROM_UPSTREAM,
      block,
      object: new ClientSocks5Layer(socket)
    });
  }
});

ss.listen(defTransportParameter.clientPort,
  defTransportParameter.clientHost,
  defTransportParameter.backlog,
  () => {
    const listen = ss.address();
    console.log("server", listen.family, listen.address, listen.port);
  }
);
ss.unref();
process.on("exit", () => {
  console.log("client => exit");
});