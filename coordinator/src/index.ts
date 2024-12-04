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
let txn_details: { [key: string]: string } = {};
let credentials_consensus: { [key: string]: Array<boolean> } = {};
let shard_pieces = [];
const addConsensus = (key: string, value: boolean) => {
  if (credentials_consensus[key]) {
    credentials_consensus[key].push(value);
  } else {
    credentials_consensus[key] = [value];
  }
};
const add_txn_details= (key:string, value:string)=>{
  if(!txn_details[key]){

  
 txn_details[key]=value
  }

}

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
app.post("/balance", async (req: Request, res: Response) => {
    const authHeader = req.headers["authorization"];

    // Check if the Authorization header is present
    if (!authHeader) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1]; // Extract token

    // Verify JWT
    jwt.verify(
        token,
        process.env.ACCESS_TOKEN_SECRET as Secret,
        async (err, decoded) => {
            if (err) {
                console.error("JWT Verification Error:", err);
                return res.status(403).json({ message: "Forbidden" });
            }

            // Extract data from JWT payload
            const email = (decoded as JwtPayload).email;
            const address = (decoded as JwtPayload).address;

            if (!address) {
                return res
                    .status(400)
                    .json({ message: "No Ethereum address found in token" });
            }

            console.log("User we are working with:", email);

            try {
                // Connect to the Ethereum provider
                const provider = new ethers.JsonRpcProvider(
                    "https://sepolia.infura.io/v3/4abdaeeddf984180b9235b6ac3f13100" // Replace with your Infura Project ID
                );

                // Fetch the balance
                const balance = await provider.getBalance(address); // Balance in Wei

                console.log("ETH Balance:", ethers.formatEther(balance));

                // Respond with the balance
                return res.status(200).json({
                    message: "Balance retrieved successfully",
                    balance: ethers.formatEther(balance), // Convert Wei to ETH
                });
            } catch (providerError) {
                console.error("Error fetching balance:", providerError);
                return res.status(500).json({
                    message: "Error fetching balance",
                    error: providerError.message,
                });
            }
        }
    );
});

app.post("/authorize-spend", (req: Request, res: Response) => {
    const authHeader = req.headers["authorization"];
    const { time, receiver } = req.body;

    // Validate required fields
    if (!time || !receiver) {
        return res.status(400).json({ message: "Time and receiver email address are required" });
    }

    // Validate Authorization header
    if (!authHeader) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1]; // Extract token

    // Verify the JWT
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET as Secret, async (err, decoded) => {
        if (err) {
            console.error("JWT Verification Error:", err);
            return res.status(403).json({ message: "Forbidden" });
        }

        // Extract data from JWT payload
        const email = (decoded as JwtPayload).email; // Ensure the payload has `owner`
        const address = (decoded as JwtPayload).address; // Ensure the payload has `address`

        if (!email || !address) {
            return res.status(400).json({ message: "Invalid token payload" });
        }

        try {
            // Generate a new token
            const newToken = jwt.sign(
                { owner: email, receiver: receiver },
                process.env.ACCESS_TOKEN_SECRET as Secret,
                { expiresIn: time } // Set expiration time
            );

            return res.status(200).json({
                message: "Authorization successful",
                token: newToken,
            });
        } catch (error) {
            console.error("Error generating token:", error);
            return res.status(500).json({ message: "Internal server error" });
        }
    });
});


app.post("/foreign-spend", (req: Request, res: Response) => {
  const authHeader = req.headers["authorization"];
  const { spendToken } = req.body;

  // Validate input
  if (!spendToken) {
    return res.status(400).json({ message: "Spend token must be provided!" });
  }

  if (!authHeader) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1]; // Extract token

  // Verify the main JWT token
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET as Secret, (err, decodedMain) => {
    if (err) {
      console.error("JWT Verification Error:", err);
      return res.status(403).json({ message: "Forbidden: Invalid authorization token." });
    }

    const email = (decodedMain as JwtPayload).email;
    const address = (decodedMain as JwtPayload).address;

    if (!email || !address) {
      return res.status(400).json({ message: "Invalid authorization token payload." });
    }

    // Verify the spendToken
    jwt.verify(spendToken, process.env.ACCESS_TOKEN_SECRET as Secret, (err, decodedSpend) => {
      if (err) {
        console.error("Spend Token Verification Error:", err);
        return res.status(403).json({ message: "Forbidden: Invalid spend token." });
      }

      const owner = (decodedSpend as JwtPayload).owner;
      const receiver = (decodedSpend as JwtPayload).receiver;

      // Ensure the receiver matches the email
      if (receiver !== email) {
        return res.status(401).json({ message: "Unauthorized: You are not authorized to spend this!" });
      }

      // If authorized, send a spend request to connected clients
      connected_clients.forEach((client) => {
        client.send(JSON.stringify({ event: "RequestShards", data: owner }));
      });

      return res.status(200).json({ message: "Spend request sent successfully." });
    });
  });
});

app.post(
  "/spend",
  (req: AuthenticatedUser, res: Response, next: NextFunction) => {
    const authHeader = req.headers["authorization"];
    const {to, value }= req.body;
    if(!to || !value){
      res.status(400).json(`Both recipient and value must be provided!`)
    }
  

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
          add_txn_details(req.user, JSON.stringify({to, value}));

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

        shard_pieces.push(data.request_shard_response );

        const interval = setInterval(async () => {
          if (shard_pieces.length >= 3) {
            await reconstructAsync();
            clearInterval(interval);
          }
        }, 1000);

        const reconstructAsync = async () => {
          let shares_in_buffer = [];
          //share 2 shards with the user
        

          shard_pieces.map((shard_piece) => {
            shares_in_buffer.push(base64ToUint8Array(shard_piece));
          });

          const reconstructed = await combine(shares_in_buffer);
          
          let privKey=  Buffer.from(uint8ArrayToBase64(reconstructed), 'base64').toString('utf-8');
            const provider = new ethers.JsonRpcProvider(
                    "https://sepolia.infura.io/v3/4abdaeeddf984180b9235b6ac3f13100" 
                );
               
                 console.log(privKey +" reconstructed")

const wallet = new ethers.Wallet(privKey, provider);
console.log(JSON.parse(txn_details[data.email] ).to)
console.log(ethers.parseEther(JSON.parse(txn_details[data.email] ).value))
  const tx = {
        to: JSON.parse(txn_details[data.email] ).to,// Replace with the recipient's address
        value: ethers.parseEther(JSON.parse(txn_details[data.email] ).value), // Amount in ETH to send (1 ETH = 10^18 Wei)
        gasLimit: 21000, // Minimum gas limit for simple transfers
        gasPrice: ethers.parseUnits("5", "gwei"), // Adjust gas price based on network conditions
    };
      const txResponse = await wallet.sendTransaction(tx);
        const receipt = await txResponse.wait();

        io.emit("TXSent", {
              message:
               JSON.stringify(txResponse)
            });


        io.emit("TXConfirmed", {
              message:
               JSON.stringify(receipt)
            });
            
       
          shard_pieces = [];

          shares_in_buffer = [];
          delete txn_details[data.email]
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
              { email: data.email, address:wallet.address },
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
