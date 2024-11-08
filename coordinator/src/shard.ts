import crypto from "crypto";
import { Response, Request } from "express";
import {split, combine} from 'shamir-secret-sharing';
import axios from "axios"
import dotenv from "dotenv"
dotenv.config();



const AIRWALLEX_API_URL = "https://api-demo.airwallex.com/api/v1";


export const splitToken = async (req: Request, res: Response): Promise<void> => {
    try {
    
      const authResponse = await axios.post(`${AIRWALLEX_API_URL}/authentication/login`, {}, {
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.API_KEY,
          "x-client-id": process.env.CLIENT_ID,
        }
      });
  
      const token = authResponse.data.token as string;
      console.log("Token (string):", token);
  
      const tokenUint8Array = new Uint8Array(Buffer.from(token, 'utf-8'));
      const [share1, share2, share3] = await split(tokenUint8Array, 4, 3);
      console.log("Token (Uint8Array):", tokenUint8Array);
  
     

      res.status(200).json("Succesfully sharded the token");
  
    } catch (error) {
      console.error("Error fetching balance:", error);
      res.status(500).json({ error: "Failed to fetch balance" });
    }
  };