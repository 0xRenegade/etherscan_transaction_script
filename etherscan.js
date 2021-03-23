// Imports
import dotenv from "dotenv";
dotenv.config();
import { readFile, writeFileSync } from "fs";
import axios from "axios";
import express from "express";
import { scheduleJob } from "node-schedule";
import date from "date-and-time";
const { format } = date;
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const blacklist = require("./blacklist.json");
const sleep = require("util").promisify(setTimeout);
const api = require("etherscan-api").init(process.env.ETHERSCAN_API_KEY);

// Declarations
const wallets = [
  // Array of wallet addresses found on etherscan
];
const app = express();
const telegramBotUrl =
  "https://api.telegram.org/bot" +
  `${process.env.TELEGRAM_API_KEY}` +
  "/sendMessage?chat_id=" +
  `${process.env.CHANNEL_ID}&text=`;
let serverStart = Math.ceil((Date.now() / 1000).toFixed(1));
let taskRunning = false;
let condition = false;
let status = true;
let res;
console.log(blacklist);

// Functions
function onBlacklist(token) {
  condition = false;
  for (const el of blacklist) {
    if (el == token) {
      condition = true;
    }
  }
  return condition;
}

function logError(error) {
  const now = new Date();
  const time = format(now, "YYYY/MM/DD HH:mm:ss");
  const log = { error: error, time: time };
  readFile("logs/logs.json", (err, data) => {
    if (err) {
      status = false;
      throw err;
    }
    let logs = JSON.parse(data);
    logs.push(log);
    writeFileSync("logs/logs.json", JSON.stringify(logs, null, 2));
  });
}

function cacheTransaction(txn) {
  readFile("etherscan_transactions.json", (err, data) => {
    if (err) {
      logError(err);
      status = false;
    }
    let cache = JSON.parse(data);
    cache.push(txn);
    writeFileSync(
      "etherscan_transactions.json",
      JSON.stringify(cache, null, 2)
    );
  });
}

function duplicates(arr, token, address) {
  var bool = false;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i].tokenSymbol == token && arr[i].from == address) {
      bool = true;
    }
  }
  if (bool === false) {
    console.log("Duplicates not found in function");
  } else {
    console.log("Duplicates found in function");
  }
  return bool;
}

function timeConverter(UNIX_timestamp) {
  var a = new Date(UNIX_timestamp * 1000);
  var months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  var year = a.getFullYear();
  var month = months[a.getMonth()];
  var date = a.getDate();
  var hour = a.getHours();
  var min = a.getMinutes();
  var sec = a.getSeconds();
  var time =
    date + " " + month + " " + year + " " + hour + ":" + min + ":" + sec;
  return time;
}

// API
app.get("/status", (req, res) => {
  if (status) {
    res.send("online");
  } else {
    res.send("offline");
  }
});

app.listen(3000, () => {
  console.log("Status API Listening on /status | Port: 3000");
});

// Server
const job = scheduleJob("*/1 * * * *", () => {
  if (taskRunning) {
    return;
  }
  taskRunning = true;
  console.log("A new Job has started!");
  (async () => {
    for (let i = 0; i < wallets.length; i++) {
      console.log("Checking wallet number: " + i);
      try {
        var transactions = await api.account.tokentx(
          wallets[i],
          null,
          null,
          null,
          null,
          10,
          "desc"
        );
      } catch (err) {
        console.log(err);
        logError(err);
        status = false;
      } finally {
        res = transactions.result;
        var tokenObj = res.shift();
        console.log(tokenObj.from);
        console.log(tokenObj.tokenSymbol);
        console.log("Server init time: " + serverStart);
        console.log("Transaction Time Stamp: " + tokenObj.timeStamp);
        if (!duplicates(res, tokenObj.tokenSymbol, tokenObj.from)) {
          if (
            !onBlacklist(tokenObj.tokenSymbol) &&
            tokenObj.timeStamp > serverStart
          ) {
            await axios(
              telegramBotUrl +
                "There was a new etherscan transaction! \n" +
                `Link: https://etherscan.io/tx/${tokenObj.hash}` +
                `Time: ${timeConverter(tokenObj.timeStamp)} \n` +
                `From: ${tokenObj.from} \n` +
                `To: ${tokenObj.to} \n` +
                `Symbol: ${tokenObj.tokenSymbol}`
            );
            cacheTransaction(tokenObj);
            if (i == wallets.length - 1) {
              console.log("The Job has finished!");
              taskRunning = false;
              serverStart = Date.now();
            }
            serverStart = Math.ceil((Date.now() / 1000).toFixed(1));
            console.log("Updated server init time: " + serverStart);
          }
        }
      }
      console.log("----------------------------------------------------");
      if (i == wallets.length - 1) {
        console.log("The Job has finished!");
        taskRunning = false;
      }
      await sleep(5000);
    }
  })();
});
