import { createServer, Socket, createConnection } from "net";
import { ServerSocketLayer, ClientSocketLayer } from "./layer/socket";
import { ServerServiceLayer, ClientServiceLayer } from "./layer/service";
import { ServerSocks5Layer, ClientSocks5Layer } from "./layer/socks5";

import { createTransportSession } from "./api";
import { ServerTunnelLayer } from "./layer/tunnel";
import { SubpackageLayer } from "./layer/subpackage";

const log = console.log;
console.log = (...args: any[]) => {
  const msg = args.shift();
  log(`${(new Date()).toISOString()}: ${msg.toString()}`, ...args);
};

const ss = createServer({
  allowHalfOpen: false,
  pauseOnConnect: false
}, (socket: Socket) => {
  const client = new ServerSocketLayer(socket);
  const service = new ServerServiceLayer();
  const subpackages = new SubpackageLayer();
  const tunnel = new ServerTunnelLayer(ServerSocks5Layer);
  const init = createTransportSession({}, client, service, subpackages, tunnel);
  init.dispatchStateToUpStream({ type: State.INITIALIZE });

  socket.on("error", (err) => {
    console.log("server => error %s,%d %d <-> %d", socket.remoteAddress, socket.remotePort, socket.bytesRead, socket.bytesWritten, err);
    init.dispatchStateToUpStream({ type: State.DESTROY });
  });

  socket.setTimeout(Number.parseInt(process.env.timeout!) || 180 * 1000, () => {
    console.log("server => timeout %s,%d %d <-> %d", socket.remoteAddress, socket.remotePort, socket.bytesRead, socket.bytesWritten);
    init.dispatchStateToUpStream({ type: State.DESTROY });
  });
});

ss.listen(Number.parseInt(process.env.serverPort!) || 2222,
  process.env.serverHost || "0.0.0.0",
  Number.parseInt(process.env.backlog!) || 20,
  () => {
    const listen = ss.address();
    console.log("server", listen.family, listen.address, listen.port);
  }
);
