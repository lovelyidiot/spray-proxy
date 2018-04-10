const enum State {
  ERROR = 0, // u2d

  DESTROY,

  INITIALIZE,
  INITIALIZE_OK,

  // QUERY_IP_AND_PORT,
  // REPLY_IP_AND_PORT,

  NEW_CONNECTION_OBJECT_FROM_UPSTREAM,

  /// d2u
  END,
  /// u2d
  CLOSE
}

type TransportState = { type: State.ERROR; key?: any; value: Error }
  | { type: State.DESTROY }
  | { type: State.INITIALIZE }
  | { type: State.INITIALIZE_OK }
  | { type: State.NEW_CONNECTION_OBJECT_FROM_UPSTREAM; ip: string; port: number; object: TransportObject; }
  | { type: State.END; }
  | { type: State.CLOSE; key?: any };

interface TransportEnvBlock {
  control: {
  };

  flow: {
    read: number;
    written: number;
  };

  pid: number;
  src: {
    host: string;
    port: number;
  };

  dst: {
    host: string;
    port: number;
  };

  time: {
    start: number;
    end: number;
  };
}

interface TransportContext {
  dispatchDataToUpStream: (data: Buffer) => Promise<void>;
  dispatchDataToDownStream: (data: Buffer) => Promise<void>;
  dispatchStateToUpStream: (state: TransportState) => Promise<void>;
  dispatchStateToDownStream: (state: TransportState) => Promise<void>;

  attachObjectToUpStream(target: TransportObject): void;
  attachObjectToDownStream(target: TransportObject): void;
  detachFromStream(): void;

  getTransportEnvBlock(): TransportEnvBlock;
}

interface TransportObject {
  setTransportContext: (context: TransportContext) => void;

  fetchDataFromUpStream: (data: Buffer) => Promise<void>;
  fetchDataFromDownStream: (data: Buffer) => Promise<void>;

  fetchStateFromUpStream: (state: TransportState) => Promise<void>;
  fetchStateFromDownStream: (state: TransportState) => Promise<void>;
}












