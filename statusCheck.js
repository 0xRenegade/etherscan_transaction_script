// Imports
import axios from "axios";
import pm2 from "pm2";
import { scheduleJob } from "node-schedule";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const sleep = require("util").promisify(setTimeout);

// Declarations

const job = scheduleJob("*/5 * * * *", () => {
  console.log("Starting a new check!");
  (async function () {
    try {
      var req = await axios("http://localhost:3000/status");
    } catch (err) {
      console.log(err);
    } finally {
      if (req.data === "offline") {
        console.log("Server offline, restarting...");
        pm2.connect((err) => {
          if (err) {
            console.error(err);
          }
          pm2.restart("etherscan", (err) => {
            pm2.disconnect();
            if (err) throw err;
          });
        });
      } else {
        console.log("Server online!");
      }
    }
  })();
});
