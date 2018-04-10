import { createServer, Socket, createConnection } from "net";
import { ServerSocketLayer, ClientSocketLayer } from "./layer/socket";
import { ServerServiceLayer, ClientServiceLayer } from "./layer/service";
import { ServerSocks5Layer, ClientSocks5Layer } from "./layer/socks5";

import { createTransportSession } from "./api";
import { ServerTunnelLayer } from "./layer/tunnel";
import { SubpackageLayer } from "./layer/subpackage";

import defTransportParameter from "./default-parameter";

const log = console.log;
console.log = (...args: any[]) => {
  const msg = args.shift();
  log(`${(new Date()).toISOString()}: ${msg.toString()}`, ...args);
};

const ss = createServer({
  allowHalfOpen: false,
  pauseOnConnect: false
}, (sc: Socket) => {
  const client = new ServerSocketLayer(sc);
  const service = new ServerServiceLayer();
  const subpackages = new SubpackageLayer();
  const tunnel = new ServerTunnelLayer(ServerSocks5Layer);

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
  init.dispatchStateToUpStream({ type: State.INITIALIZE });

  sc.on("error", (err) => {
    console.log("server => error %s,%d %d <-> %d", sc.remoteAddress, sc.remotePort, sc.bytesRead, sc.bytesWritten, err);
    init.dispatchStateToUpStream({ type: State.DESTROY });
  });

  sc.setTimeout(defTransportParameter.timeout, () => {
    console.log("server => timeout %s,%d %d <-> %d", sc.remoteAddress, sc.remotePort, sc.bytesRead, sc.bytesWritten);
    init.dispatchStateToUpStream({ type: State.DESTROY });
  });
});

ss.listen(defTransportParameter.serverPort,
  defTransportParameter.serverHost,
  defTransportParameter.backlog,
  () => {
    const listen = ss.address();
    console.log("server", listen.family, listen.address, listen.port);
  }
);
