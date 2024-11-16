import express, { NextFunction, Request, Response } from "express";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import { v4 as uuidv4 } from "uuid";
import http from "http";
import * as WebSocket from "ws";
import { Server as SocketServer } from "socket.io";

import { login, signup } from "./signup";
import { splitToken } from "./shard";
import { combine } from "shamir-secret-sharing";
import cors from "cors";
import axios from "axios";
import { accessToken } from "./shard";
import jwt, { JwtPayload, Secret } from "jsonwebtoken";

import { ethers } from "ethers";
dotenv.config();

const app = express();

function base64ToUint8Array(base64) {
  const binaryString = atob(base64);

  const uint8Array = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    uint8Array[i] = binaryString.charCodeAt(i);
  }

  return uint8Array;
}

function uint8ArrayToBase64(uint8Array: Uint8Array): string {
  const binaryString = Array.from(uint8Array)
    .map((byte: number) => String.fromCharCode(byte))
    .join("");

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
  res.status(200).json(`The server is up and running!`);
});
app.post("/signup", (req: Request, res: Response) => {
  signup(req, res);
});

app.post("/create-evm", (req: Request, res: Response) => {
  login(req, res);
});
interface AuthenticatedUser extends Request {
  user: string;
}
app.post(
  "/get-threshold",
  (req: AuthenticatedUser, res: Response, next: NextFunction) => {
    const authHeader = req.headers["authorization"];

    if (!authHeader) {
      return res.status(401).send("Unauthorized");
    }

    const token = authHeader.split(" ")[1];

    jwt.verify(
      token,
      process.env.ACCESS_TOKEN_SECRET as Secret,
      (err, decoded) => {
        if (err) {
          console.error("JWT Verification Error:", err);
          return res.status(403).send("Forbidden");
        }

        req.user = (decoded as JwtPayload).email;
        console.log("User we are working with:", req.user);

        connected_clients.forEach((client) => {
          client.send(
            JSON.stringify({ event: "RequestShards", data: req.user })
          );
        });

        return res
          .status(200)
          .json({ message: "Request to get the threshold was sent" });
      }
    );
  }
);

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
    connected_clients.map((client, i) => {
      if (client.id === data.node) {
        connected_clients.splice(i, 1);
      }
    });
  });
});

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
    const parsedMessage = JSON.parse(message.toString());
    const { event, data } = parsedMessage;

    switch (event) {
      case "Join":
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

        const interval = setInterval(async () => {
          if (shard_pieces.length >= 3) {
            await reconstructAsync();
            clearInterval(interval);
          }
        }, 1000);

        const reconstructAsync = async () => {
          // let shares_in_buffer = [];
          //share 2 shards with the user
          io.emit("ThresholdShards", {
            threshold: [shard_pieces[0], shard_pieces[1]],
          });

          // shard_pieces.map((shard_piece) => {
          //   shares_in_buffer.push(base64ToUint8Array(shard_piece));
          // });

          // const reconstructed = await combine(shares_in_buffer);
          // console.log(
          //   `Reconstructed Private key is ${uint8ArrayToBase64(reconstructed)}`
          // );

          // console.log(
          //   "Shares in buffer length after reconstruction" +
          //     shares_in_buffer.length
          // );

          // io.emit("ReconstructionSuccess", {
          //   key: uint8ArrayToBase64(reconstructed),
          // });
          shard_pieces = [];

          // shares_in_buffer = [];
        };

        break;
      case "LoginAck":
        addConsensus(data.email, data.login_response);

        console.log(
          `consensus credentials is ${JSON.stringify(credentials_consensus)}`
        );

        setTimeout(async () => {
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
            //create an evm account
            const wallet = ethers.Wallet.createRandom();
            console.log("Address:", wallet.address);
            console.log("Private Key:", wallet.privateKey);
            console.log("Mnemonic Phrase:", wallet.mnemonic.phrase);

            const accessToken = jwt.sign(
              { email: data.email },
              process.env.ACCESS_TOKEN_SECRET as Secret
            );

            const refreshToken = jwt.sign(
              { _id: data.email },
              process.env.REFRESH_TOKEN_SECRET as Secret
            );

            let shards = await splitToken(wallet.privateKey);
            io.emit("AccountCreationSuccess", {
              address: wallet.address,
              accessToken: accessToken,
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
            io.emit("AccountCreationFailed", {
              message:
                "Account creation , All nodes did not verify credentials",
            });
            console.log(
              `Atlease 3 Nodes are required to validate credentials`,
              JSON.stringify(credentials_consensus)
            );
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
