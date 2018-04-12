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
  pauseOnConnect: true
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

  const session = createTransportSession({ block }, client, service, subpackages, tunnel);
  session.dispatchStateToUpStream({ type: State.INITIALIZE });

  sc.on("error", (err) => {
    console.log("server => error %s,%d %d <-> %d", block.dst.host, block.dst.port, block.flow.read, block.flow.written, err);
    session.dispatchStateToUpStream({ type: State.DESTROY });
  });

  sc.on("close", (he) => {
    he || console.log("server => closed %s,%d %d <-> %d", block.dst.host, block.dst.port, block.flow.read, block.flow.written);
  });

  const end = () => {
    session.dispatchStateToUpStream({ type: State.END });
  };

  sc.once("end", end);

  sc.setTimeout(defTransportParameter.timeout, () => {
    console.log("server => timeout %s,%d %d <-> %d", block.dst.host, block.dst.port, block.flow.read, block.flow.written);
    sc.removeListener("end", end);
    session.dispatchStateToUpStream({ type: State.END });
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
