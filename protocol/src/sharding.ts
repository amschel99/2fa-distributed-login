import crypto from "crypto";
import { Response, Request } from "express";
import {split, combine} from 'shamir-secret-sharing';

export const generate_private_key_and_shard = async (req: Request, res: Response) => {
  try {
   
    const randomKey = crypto.randomBytes(32).toString('hex');

  
    const hashedKey = crypto.createHash('sha256').update(randomKey).digest('hex');

    console.log("Generated 256-bit private key:", hashedKey);

   
    const uint8Array = Uint8Array.from(Buffer.from(hashedKey, 'hex'));

  
    console.log("Uint8Array representation:", uint8Array);
    const [share1, share2, share3] = await split(uint8Array, 4, 3);
    //send this above shards to the machines you want 


    res.status(200).json({ privateKey: hashedKey, uint8Array, share1});
  } catch (error) {
    console.error("Error generating private key and shard:", error);
    res.status(500).json({ error: "Failed to generate private key" });
  }
};
