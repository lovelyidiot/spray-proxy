const parameter: TransportParameter = {
  clientPort: Number.parseInt(process.env.clientPort!) || 2022,
  clientHost: process.env.clientHost || "localhost",
  clientConnection: Number.parseInt(process.env.clientConnection!) || 1,
  serverPort: Number.parseInt(process.env.serverPort!) || 2222,
  serverHost: process.env.serverHost || "localhost",
  backlog: Number.parseInt(process.env.backlog!) || 16,
  username: process.env.username || "default-username",
  password: process.env.password || "defualt-password",
  timeout: Number.parseInt(process.env.timeout!) || 180 * 1000,
};
Object.freeze(parameter);

delete process.env.clientPort;
delete process.env.clientHost;
delete process.env.clientConnection;
delete process.env.serverPort;
delete process.env.serverHost;
delete process.env.backlog;
delete process.env.username;
delete process.env.password;
delete process.env.timeout;

export default parameter;