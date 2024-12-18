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
import fs from 'fs';
import path from 'path';
import { ethers } from "ethers";
import { sendToken } from "./utils";
import crypto from "crypto"
dotenv.config();

const app = express();



interface Account {
  [email: string]: string;
}

const accountsFilePath = path.resolve(__dirname, 'accounts.json');
const keysPath=path.resolve(__dirname, 'keys.json');
const urlsPath=path.resolve(__dirname, "urls.json")



function rand_string(length = 12) {
  
  const timestamp = Date.now().toString();

 
  const hash = crypto.createHash('sha256').update(timestamp).digest();


  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const charactersLength = characters.length;

  let randomString = '';

  for (let i = 0; i < length; i++) {
  
    const randomValue = hash[i % hash.length] ^ crypto.randomBytes(1)[0];
    randomString += characters[randomValue % charactersLength];
  }

  return randomString;
}


// Function to save or retrieve wallet by email
const saveOrRetrieveWallet = (email: string, wallet: string): string | null => {
  try {
    // Check if accounts.json exists
    if (fs.existsSync(accountsFilePath)) {
      // Read the existing data from the accounts.json file
      const data = fs.readFileSync(accountsFilePath, 'utf-8');
      const accounts: Account = JSON.parse(data);

      // Check if the email already exists
      if (accounts[email]) {
        return accounts[email]; // Return the existing wallet value
      }
    }

    // If the email doesn't exist or file doesn't exist, add/update the email and wallet
    const newAccount: Account = { [email]: wallet };

    let updatedAccounts: Account = {};

    if (fs.existsSync(accountsFilePath)) {
      // If file exists, append the new account
      const data = fs.readFileSync(accountsFilePath, 'utf-8');
      updatedAccounts = JSON.parse(data);
    }

    // Add the new email-wallet pair
    updatedAccounts[email] = wallet;

    // Save the updated data to accounts.json
    fs.writeFileSync(accountsFilePath, JSON.stringify(updatedAccounts, null, 2));

    return null; // No wallet to return since we just saved it
  } catch (error) {
    console.error('Error saving or retrieving wallet:', error);
    return null;
  }
};
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
function stringToBase64(str) {
  return Buffer.from(str, 'utf-8').toString('base64');
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


app.post("/import-key", (req: Request, res: Response) => {
  const { key } = req.body;
  const authHeader = req.headers["authorization"];

  
  if (!authHeader) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1]; // Extract token

  // Verify JWT
  jwt.verify(
    token,
    process.env.ACCESS_TOKEN_SECRET as Secret,
    (err, decoded) => {
      if (err) {
        console.error("JWT Verification Error:", err);
        return res.status(403).json({ message: "Forbidden" });
      }

      // Extract email from JWT payload
      const email = (decoded as JwtPayload).email;
      console.log("User we are working with:", email);

      // Read the keys.json file
     
      fs.readFile(keysPath, "utf8", (readErr, data) => {
        if (readErr) {
          console.error("Error reading keys.json:", readErr);
          return res.status(500).json({ message: "Server error" });
        }

        let keysData = {};
        if (data) {
          try {
            keysData = JSON.parse(data);
          } catch (parseErr) {
            console.error("Error parsing keys.json:", parseErr);
            return res.status(500).json({ message: "Server error" });
          }
        }

        // Add or update the key-value pair
        if (!keysData[email]) {
          keysData[email] = [];
        }

         let parsed_key=JSON.parse(key)

        parsed_key.token=jwt.sign(
              {token: JSON.parse(key).value },
              process.env.ACCESS_TOKEN_SECRET as Secret
            );
        keysData[email].push(JSON.stringify(parsed_key));
        // keysData[email].push(key);

        // Write updated data back to keys.json
        fs.writeFile(keysPath, JSON.stringify(keysData, null, 2), (writeErr) => {
          if (writeErr) {
            console.error("Error writing to keys.json:", writeErr);
            return res.status(500).json({ message: "Server error" });
          }

          res.status(200).json({ message: "Key added successfully" });
        });
      });
    }
  );
});


app.get("/fetch-keys", (req: Request, res: Response) => {
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
    (err, decoded) => {
      if (err) {
        console.error("JWT Verification Error:", err);
        return res.status(403).json({ message: "Forbidden" });
      }

      // Extract email from JWT payload
      const email = (decoded as JwtPayload).email;
      console.log("Fetching keys for:", email);

      // Read the keys.json file
     
      fs.readFile(keysPath, "utf8", (readErr, data) => {
        if (readErr) {
          console.error("Error reading keys.json:", readErr);
          return res.status(500).json({ message: "Server error" });
        }

        let keysData = {};
        if (data) {
          try {
            keysData = JSON.parse(data);
          } catch (parseErr) {
            console.error("Error parsing keys.json:", parseErr);
            return res.status(500).json({ message: "Server error" });
          }
        }

        // Check if email exists in keys.json
        if (!keysData[email]) {
          return res.status(404).json({ message: "Email not found" });
        }

        // Return the array of keys for the email
        res.status(200).json({ keys: keysData[email] });
      });
    }
  );
});
app.post("/share-key", (req: Request, res: Response) => {
  const { email: targetEmail, key } = req.body;
console.log(`Called with ${targetEmail} and ${key}`)
 
  if (!targetEmail || !key) {
    return res.status(400).json({ message: "Email and key are required" });
  }

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
    (err) => {
      if (err) {
        console.error("JWT Verification Error:", err);
        return res.status(403).json({ message: "Forbidden" });
      }

    
      fs.readFile(keysPath, "utf8", (readErr, data) => {
        if (readErr) {
          console.error("Error reading keys.json:", readErr);
          return res.status(500).json({ message: "Server error" });
        }

        let keysData = {};
        if (data) {
          try {
            keysData = JSON.parse(data);
          } catch (parseErr) {
            console.error("Error parsing keys.json:", parseErr);
            return res.status(500).json({ message: "Server error" });
          }
        }

        // Check if target email exists in keys.json
        if (!keysData[targetEmail]) {
          // Create a new array if the target email doesn't exist
          keysData[targetEmail] = [];
        }

        // Add the key to the target email's array
        let parsed_key=JSON.parse(key)

        parsed_key.token=jwt.sign(
              {token: JSON.parse(key).value },
              process.env.ACCESS_TOKEN_SECRET as Secret
            );
        keysData[targetEmail].push(JSON.stringify(parsed_key));

        // Write updated data back to keys.json
        fs.writeFile(keysPath, JSON.stringify(keysData, null, 2), (writeErr) => {
          if (writeErr) {
            console.error("Error writing to keys.json:", writeErr);
            return res.status(500).json({ message: "Server error" });
          }

          res.status(200).json({ message: "Key shared successfully" });
        });
      });
    }
  );
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
                const provider = new ethers.providers.JsonRpcProvider("https://sepolia.infura.io/v3/2959eb07abcb46ec9feae666dd42506d");
                // const provider = new ethers.providers.JsonRpcProvider(
                //     "https://sepolia.infura.io/v3/2959eb07abcb46ec9feae666dd42506d" // Replace with your Infura Project ID
                // );

                // Fetch the balance
                const balance = await provider.getBalance(address); // Balance in Wei

                console.log("ETH Balance:", ethers.utils.formatEther(balance));

                // Respond with the balance
                return res.status(200).json({
                    message: "Balance retrieved successfully",
                    balance: ethers.utils.formatEther(balance), // Convert Wei to ETH
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
    const { time, receiver, value } = req.body;

    // Validate required fields
    if (!time || !receiver || !value) {
        return res.status(400).json({ message: "Time, value  and receiver email address are required" });
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
        const address = (decoded as JwtPayload).address; 
        const key= (decoded as JwtPayload).key
        
        // Ensure the payload has `address`

        if (!email || !address) {
            return res.status(400).json({ message: "Invalid token payload" });
        }

        try {
            // Generate a new token
            const newToken = jwt.sign(
                { owner: email, receiver: receiver, key, value },
                process.env.ACCESS_TOKEN_SECRET as Secret,
                { expiresIn: time } // Set expiration time
            );
let rand_url_string= rand_string();
let user_url= `https://strato-vault.com/app?id=${rand_url_string}=${stringToBase64(value)}`


//save the rand_url_string to a json as key and value is the newToken
 fs.readFile(urlsPath, "utf8", (readErr, data) => {
        if (readErr) {
          console.error("Error reading urls.json:", readErr);
          return res.status(500).json({ message: "Server error" });
        }

        let urlsData = {};
        if (data) {
          try {
            urlsData = JSON.parse(data);
          } catch (parseErr) {
            console.error("Error parsing urls.json:", parseErr);
            return res.status(500).json({ message: "Server error" });
          }
        }

      
        if (!urlsData[rand_url_string]) {
      
         urlsData[rand_url_string] = newToken
        }

     

        // Write updated data back to keys.json
        fs.writeFile(urlsPath, JSON.stringify(urlsData, null, 2), (writeErr) => {
          if (writeErr) {
            console.error("Error writing to urls.json:", writeErr);
            return res.status(500).json({ message: "Server error" });
          }

          
        });
      });



            return res.status(200).json({
                message: "Authorization successful",
                token: user_url,
            });
        } catch (error) {
            console.error("Error generating token:", error);
            return res.status(500).json({ message: "Internal server error" });
        }
    });
});



app.post("/authorize-unchecked-spend", (req: Request, res: Response) => {
    const authHeader = req.headers["authorization"];
    const { time,  value } = req.body;

    // Validate required fields
    if (!time  || !value) {
        return res.status(400).json({ message: "Time, value  and receiver email address are required" });
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
        const address = (decoded as JwtPayload).address; 
        const key= (decoded as JwtPayload).key
        
        // Ensure the payload has `address`

        if (!email || !address) {
            return res.status(400).json({ message: "Invalid token payload" });
        }

        try {
            // Generate a new token
            const newToken = jwt.sign(
                { owner: email,  key, value },
                process.env.ACCESS_TOKEN_SECRET as Secret,
                { expiresIn: time } // Set expiration time
            );
let rand_url_string= rand_string();
let user_url= `https://strato-vault.com/app?id=${rand_url_string}=${stringToBase64(value)}`


//save the rand_url_string to a json as key and value is the newToken
 fs.readFile(urlsPath, "utf8", (readErr, data) => {
        if (readErr) {
          console.error("Error reading urls.json:", readErr);
          return res.status(500).json({ message: "Server error" });
        }

        let urlsData = {};
        if (data) {
          try {
            urlsData = JSON.parse(data);
          } catch (parseErr) {
            console.error("Error parsing urls.json:", parseErr);
            return res.status(500).json({ message: "Server error" });
          }
        }

      
        if (!urlsData[rand_url_string]) {
      
         urlsData[rand_url_string] = newToken
        }

     

        // Write updated data back to keys.json
        fs.writeFile(urlsPath, JSON.stringify(urlsData, null, 2), (writeErr) => {
          if (writeErr) {
            console.error("Error writing to urls.json:", writeErr);
            return res.status(500).json({ message: "Server error" });
          }

          
        });
      });



            return res.status(200).json({
                message: "Authorization successful",
                token: user_url,
            });
        } catch (error) {
            console.error("Error generating token:", error);
            return res.status(500).json({ message: "Internal server error" });
        }
    });
});

app.get("/app", (req: Request, res: Response) => {
  const { id } = req.query;

 
  if (!id) {
    return res.status(400).json({ error: "Missing 'id' parameter" });
  }

  const externalUrl = `https://t.me/strato_vault_bot/stratovault?startapp=${id}`;

 
  res.redirect(externalUrl);
});

app.post("/foreign-spend", (req: Request, res: Response) => {

  const {id }= req.query
  //get the access_tokenfrom the db
  let fetched_token;

  fs.readFile(urlsPath, "utf8", (readErr, data) => {
        if (readErr) {
          console.error("Error reading urls.json:", readErr);
          return res.status(500).json({ message: "Server error tryna read the file" });
        }

        let urlsData = {};
        if (data) {
          try {
            urlsData = JSON.parse(data);
          } catch (parseErr) {
            console.error("Error parsing url.json:", parseErr);
            return res.status(500).json({ message: "Server error" });
          }
        }

       
        if (!urlsData[id as string]) {
          return res.status(404).json({ message: "Token not found" });
        }
fetched_token=urlsData[id as string];
       
    console.log(fetched_token +"Thats the fetched token")
    console.log(urlsData[id as string] +"thats the fetched")

  const authHeader = req.headers["authorization"];
  const {  to} = req.body;

 

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
    jwt.verify(fetched_token, process.env.ACCESS_TOKEN_SECRET as Secret, (err, decodedSpend) => {
      if (err) {
        console.error("Spend Token Verification Error:", err);
        return res.status(403).json({ message: "Forbidden: Invalid spend token." });
      }

      const owner = (decodedSpend as JwtPayload).owner;
      const receiver = (decodedSpend as JwtPayload).receiver;
      const key= (decodedSpend as JwtPayload).key;
      const value=  (decodedSpend as JwtPayload).value;

      // Ensure the receiver matches the email
      if (receiver !== email) {
        return res.status(401).json({ message: "Unauthorized: You are not authorized to spend this!" });
      }
 add_txn_details(owner, JSON.stringify({to, value, key}));
      // If authorized, send a spend request to connected clients
      connected_clients.forEach((client) => {
        client.send(JSON.stringify({ event: "RequestShards", data: owner }));
      });

      delete urlsData[id as string];

        fs.writeFile(urlsPath, JSON.stringify(urlsData, null, 2), (writeErr) => {
          if (writeErr) {
            console.error("Error writing to urls.json:", writeErr);
            return res.status(500).json({ message: "Server error trying to update the file" });
          }

          console.log(`ID ${id} successfully deleted from urls.json.`);
          return res.status(200).json({ message: "Spend request sent and ID deleted successfully." });
        });
   
    });
  });  });
});

app.post("/foreign-unchecked-spend", (req: Request, res: Response) => {

  const {id }= req.query
  //get the access_tokenfrom the db
  let fetched_token;

  fs.readFile(urlsPath, "utf8", (readErr, data) => {
        if (readErr) {
          console.error("Error reading urls.json:", readErr);
          return res.status(500).json({ message: "Server error tryna read the file" });
        }

        let urlsData = {};
        if (data) {
          try {
            urlsData = JSON.parse(data);
          } catch (parseErr) {
            console.error("Error parsing url.json:", parseErr);
            return res.status(500).json({ message: "Server error" });
          }
        }

       
        if (!urlsData[id as string]) {
          return res.status(404).json({ message: "Token not found" });
        }
fetched_token=urlsData[id as string];
       
    console.log(fetched_token +"Thats the fetched token")
    console.log(urlsData[id as string] +"thats the fetched")

  const authHeader = req.headers["authorization"];
  const {  to} = req.body;

 

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
    jwt.verify(fetched_token, process.env.ACCESS_TOKEN_SECRET as Secret, (err, decodedSpend) => {
      if (err) {
        console.error("Spend Token Verification Error:", err);
        return res.status(403).json({ message: "Forbidden: Invalid spend token." });
      }

      const owner = (decodedSpend as JwtPayload).owner;
     
      const key= (decodedSpend as JwtPayload).key;
      const value=  (decodedSpend as JwtPayload).value;

      // Ensure the receiver matches the email
     
 add_txn_details(owner, JSON.stringify({to, value, key}));
      // If authorized, send a spend request to connected clients
      connected_clients.forEach((client) => {
        client.send(JSON.stringify({ event: "RequestShards", data: owner }));
      });
      //delete the id from the database
      delete urlsData[id as string];

        fs.writeFile(urlsPath, JSON.stringify(urlsData, null, 2), (writeErr) => {
          if (writeErr) {
            console.error("Error writing to urls.json:", writeErr);
            return res.status(500).json({ message: "Server error trying to update the file" });
          }

          console.log(`ID ${id} successfully deleted from urls.json.`);
          return res.status(200).json({ message: "Spend request sent and ID deleted successfully." });
        });


   
    });
  });  });
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
          add_txn_details(req.user, JSON.stringify({to, value, key:(decoded as JwtPayload).key}));

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
        `The shard from ${client_id} of IP address: ${Ip} is ${data}`
    );

    // Push shard to the array
    shard_pieces.push(data.request_shard_response);

    const reconstructAsync = async () => {
        try {
            let shares_in_buffer = [];

            // Convert base64 shard pieces into Uint8Array
            shard_pieces.map((shard_piece) => {
                shares_in_buffer.push(base64ToUint8Array(shard_piece));
            });

            // Combine the shares to reconstruct the private key
            // const reconstructed = await combine(shares_in_buffer);

            // const provider = new ethers.providers.JsonRpcProvider(
            //     "https://sepolia.infura.io/v3/2959eb07abcb46ec9feae666dd42506d"
            // );

            const txnDetails = JSON.parse(txn_details[data.email]);
            // s

            console.log("Recipient address:", txnDetails.to);
            console.log("Transaction value in ETH:", ethers.utils.parseEther(txnDetails.value));

          

            if (txnDetails) {
              console.log("eth to send "+ txnDetails.value)
                const tx = {
                    to: txnDetails.to,
                    amount: Number(txnDetails.value),
                privateKey:txnDetails.key
                   
                };

let {receipt, transaction}:any= await sendToken(Number(tx.amount), tx.to, tx.privateKey)
if(receipt.status==1){
  io.emit("TXConfirmed", {
    message:"Transaction confirmed!"
  });

}
         
else{
  console.log("transaction failed")
    io.emit("TXFailed", {
    message:"Transaction failed!"
  });


}
            }

            // Clear shard pieces and txn details
            shard_pieces = [];
            delete txn_details[data.email];
        } catch (error) {
            console.error("Error during transaction reconstruction or execution:", error);
        }
    };

    // Check for enough shards and trigger reconstruction
    const interval = setInterval(async () => {
        if (shard_pieces.length >= 3) {
            await reconstructAsync();
            clearInterval(interval);
        }
    }, 1000);

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
            //create an evm account if it does not exist
            const wallet = ethers.Wallet.createRandom();
            console.log("Address:", wallet.address);
            console.log("Private Key:", wallet.privateKey);
            console.log("Mnemonic Phrase:", wallet.mnemonic.phrase);

            const accessToken = jwt.sign(
              { email: data.email, address:wallet.address, key:wallet.privateKey },
              process.env.ACCESS_TOKEN_SECRET as Secret
            );
           let old_wallet= saveOrRetrieveWallet(data.email, accessToken)
           let old_address=""
           if (old_wallet){
            jwt.verify(old_wallet, process.env.ACCESS_TOKEN_SECRET,  async (err, decoded) => {
            if (err) {
                console.error("JWT Verification Error:", err);
               
            }

            
            const address = (decoded as JwtPayload).address;
            old_address=address;
            
           })}

            const refreshToken = jwt.sign(
              { _id: data.email },
              process.env.REFRESH_TOKEN_SECRET as Secret
            );


            let shards = await splitToken(wallet.privateKey);
            io.emit("AccountCreationSuccess", {
              address: old_address?old_address:wallet.address,
              accessToken: old_wallet?old_wallet:accessToken,
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
