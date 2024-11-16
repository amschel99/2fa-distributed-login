import express, { Request, Response } from "express";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import { v4 as uuidv4 } from "uuid";
import http from "http";
import * as WebSocket from "ws";
import { Server as SocketServer } from "socket.io";

import { login, signup } from "./signup";
import { recreateKey, splitToken } from "./shard";
import { combine } from "shamir-secret-sharing";
import cors from "cors";
import axios from "axios";
import { accessToken } from "./shard";
dotenv.config();

const app = express();
// interface Client extends WebSocket{
//     id:string,
//     ip:string,
//     email?:string
// }

function base64ToUint8Array(base64) {
  // Decode the base64 string to a binary string
  const binaryString = atob(base64);

  // Create a Uint8Array and set each character code from the binary string
  const uint8Array = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    uint8Array[i] = binaryString.charCodeAt(i);
  }

  return uint8Array;
}

function uint8ArrayToBase64(uint8Array: Uint8Array): string {
  // Convert Uint8Array to binary string
  const binaryString = Array.from(uint8Array)
    .map((byte: number) => String.fromCharCode(byte))
    .join("");

  // Encode binary string to base64
  return btoa(binaryString);
}

export const connected_clients: Array<any> = [];
let credentials_consensus: { [key: string]: Array<boolean> } = {};
let shard_pieces = [];
const addConsensus = (key: string, value: boolean) => {
  if (credentials_consensus[key]) {
    credentials_consensus[key].push(value);
  } else {
    credentials_consensus[key] = [value];
  }
};

app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.get("/", (req: Request, res: Response) => {
  res.status(200).json(`Working`);
});
app.post("/signup", (req: Request, res: Response) => {
  signup(req, res);
});
app.post("/login", (req: Request, res: Response) => {
  login(req, res);
});
app.post("/request-shards", (req: Request, res: Response) => {
  recreateKey(req, res);
});

const PORT = process.env.PORT || 4000;
const httpServer = http.createServer(app);

export const io = new SocketServer(httpServer, {
  path: "/socket.io",
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});
io.on("connection", (socket) => {
  socket.emit("newConnection", { message: connected_clients });

  socket.on("removeNode", (data) => {
    //data.node
    connected_clients.map((client, i) => {
      if (client.id === data.node) {
        connected_clients.splice(i, 1);
      }
    });
  });
});

// io.on("removeNode", (data)=>{
//   //data.node
//   connected_clients.map((client,i)=>{
//     if(client.id===data.node){

//      connected_clients.splice(i,1)

//     }

//  });

// })

const wss = new WebSocket.Server({ noServer: true });

wss?.on("connection", (client: WebSocket.WebSocket, req) => {
  const Ip = Array.isArray(req.headers["x-forwarded-for"])
    ? req.headers["x-forwarded-for"][0]
    : req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  const client_id = uuidv4();
  const ws = client;
  ws["id"] = client_id;
  ws["ip"] = Ip;
  connected_clients.push(ws);

  ws?.on("message", async (message) => {
    // Parse the incoming message
    const parsedMessage = JSON.parse(message.toString());
    const { event, data } = parsedMessage;

    switch (event) {
      case "Join":
        // Handle the "Join" event
        const remainingClients = connected_clients.filter(
          (client) => client.id !== client_id
        );
        remainingClients.forEach((remainingClient) => {
          remainingClient?.send(
            JSON.stringify({
              event: "JoinNotification",
              data: `${client_id}, ${Ip} Joined the network`,
            })
          );
        });
        break;
      case "SavedShardAck":
        connected_clients.forEach((notifyClient) => {
          notifyClient?.send(
            JSON.stringify({
              event: "SavedShardAckNotification",
              data: `${client_id}, ${Ip} Succesfully stored the shard`,
            })
          );
        });

        break;
      // Add more cases for other event types as needed
      case "SignUpAck":
        connected_clients.forEach((notifyClient) => {
          notifyClient?.send(
            JSON.stringify({
              event: "SignUpAckNotification",
              data: `${client_id}, ${Ip} Succesfully registered the user`,
            })
          );
        });
        break;
      case "ShardAck":
        console.log(
          `The shard from ${client_id} of IP adress: ${Ip} is ${data}`
        );

        shard_pieces.push(data);
        //After 4 seconds The shardpieces list will have all the shards

        const interval = setInterval(async () => {
          if (shard_pieces.length >= 3) {
            await reconstructAsync();
            clearInterval(interval); // Stop the interval once the condition is met
          }
        }, 1000);

        const reconstructAsync = async () => {
          let shares_in_buffer = [];

          shard_pieces.map((shard_piece) => {
            shares_in_buffer.push(base64ToUint8Array(shard_piece));
          });

          const reconstructed = await combine(shares_in_buffer);
          console.log(
            `Reconstructed Api key is ${uint8ArrayToBase64(reconstructed)}`
          );

          //make an api call with reconstructed
          let response = await axios.get(
            "https://api-demo.airwallex.com/api/v1/balances/current",
            {
              headers: {
                // Corrected from 'Headers' to 'headers'
                Authorization: `Bearer ${accessToken}`,
              },
            }
          );

          console.log(
            "Shares in buffer length after reconstruction" +
              shares_in_buffer.length
          );
          console.log(`Shard pieces after reconstruction ${shard_pieces}`);
          io.emit("Success", {
            key: response.data,
          });
          shard_pieces = [];

          shares_in_buffer = [];
        };
        // setTimeout(,4000);

        //data is just a shard string

        break;
      case "LoginAck":
        addConsensus(data.email, data.login_response);

        console.log(
          `consensus credentials is ${JSON.stringify(credentials_consensus)}`
        );

        setTimeout(async () => {
          // && credentials_consensus[`${data.email}`][1]==true&& credentials_consensus[`${data.email}`][2]==true

          if (
            credentials_consensus[`${data.email}`]?.[0] == true &&
            credentials_consensus[`${data.email}`]?.[1] == true &&
            credentials_consensus[`${data.email}`]?.[2] == true
          ) {
            connected_clients.forEach((notifyClient) => {
              notifyClient?.send(
                JSON.stringify({
                  event: "LoginAckNotification",
                  data: `All servers agree on the credentials`,
                })
              );
            });

            let shards = await splitToken();
            io.emit("getShards", {
              shards: JSON.stringify(Array.from(shards)),
            });

            connected_clients.forEach((notifyClient, i) => {
              console.log(shards[i]);
              notifyClient?.send(
                JSON.stringify({
                  event: "Shard",
                  data: JSON.stringify({ id: data.email, shard: shards[i] }),
                })
              );
            });

            delete credentials_consensus[data.email];
          } else {
            io.emit("LoginFailed", {
              message: "Login Failed , All nodes did not verify credentials",
            });
            console.log(
              `Atlease 3 Nodes are required to validate credentials`,
              JSON.stringify(credentials_consensus)
            );
            //do nothing literary
          }
        }, 3000);

        break;

      default:
        console.warn(`Unknown event type: ${event}`);
        break;
    }
  });

  ws?.on("close", () => {
    connected_clients.map((client, i) => {
      if (client.id === client_id) {
        connected_clients.splice(i, 1);
      }
    });
    const remaining_clients = connected_clients.filter(
      (client) => client.id !== client_id
    );
    remaining_clients.forEach((remaining_client) => {
      remaining_client?.send(
        JSON.stringify({
          event: "Notification",
          data: `${client_id} , ${Ip} left the network`,
        })
      );
    });
  });
});

httpServer.on("upgrade", (request, socket, head) => {
  if (request.url.startsWith("/socket.io")) {
    //allow socket.io
  } else {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  }
});

let server = httpServer.listen(4000, () => {
  console.log(
    `HTTP server with WebSocket is running on http://localhost:${PORT}`
  );
});
setInterval(() => {
  console.log(connected_clients.length);
}, 2000);
