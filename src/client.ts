import { createConnection, createServer, Socket } from "net";
import { ClientSocketLayer } from "./layer/socket";
import { ClientServiceLayer } from "./layer/service";
import { createTransportSession } from "./api";
import { ClientTunnelLayer } from "./layer/tunnel";
import { ClientSocks5Layer } from "./layer/socks5";
import { SubpackageLayer } from "./layer/subpackage";

const TyFn = <R>(fn: (...args: any[]) => R) => {
  return undefined! as R;
};

const ClientSession = TyFn(createTransportSession);
type Client = typeof ClientSession;

const clients: Client[] = [];
const clientMaxConnection = Number.parseInt(process.env.clientConnection!) || 3;
const getClient = function* () {
  for (let i = 0; i < clients.length; i = (i + 1) % clients.length) {
    yield clients[i];
  }
};

const newClient = () => {
  const sc = createConnection(Number.parseInt(process.env.serverPort!) || 2022, process.env.serverHost, () => {
    const client = new ClientSocketLayer(sc);
    const service = new ClientServiceLayer();
    const subpackages = new SubpackageLayer();
    const tunnel = new ClientTunnelLayer();

    const init = createTransportSession({}, client, service, subpackages, tunnel);
    clients.push(init);
    init.dispatchStateToUpStream({ type: State.INITIALIZE });

    sc.on("error", (err) => {
      console.log("client => error %s,%d %d <-> %d", sc.localAddress, sc.localPort, sc.bytesRead, sc.bytesWritten, err);
      newClient();
      clients.splice(clients.indexOf(init), 1);
      init.dispatchStateToUpStream({ type: State.DESTROY });
    });

    sc.on("close", (he) => {
      he || console.log("client => closed %s,%d %d <-> %d", sc.localAddress, sc.localPort, sc.bytesRead, sc.bytesWritten);
      clients.splice(clients.indexOf(init), 1);
      init.dispatchStateToUpStream({ type: State.DESTROY });
    });
  });
};

{
  console.log("client => create connect to server %s,%d",
    process.env.serverHost,
    Number.parseInt(process.env.serverPort!) || 2022);
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
  tunnel.done || tunnel.value.dispatchStateToDownStream({
    type: State.NEW_CONNECTION_OBJECT_FROM_UPSTREAM,
    ip: socket.remoteAddress!,
    port: socket.remotePort!,
    object: new ClientSocks5Layer(socket)
  });
});

ss.listen(Number.parseInt(process.env.clientPort!) || 2022,
  process.env.clientHost || "0.0.0.0",
  Number.parseInt(process.env.backlog!) || 20,
  () => {
    const listen = ss.address();
    console.log("server", listen.family, listen.address, listen.port);
  }
);
ss.unref();
process.on("exit", () => {
  console.log("client => exit");
});