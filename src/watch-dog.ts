import { isMaster, fork, on } from "cluster";
import { cpus } from "os";

if (isMaster) {
  cpus().forEach(() => {
    fork();
  });

  on("exit", (worker, code, signal) => {
    fork();
  });
} else {
  require(process.argv[2]);
}