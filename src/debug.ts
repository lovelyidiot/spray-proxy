Object.assign(process.env, {
  clientPort: 2022,
  clientHost: "localhost",
  clientConnection: 1,
  serverPort: 2222,
  serverHost: "localhost",
  backlog: 20,
  username: "here is a username!!",
  password: "here is a password!!"
});

// require("./server");
require("./client");
