import { BaseTransportObject } from "../base";
import { createHash, createCipheriv, randomBytes, createHmac, createDecipheriv, ECDH, createECDH } from "crypto";
import { ServerRc4SecureLayer } from "./secure";
import { equal } from "assert";

interface ServicePacket {
  version: number;  // d64
  date: number;     // d64

  user: Buffer;
  pubkey: Buffer;
  secure: Buffer;
  hash: Buffer;
}

const prefixLength = 20;
const userLength = 20;
const hashLength = 20;

const convertServicePacketToBuffer = (param: ServicePacket) => {
  if (param.version === 1) {
    if (param.user.length !== userLength || param.pubkey.length > 0xff || param.secure.length > 0xff || param.hash.length !== hashLength) {
      throw new Error("length error");
    }

    const buff = Buffer.alloc(prefixLength);
    let offset = 0;
    offset = buff.writeDoubleBE(param.version, offset);
    offset = buff.writeDoubleBE(param.date, offset);

    offset = buff.writeUInt8(param.user.length, offset);
    offset = buff.writeUInt8(param.pubkey.length, offset);
    offset = buff.writeUInt8(param.secure.length, offset);
    offset = buff.writeUInt8(param.hash.length, offset);

    return Buffer.concat([buff, param.user, param.pubkey, param.secure, param.hash]);
  }

  throw new Error("not impl");
};

const convertBufferToServicePacket = (buff: Buffer) => {
  if (buff.length < prefixLength) throw new Error("length error");

  const begin: number[] = [];
  const end: number[] = [];
  for (let i = 16, b = prefixLength; i < prefixLength; i++) {
    const len = buff.readUInt8(i);
    if (len > 0xff) throw new Error("length error");

    begin.push(b);
    b += len;
    end.push(b);
  }

  const packet: ServicePacket = {
    version: buff.readDoubleBE(0),
    date: buff.readDoubleBE(8),

    user: buff.slice(begin[0], end[0]),
    pubkey: buff.slice(begin[1], end[1]),
    secure: buff.slice(begin[2], end[2]),
    hash: buff.slice(begin[3], end[3]),
  };

  return [packet, end[3]] as [ServicePacket, number];
};

const addSlat1024 = (buff: Buffer) => {
  for (let i = 0; i < 10; i++) {
    buff = Buffer.concat([buff, buff]);
  }
  return buff;
};

const slat = (buff: Buffer) => {
  return addSlat1024(buff);
};

const hashValue = (password: Buffer, value: Buffer, keyLength: 16 | 20) => {
  return createHmac("sha1", slat(password))
    .update(slat(value))
    .digest().slice(0, keyLength);
};

const createClientUserToken = () => {
  return hashValue(Buffer.from(process.env.username as string), Buffer.from(process.env.username as string), userLength);
};

const createClientUserPrivatePasswrod = (user: Buffer, keyLength: 16) => {
  const password = hashValue(user, Buffer.from(process.env.password as string), keyLength);
  return hashValue(password, user, keyLength);
};

const createServerUserPrivatePassword = (user: Buffer, keyLength: 16) => {
  /// for support multi user, the [password] can be get from db.
  /// this is only single user mode now.
  const password = hashValue(user, Buffer.from(process.env.password as string), keyLength);
  return hashValue(password, user, keyLength);
};

export class ServerServiceLayer extends BaseTransportObject implements TransportObject {
  private _packet = 0;

  private _secure = {
    enp: undefined! as {
      key: Buffer,
      iv: Buffer
    },
    dep: undefined! as {
      key: Buffer,
      iv: Buffer
    },
  };

  public async fetchDataFromUpStream(data: Buffer) {
    throw new Error(`${__filename}:75 assert`);
  }

  public async fetchDataFromDownStream(data: Buffer) {
    if (this._packet++ !== 0) {
      return await super.dispatchDataToDownStream(data);
    };

    const back: ServicePacket = {} as any;

    const [packet, length] = convertBufferToServicePacket(data);
    back.version = packet.version;
    back.user = packet.user;
    {
      const now = (new Date()).getTime();
      if (Math.abs(packet.date - now) > 60 * 1000) {
        return await super.dispatchStateToDownStream({ type: State.ERROR, value: new Error("time conflict") });
      }
    }

    /// auth begin
    const password = createServerUserPrivatePassword(packet.user, 16);
    {
      const hash = hashValue(password, data.slice(0, length - packet.hash.length), hashLength);
      if (hash.toString("hex") !== packet.hash.toString("hex")) {
        return await super.dispatchStateToDownStream({ type: State.ERROR, value: new Error("auth conflict") });
      }
    }
    /// auth ok


    {
      const ecdh: ECDH = createECDH("secp521r1");
      const pubkey = ecdh.generateKeys();
      back.pubkey = pubkey;
      back.secure = randomBytes(32);
      const key = ecdh.computeSecret(packet.pubkey);

      const ekey = hashValue(key, back.pubkey, 16);
      const eiv = hashValue(key, back.secure, 16);
      const dkey = hashValue(key, packet.pubkey, 16);
      const div = hashValue(key, packet.secure, 16);

      this._secure.enp = {
        key: ekey,
        iv: eiv
      };

      this._secure.dep = {
        key: dkey,
        iv: div
      };
    }

    {
      back.date = (new Date()).getTime();

      back.hash = Buffer.alloc(hashLength);
      const tmp = convertServicePacketToBuffer(back);
      back.hash = hashValue(password, tmp.slice(0, tmp.length - back.hash.length), hashLength);
      await super.dispatchDataToDownStream(convertServicePacketToBuffer(back));
    }

    {
      const secure = new ServerRc4SecureLayer(this._secure.enp, this._secure.dep);
      this._context.attachObjectToUpStream(secure);
      this._context.detachSelfFromStream();
    }
    equal(data.length, length);
    return;
  }

  public async fetchStateFromUpStream(state: TransportState) {
    return await super.dispatchStateToDownStream(state);
  }

  public async fetchStateFromDownStream(state: TransportState) {
    return await super.dispatchStateToUpStream(state);
  }
}

export class ClientServiceLayer extends BaseTransportObject implements TransportObject {
  private _packet = 0;
  private _ecdh: ECDH = createECDH("secp521r1");
  private _secure = {
    enp: undefined! as {
      key: Buffer,
      iv: Buffer
    },
    dep: undefined! as {
      key: Buffer,
      iv: Buffer
    },
  };

  public async fetchDataFromUpStream(data: Buffer) {
    throw new Error(`${__filename}:170 assert`);
  }

  public async fetchDataFromDownStream(data: Buffer) {
    if (this._packet++ !== 0) {
      return await super.dispatchDataToDownStream(data);
    };

    const [packet, length] = convertBufferToServicePacket(data);

    {
      const now = (new Date()).getTime();
      if (Math.abs(packet.date - now) > 15 * 1000) {
        return await super.dispatchStateToDownStream({ type: State.ERROR, value: new Error("time conflict") });
      }
    }

    /// auth begin
    const password = createClientUserPrivatePasswrod(packet.user, 16);
    {
      const hash = hashValue(password, data.slice(0, length - packet.hash.length), hashLength);
      if (hash.toString("hex") !== packet.hash.toString("hex")) {
        return await super.dispatchStateToDownStream({ type: State.ERROR, value: new Error("auth conflict") });
      }
    }
    /// auth ok
    {
      const key = this._ecdh.computeSecret(packet.pubkey);

      const ekey = hashValue(key, this._secure.enp.key, 16);
      const eiv = hashValue(key, this._secure.enp.iv, 16);
      const dkey = hashValue(key, packet.pubkey, 16);
      const div = hashValue(key, packet.secure, 16);

      this._secure.enp = {
        key: ekey,
        iv: eiv
      };

      this._secure.dep = {
        key: dkey,
        iv: div
      };
    }

    const secure = new ServerRc4SecureLayer(this._secure.enp, this._secure.dep);
    this._context.attachObjectToUpStream(secure);
    this._context.detachSelfFromStream();
    equal(data.length, length);
    return await secure.fetchStateFromDownStream({ type: State.INITIALIZE_OK });
  }

  public async fetchStateFromUpStream(state: TransportState) {
    return await super.dispatchStateToDownStream(state);
  }

  public async fetchStateFromDownStream(state: TransportState) {
    if (state.type === State.INITIALIZE_OK) {
      const pubkey = this._ecdh.generateKeys();

      const packet: ServicePacket = {
        version: 1,
        date: (new Date()).getTime(),

        user: createClientUserToken(),
        pubkey,
        secure: randomBytes(32),
        hash: Buffer.alloc(hashLength)
      };

      const password = createClientUserPrivatePasswrod(packet.user, 16);
      const data = convertServicePacketToBuffer(packet);
      packet.hash = hashValue(password, data.slice(0, data.length - packet.hash.length), hashLength);

      this._secure.enp = {
        key: pubkey,
        iv: packet.secure
      };

      return await super.dispatchDataToDownStream(convertServicePacketToBuffer(packet));
    }
    return await super.dispatchStateToUpStream(state);
  }
}