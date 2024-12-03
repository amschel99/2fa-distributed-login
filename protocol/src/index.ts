import express, { Request, Response } from "express";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import {
  getShard,
  saveShard,
  store_credentials,
  verify_credentials,
} from "./credentials";
import WebSocket from "ws";
import http from "http";

dotenv.config();

const app = express();

app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));

const wsClient = new WebSocket("ws://54.206.14.84:4000");

wsClient.on("open", () => {
  console.log("WebSocket client connected to the server");
  let message = { event: "Join" };
  wsClient.send(JSON.stringify(message));
});

wsClient.on("message", async (rawData) => {
  const { event, data } = JSON.parse(rawData.toString());

  switch (event) {
    case "Signup":
      console.log("Handling Signup event with data:", data);
      let res = await store_credentials(data.email, data.password);
      if (res == "Credentials stored successfully") {
        wsClient.send(JSON.stringify({ event: "SignUpAck" }));
        break;
      } else {
        break;
      }
    case "JoinNotification":
      console.log(data);
      break;
    case "SavedShardAckNotification":
      console.log(data);
      break;
    case "LoginAckNotification":
      console.log(data);
      break;

    case "SignUpAckNotification":
      console.log(data);
      break;
    case "RequestShards":
      console.log(data);
      let request_shard_response = await getShard(data);
      if (request_shard_response) {
        wsClient.send(
          JSON.stringify({ event: "ShardAck", data: {email:data, request_shard_response :request_shard_response }})
        );
        console.log(`Sent the shard`);
        break;
      } else {
        break;
      }
      //The data is an email
      break;
    case "Shard":
      console.log("detected");
      let shard_response = await saveShard(
        JSON.parse(JSON.parse(JSON.stringify(data))).shard,
        JSON.parse(JSON.parse(JSON.stringify(data))).id
      );
      if (shard_response == "Shard saved successfully") {
        wsClient.send(JSON.stringify({ event: "SavedShardAck" }));
        break;
      } else {
        break;
      }

      break;
    case "Login":
      console.log("Handling Login event ");
      const login_response = await verify_credentials(
        data.email,
        data.password
      );
      if (login_response == true || login_response == false) {
        wsClient.send(
          JSON.stringify({
            event: "LoginAck",
            data: { email: data.email, login_response },
          })
        );
        break;
      } else {
        break;
      }
      break;

    default:
      console.warn("Unhandled event type:", event);
  }

  console.log("Received message from WebSocket server:", data);
});

wsClient.on("close", (data) => {
  console.log("WebSocket client connection closed" + data);
});

wsClient.on("error", (error) => {
  console.error("WebSocket client error:", error);
});

const PORT = process.env.PORT || 4000;
const httpServer = http.createServer(app);

httpServer.listen(PORT, () => {
  console.log(`HTTP server running on http://localhost:${PORT}`);
});
