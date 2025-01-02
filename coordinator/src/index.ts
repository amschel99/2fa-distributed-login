import express, { NextFunction, Request, response, Response } from "express";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import { v4 as uuidv4 } from "uuid";
import http from "http";
import * as WebSocket from "ws";
import { Server as SocketServer } from "socket.io";
import OpenAI from "openai";

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
import { checkBalance, sendUSDT } from "./usdt";
import { createBTCWallet, getBitcoinBalance, sendBTC } from "./bitcoin";
import { offramp, quote } from "./on_off_ramp";
import { connectDb } from "./dbconfig";
import Conversation from "./openai/dbModel";
dotenv.config();

const app = express();
const cronjobs = [];

const logic = async (nonce) => {
  console.log(`Running the logic for expiry`)
  try {
    const data = await fs.promises.readFile(keysPath, "utf8");
  
    let keysData = JSON.parse(data.trim()); // Ensure the data is valid JSON

    let secretFound = false;
    for (const email in keysData) {
      const keys = keysData[email];
      for (let i = 0; i < keys.length; i++) {
        try {
          console.log(`The type of  ${i} is  ${typeof  keys[i]}`)
          let keyObj = JSON.parse(keys[i]); // Try parsing each stringified JSON object
          
          if (keyObj.url && keyObj.url.includes(nonce)) {
            keyObj.expired = true;
            keys[i] = JSON.stringify(keyObj);
            secretFound = true;
            break;
          }
        } catch (err) {
          console.error(`Error parsing key at index ${i}:`, err); // Log if JSON is malformed
        }
      }
      if (secretFound) break;
    }

    if (!secretFound) {
      console.log(`Secret with nonce "${nonce}" not found.`);
      return { message: "Secret not found" };
    }

    await fs.promises.writeFile(keysPath, JSON.stringify(keysData));
    console.log(`Secret with nonce "${nonce}" has been marked as expired.`);

    return { message: "Secret updated successfully" };
  } catch (error) {
    console.error("Error updating the secret:", error);
    return { message: "Server error", error };
  }
};

function addCronJob(name, time, logic, ...args) {
  const unit = time.slice(-1); // Last character (time unit)
  const value = parseInt(time.slice(0, -1), 10); // Numeric part of the time

  if (isNaN(value)) {
    console.error("Invalid time format. Use formats like '10s', '10m', '4h'.");
    return;
  }

  let delay;
  switch (unit) {
    case "s":
      delay = value * 1000;
      break;
    case "m":
      delay = value * 60 * 1000;
      break;
    case "h":
      delay = value * 60 * 60 * 1000;
      break;
    default:
      console.error("Invalid time unit. Use 's', 'm', or 'h'.");
      return;
  }

  const job = {
    name,
    runAt: new Date(Date.now() + delay),
    logic, 
    timer: setTimeout(() => {
      try {
        logic(...args); // Call the logic with arguments
      } catch (error) {
        console.error(`Error executing cronjob "${name}":`, error);
      }
      removeCronJob(name); // Remove the job after execution
    }, delay),
  };

  cronjobs.push(job);
  console.log(`Cronjob "${name}" added to run in ${time} (${job.runAt}).`);
}

function removeCronJob(name) {
  const index = cronjobs.findIndex((job) => job.name === name);
  if (index !== -1) {
    clearTimeout(cronjobs[index].timer); // Clear the timer if removing manually
    cronjobs.splice(index, 1);
    console.log(`Cronjob "${name}" has been removed.`);
  } else {
    console.error(`Error: Cronjob "${name}" not found.`);
  }
}



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
  console.log(`The email provided is `, email)
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
app.post("/create-btc", async (req:Request, res:Response)=>{
login(req, res)
})

app.post("/import-key", (req: Request, res: Response) => {
  //AIRWALLEX , OPENAI
  const { key, type, purpose } = req.body;
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
            parsed_key.purpose=purpose;
           
        keysData[email].push(JSON.stringify(parsed_key));
        // keysData[email].push(key);

        // Write updated data back to keys.json
        fs.writeFile(keysPath, JSON.stringify(keysData), (writeErr) => {
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
  //AIRWALLEX, OPENAI
  const { email: targetEmail, key, time, purpose, type } = req.body;//time will be in seconds
console.log(`Called with ${targetEmail} and ${key} and ${time}`)
 
  if (!targetEmail || !key || !time ) {
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

      parsed_key.token = jwt.sign(
    { token: parsed_key.value }, // Payload
    process.env.ACCESS_TOKEN_SECRET as Secret, // Secret key
    { expiresIn: time } // Expiration
  );
  parsed_key.purpose=purpose;

  let nonce= rand_string()
parsed_key.url=`https://strato-vault.com/secret?id=${stringToBase64(targetEmail)}&nonce=${nonce}`
        keysData[targetEmail].push(JSON.stringify(parsed_key));

        // Write updated data back to keys.json
        fs.writeFile(keysPath, JSON.stringify(keysData), (writeErr) => {
          if (writeErr) {
            console.error("Error writing to keys.json:", writeErr);
            return res.status(500).json({ message: "Server error" });
          }
addCronJob(rand_string(),time, logic, nonce );// handle expiry
          res.status(200).json({ message: "Key shared successfully" });
        });
      });
    }
  );
});


app.post("/signup", (req: Request, res: Response) => {
  signup(req, res);
});
app.get("/test-btc", async (req:Request, res:Response)=>{
  try{
    let wallet= await createBTCWallet();
    let balance= await getBitcoinBalance({ address: 'tb1pkh7znsdzxjmzeyrussdr2gl0xvln5tnsxhquq04lcu5aulnehptqsavmuc', inSatoshi: true, network: 'test3' });
    res.status(200).json({address:wallet.address, balance})

  }
  catch(e){
res.status(500).json(`An error occured`)
  }
});



app.post("/create-account", (req: Request, res: Response) => {
  login(req, res);
});
interface AuthenticatedUser extends Request {
  user: string;
}


app.post("/quote", async (req: Request, res: Response) => {
  try {
    const { tokenSymbol, amount } = req.body;

    // Validate required fields
    if (!tokenSymbol || !amount) {
      return res
        .status(400)
        .json({ message: "A token symbol and amount must be provided to get a quote" });
    }

    // Extract and validate Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ message: "Unauthorized: Missing Authorization header" });
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "Unauthorized: Token is missing" });
    }

    // Verify JWT
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET as Secret, async (err, decoded) => {
      if (err) {
        console.error("JWT Verification Error:", err.message);
        return res.status(403).json({ message: "Forbidden: Invalid token" });
      }

      try {
        // Extract key from JWT payload
        const key = (decoded as JwtPayload).key;

        // Call the quote function
        const quoteResult = await quote(tokenSymbol, amount, key);

        // Respond with the result
        return res.status(200).json(quoteResult);
      } catch (quoteError) {
        console.error("Error in quote generation:", quoteError);
        return res.status(500).json({ message: "Failed to generate quote" });
      }
    });
  } catch (error) {
    console.error("Error in /quote endpoint:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

app.post("/off-ramp", async (req: Request, res: Response) => {
  try {
    const { tokenSymbol, amount, phone } = req.body;

  
    if (!tokenSymbol || !amount || !phone) {
      return res
        .status(400)
        .json({ message: "A token symbol and amount must be provided to get a quote" });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ message: "Unauthorized: Missing Authorization header" });
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "Unauthorized: Token is missing" });
    }

    
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET as Secret, async (err, decoded) => {
      if (err) {
        console.error("JWT Verification Error:", err.message);
        return res.status(403).json({ message: "Forbidden: Invalid token" });
      }

      try {
     
        const key = (decoded as JwtPayload).key;

        
        const txResult = await offramp(key, tokenSymbol, amount, phone);

        return res.status(200).json(txResult);
      } catch (Error) {
        console.error("Error in offramp:", Error);
        return res.status(500).json({ message: "Failed to offramo" });
      }
    });
  } catch (error) {
    console.error("Error in /offramp endpoint:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});


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
            const btcAddress= (decoded as JwtPayload).btcAddress

            if (!address || !btcAddress) {
                return res
                    .status(400)
                    .json({ message: "No Ethereum and bitcoin  address found in token" });
            }

            console.log("User we are working with:", email);

            try {
                // Connect to the Ethereum provider
            const provider= new ethers.providers.InfuraProvider("sepolia","b63c0b03df1e46a08d801f0f48f09e91" )
                // const provider = new ethers.providers.JsonRpcProvider(
                //     "https://rpc.ankr.com/celo/ad2fbd3050cc25e97a0548126287480688815b0d2c9cd6154f0105bf91879f23" // Replace with your Infura Project ID
                // );

                // Fetch the balance
                const balance = await provider.getBalance(address); // Balance in Wei
                const btcBalance= await getBitcoinBalance({address:btcAddress, inSatoshi:true,network:"test3"});

                console.log("ETH Balance:", ethers.utils.formatEther(balance));

                // Respond with the balance
                return res.status(200).json({
                    message: "Balance retrieved successfully",
                    balance: ethers.utils.formatEther(balance),
                    btcBalance:btcBalance
                    // Convert Wei to ETH
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

app.post("/usdt-balance", async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers["authorization"];


    if (!authHeader) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1]; // Extract tokenh

   
    const decoded = jwt.verify(
      token,
      process.env.ACCESS_TOKEN_SECRET as Secret
    ) as JwtPayload;

    const email = decoded?.email;
    const address = decoded?.address;

    if (!address) {
      return res.status(400).json({ message: "Address is missing in the token" });
    }

    const balance = await checkBalance(address);

    return res.status(200).json({
      message: "Ok",
      data: { email, address, balance },
    });
  } catch (err) {
    console.error("Error in /usdt-balance:", err);

    if (err.name === "JsonWebTokenError") {
      return res.status(403).json({ message: "Forbidden" });
    }

    return res.status(500).json({ message: "Internal Server Error" });
  }
});


app.post("/spend-usdt", async(req:Request, res:Response)=>{
  const {to, value}=req.body;
  try{
 const authHeader = req.headers["authorization"];


    if (!authHeader) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1]; // Extract token

   
    const decoded = jwt.verify(
      token,
      process.env.ACCESS_TOKEN_SECRET as Secret
    ) as JwtPayload;

   
    const address = decoded?.address;
    const email= decoded?.email;
 add_txn_details(email, JSON.stringify({to, value, key:(decoded as JwtPayload).key}));

        console.log("User we are working with:", email);

        connected_clients.forEach((client) => {
          client.send(
            JSON.stringify({ event: "RequestShards", data: email, token:"USDT" })
          );
        });
    //emit event

  }
  catch(e){

  }

})
app.post("/spend-btc", async(req:Request, res:Response)=>{
  const {to, value}=req.body;
  try{
 const authHeader = req.headers["authorization"];


    if (!authHeader) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1]; // Extract token

   
    const decoded = jwt.verify(
      token,
      process.env.ACCESS_TOKEN_SECRET as Secret
    ) as JwtPayload;

   
    const address = decoded?.address;
    const email= decoded?.email;
    const btcAddress= decoded?.btcAddress;
 add_txn_details(email, JSON.stringify({to, value, key:(decoded as JwtPayload).key, btcAddress}));

        console.log("User we are working with:", email);

        connected_clients.forEach((client) => {
          client.send(
            JSON.stringify({ event: "RequestShards", data: email, token:"BTC" })
          );
        });
    //emit event

  }
  catch(e){

  }

})

//the function below tests the usdt balance


// app.get("/test-usdt", async (req:Request, res:Response)=>{
// try{
//   let balance= await checkBalance("0x439d9F679914aBfc736009cBc66B01c063208B82")
//   res.status(200).json(balance)

// }
// catch(e){
//   res.status(500).json("error")

// }

// })



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

app.get("/secret", (req: Request, res: Response) => {
  const { id , nonce} = req.query;

 
  if (!id) {
    return res.status(400).json({ error: "Missing 'id' parameter" });
  }
  console.log(`The nonce is ${nonce}`)

  const externalUrl = `https://t.me/strato_vault_bot/stratovault?startapp=${id}_${nonce}-xy`;

 
  res.redirect(externalUrl);
});



app.post("/use-key", async (req: Request, res: Response) => {
  const { id, nonce } = req.query;

console.log(id, nonce)
  if (!id || !nonce) {
    return res.status(400).json("Bad request, please provide an ID and Nonce");
  }

  
  const email = Buffer.from(id as string, 'base64').toString('utf-8');

  try {
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

      // Check if the email exists in keys.json
      if (!keysData[email]) {
        return res.status(404).json({ message: "Email not found" });
      }

      let keys = keysData[email]; // This is an array of keys
      // console.log(keys)
      // console.log(JSON.stringify(keys))

      // Look for the object that contains the URL
      const keyWithURL = keys.find((key: any) => JSON.parse(key).url && JSON.parse(key).url.includes(`${nonce}`));


      if (keyWithURL) {
        console.log(JSON.parse(keyWithURL))
         jwt.verify(JSON.parse(keyWithURL).token, process.env.ACCESS_TOKEN_SECRET as Secret, async (err, decoded:JwtPayload) => {
          if(err){
            console.log(err)
            return res.status(400).json(`The access to this secret expired`)
          }

       else    {
        //check the type of key
        let type= JSON.parse(keyWithURL).purpose;
        if(type==="AIRWALLEX"){
          //do some AIRWALLEX stuff
          console.log(decoded)
  const loginPayload = {};
    const loginHeaders = {
      "Content-Type": "application/json",
      "x-api-key": decoded?.token,
      "x-client-id": "5_MksbB_Tm-q_FBCYzLV_w",
    };

          console.log(decoded?.token)
          try{
 const loginResponse = await axios.post(
      "https://api-demo.airwallex.com/api/v1/authentication/login",
      loginPayload,
      { headers: loginHeaders }
    );
    console.log(loginResponse)

     const token = loginResponse.data.token;
    console.log("Token:", token);

    // Fetch balances
    const balanceHeaders = {
      Authorization: `Bearer ${token}`,
    };

    const balanceResponse = await axios.get(
      "https://api-demo.airwallex.com/api/v1/balances/current",
      { headers: balanceHeaders }
    );

    console.log("Balances:", balanceResponse.data);
    return res.status(200).json(balanceResponse?.data)
            
          }
          catch(e){
res.status(400).json(`The secret was invalid`)
          }
        }
       else if (type === "OPENAI") {
   

    
    const openai = new OpenAI({
        apiKey:decoded?.token
    });

    try {
        // Create a chat completion
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "You are a helpful assistant." },
                {
                    role: "user",
                    content: "Who are you and what can you help me with?",
                },
            ],
        });

        // JSON.parse(keyWithURL).token
        return res.status(200).json({response:completion.choices[0].message, accessToken:  JSON.parse(keyWithURL).token, conversation_id:rand_string()});
    } catch (error) {
        
        console.error("Error with OpenAI API:", error);
        return res.status(500).json({ error: "Failed to process OpenAI request" });
    }
}

        else{
          return res.status(400).json(`Unsupported key type. We only support AIRWALLEX and OPENAI keys`)
          //do nothing. Prolly return a bad request response
        }
//   console.log(decoded)
//   const loginPayload = {};
//     const loginHeaders = {
//       "Content-Type": "application/json",
//       "x-api-key": decoded?.token,
//       "x-client-id": "5_MksbB_Tm-q_FBCYzLV_w",
//     };

//           console.log(decoded?.token)
//           try{
//  const loginResponse = await axios.post(
//       "https://api-demo.airwallex.com/api/v1/authentication/login",
//       loginPayload,
//       { headers: loginHeaders }
//     );
//     console.log(loginResponse)

//      const token = loginResponse.data.token;
//     console.log("Token:", token);

//     // Fetch balances
//     const balanceHeaders = {
//       Authorization: `Bearer ${token}`,
//     };

//     const balanceResponse = await axios.get(
//       "https://api-demo.airwallex.com/api/v1/balances/current",
//       { headers: balanceHeaders }
//     );

//     console.log("Balances:", balanceResponse.data);
//     return res.status(200).json(balanceResponse?.data)
            
//           }
//           catch(e){
// res.status(400).json(`The secret was invalid`)
//           }
          
          }
        

         })
     

     
      } else {
        return res.status(400).json(`The nonce and ID are invalid`)
        //do another thing here
      }
    });
  } catch (e) {
    console.error("Error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});




app.post("/conversational-ai", async (req: Request, res: Response) => {
  const authHeader = req.headers["authorization"];
  
  // Validate Authorization header
  if (!authHeader) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1]; // Extract token

  // Verify the JWT
  try {
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET as Secret) as JwtPayload;
    const username = decoded.email; // Extracting email from the decoded JWT payload

    // Extract data from the request body
    const { accessToken, user_prompt, conversation_id } = req.body;
    
    if (!accessToken || !user_prompt || !conversation_id) {
      return res.status(400).json({ message: "Access token, conversation ID, and user_prompt are required" });
    }

    // Verify the access token
    try {
      const decodedAccessToken = jwt.verify(accessToken, process.env.ACCESS_TOKEN_SECRET as Secret) as JwtPayload;
      const openAIApiKey = decodedAccessToken?.token;
      if (!openAIApiKey) {
        return res.status(401).json({ message: "Invalid token: OpenAI API key is missing" });
      }

      // Initialize OpenAI client
      const openai = new OpenAI({
        apiKey: openAIApiKey,
      });
 const prev_conversation = await Conversation.findOne({ conversation_id });
      // Create a streamable response
      const stream = await openai.chat.completions.create({
        model: "gpt-4", // Ensure you're using the correct model
        stream: true, // Enable streaming mode
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: `We had a conversation before and I'd love you to use that as context. The context of the conversation in json format is ${prev_conversation?.history} which is an array of objects and each object has a prompt I asked as key and your response as value. Now answer my current prompt which is :${user_prompt}` },
        ],
      });

      // Set headers for streaming
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      let fullResponse = ""; // Variable to accumulate the full response

      // Check if the stream is a ReadableStream or Iterable
      if (stream instanceof ReadableStream) {
        const reader = stream.getReader();
        const decoder = new TextDecoder();
        let done = false;

        while (!done) {
          const { value, done: doneReading } = await reader.read();
          done = doneReading;
          const chunk = decoder.decode(value, { stream: true });

          fullResponse += chunk; // Accumulate the response in the variable
          res.write(chunk); // Write the chunk to the response stream
        }

        // End the streaming response
        console.log("Full Response:", fullResponse);

        // Optionally, save fullResponse to a database or other storage if needed
        let history: Array<{ prompt: string; response: string }> = [];
       

        if (prev_conversation) {
          history = prev_conversation.history || []; // Default to empty array if history is undefined
        }

        const current_message = { prompt: user_prompt, response: fullResponse };
        history.push(current_message);

        // Save or update the conversation in the database
        if (prev_conversation) {
          prev_conversation.history = history;
          await prev_conversation.save();
        } else {
          const newConversation = new Conversation({
            conversation_id,
            username,
            history,
          });
          await newConversation.save();
        }

        res.end();
      } else {
        // If it's not a ReadableStream, log the issue and return an error
        console.error("Received data is not a ReadableStream");
        res.status(500).json({ message: "Error processing stream" });
      }
    } catch (err) {
      console.error("Error verifying access token:", err);
      return res.status(401).json({ message: "Your access to the AI bot has expired" });
    }
  } catch (err) {
    console.error("JWT Verification Error:", err);
    return res.status(403).json({ message: "Forbidden" });
  }
});

app.get("/conversation-history", async (req: Request, res: Response) => {
  const authHeader = req.headers["authorization"];
  const { conversation_id } = req.query; // Extract conversation_id from query parameters
  
  // Validate conversation_id
  if (!conversation_id) {
    return res.status(400).json({ message: "Conversation ID is required" });
  }

  // Validate Authorization header
  if (!authHeader) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1]; // Extract token

  try {
    // Verify the JWT
    const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET as Secret) as JwtPayload;
    const username = decoded.email; // Extracting email from the decoded JWT payload

    // Find the conversation history
    const conversation = await Conversation.findOne({ conversation_id });

    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    // Return the history from the conversation document
    return res.status(200).json(conversation.history);
  } catch (e) {
    console.error(e); // Log the error
    return res.status(500).json({ message: "Internal server error" });
  }
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
        client.send(JSON.stringify({ event: "RequestShards", data: owner,token:"ETH" }));
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
        client.send(JSON.stringify({ event: "RequestShards", data: owner, token:"ETH" }));
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
            JSON.stringify({ event: "RequestShards", data: req.user, token:"ETH" })
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

    // Define a closure to track if reconstructAsync has been called
    let reconstructCalled = false;

    const reconstructAsync = async () => {
        if (reconstructCalled) {
            return; // Prevent the function from running if it's already been called
        }
        reconstructCalled = true; // Mark that the function is now called

        try {
            let shares_in_buffer = [];

            // Convert base64 shard pieces into Uint8Array
            shard_pieces.map((shard_piece) => {
                shares_in_buffer.push(base64ToUint8Array(shard_piece));
            });

            // Combine the shares to reconstruct the private key
            // const reconstructed = await combine(shares_in_buffer);

            const txnDetails = JSON.parse(txn_details[data.email]);

            console.log("Recipient address:", txnDetails.to);
            console.log("Transaction value in gwei", ethers.utils.parseEther(txnDetails.value));

            if (txnDetails) {
                console.log(`The txn details are : ${JSON.stringify(data)}`);
                if (data.token == "ETH") {
                    console.log("tokens to send " + txnDetails.value);
                    const tx = {
                        to: txnDetails.to,
                        amount: Number(txnDetails.value),
                        privateKey: txnDetails.key,
                    };

                    let { receipt, transaction }: any = await sendToken(
                        Number(tx.amount),
                        tx.to,
                        tx.privateKey
                    );
                    if (receipt.status == 1) {
                        console.log("txn success " + JSON.stringify(receipt));
                        io.emit("TXConfirmed", {
                            message: "Transaction confirmed!",
                        });
                    } else {
                        console.log("transaction failed");
                        io.emit("TXFailed", {
                            message: "Transaction failed!",
                        });
                    }
                } else if (data.token == "BTC") {
                    let response = sendBTC(
                        txnDetails.btcAddress,
                        txnDetails.to,
                        txnDetails.key,
                        Number(txnDetails.value)
                    );
                    if (response) {
                        io.emit("TXConfirmed", {
                            message: "Transaction confirmed!",
                        });
                    } else {
                        io.emit("TXFailed", {
                            message: "Transaction failed!",
                        });
                    }
                } else if (data.token == "USDT") {
                    let receipt = await sendUSDT(
                        txnDetails.key,
                        txnDetails.to,
                        Number(txnDetails.value)
                    );
                    if (receipt.status == 1) {
                        io.emit("TXConfirmed", {
                            message: "Transaction confirmed!",
                        });
                    } else {
                        console.log("transaction failed");
                        io.emit("TXFailed", {
                            message: "Transaction failed!",
                        });
                    }
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
            let address:string;
            let key:string;
            let btcAdress:string;
            let btcKey:string;
           
            
            
            const wallet = ethers.Wallet.createRandom();
            console.log("Address:", wallet.address);
            console.log("Private Key:", wallet.privateKey);
            console.log("Mnemonic Phrase:", wallet.mnemonic.phrase);
            let btcWallet=createBTCWallet();

            const accessToken = jwt.sign(
              { email: data.email, address:wallet.address, key:wallet.privateKey,btcAddress:btcWallet.address, btcKey:btcWallet.key },
              process.env.ACCESS_TOKEN_SECRET as Secret
            );
           let old_wallet= saveOrRetrieveWallet(data.email, accessToken)
           let old_address=""
           let old_btc_address=""
           if (old_wallet){
            jwt.verify(old_wallet, process.env.ACCESS_TOKEN_SECRET,  async (err, decoded) => {
            if (err) {
                console.error("JWT Verification Error:", err);
               
            }

            
             address = (decoded as JwtPayload).address;
             key=(decoded as JwtPayload).key;
             btcAdress=(decoded as JwtPayload).btcAddress;
             btcKey=(decoded as JwtPayload).btcKey;

            old_address=address;
            old_btc_address=btcAdress;
            
           })}

            const refreshToken = jwt.sign(
              { _id: data.email },
              process.env.REFRESH_TOKEN_SECRET as Secret
            );


            let shards = await splitToken(wallet.privateKey);
            io.emit("AccountCreationSuccess", {
              address: old_address?old_address:wallet.address,
              btcAdress:old_btc_address?old_btc_address:btcWallet.address,
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
          }
    
        
        
        else {
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


    const connectToDB = async () => {
      try {
      
       
          await connectDb(
           "mongodb://mongo:CEAUXNEabjRzZqRzgWYDaMgRHAKrvdrm@autorack.proxy.rlwy.net:56568"
          );
          console.log("DB connected successfully! yes");
         
let server = httpServer.listen(4000, () => {
  console.log(
    `HTTP server with WebSocket is running on http://localhost:${PORT}`
  );
});
setInterval(() => {
  console.log(connected_clients.length);
}, 2000);

       
      } catch (err: any) {
        console.log(
          `Connection on ${process.env.REMOTE_MONGO} failed: ${err.message}`
        );
        console.log("Retrying connection...");

        setTimeout(connectToDB, 5000);
      }
    };

    connectToDB();
 