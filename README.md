# spray-proxy
## WHAT IS IT
A secure socks5 proxy. User authentication, High Performance, Highly scalable.

## HOT IT WORK  
```
client                                                       server
client                                                       server
client <---> [client] <- secure transport -> [server] <--->  server
client                                                       server
client                                                       server
```

## HOW TO DEBUG
```powershell
git clone https://github.com/lovelyidiot/spray-proxy.git
cd spray-proxy
npm i
tsc
code . # for Visual Studio Code, F5 for Debug
```

## HOW TO CONFIG
In spray-proxy/src/config.ts (for debug spray-proxy/script/debug.ts)  
```typescript
clientPort: 2022,                 // client listen port
clientHost: "localhost",          // client listen ip
clientConnection: 3,              
serverPort: 2222,                 // server listen port
serverHost: "localhost",          // server listen ip
backlog: 20,
username: "here is a username!!", // username use in client and server
password: "here is a password!!"  // password use in client and server
```

## HOT TO RELEASE
```powershell
cd spray-proxy
tsc
# ./dist/* are [target files]
```

## HOT TO DEPLOY
+ copy [target files] to server target dir
+ in server target dir, run one of the following command
```powershell
node --trace-warnings -r ./config ./server
node --trace-warnings -r ./config ./watch-dog ./server
```
+ copy [target files] to client target dir
+ in client target dir, run one of the following command
```powershell
node --trace-warnings -r ./config ./client
node --trace-warnings -r ./config ./watch-dog ./client
```

## TransportObject
In src/definition.ts