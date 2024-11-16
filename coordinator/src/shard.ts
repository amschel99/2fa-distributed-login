import crypto from "crypto";
import { Response, Request } from "express";
import { split, combine } from "shamir-secret-sharing";
import axios from "axios";
import dotenv from "dotenv";
import { connected_clients } from ".";
export let accessToken = "";
dotenv.config();

export const splitToken = async (): Promise<Uint8Array[]> => {
  try {
    const authResponse = await axios.post(
      `${process.env.AIRWALLEX_API_URL}/authentication/login`,
      {},
      {
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.API_KEY,
          "x-client-id": process.env.CLIENT_ID,
        },
      }
    );

    const token = authResponse.data.token as string;
    accessToken = token;

    const tokenUint8Array = new Uint8Array(Buffer.from(token, "base64"));

    const [share1, share2, share3] = await split(tokenUint8Array, 3, 2);

    return [share1, share2, share3];
  } catch (error) {
    console.error("Error splitting token:", error);
    throw new Error("Failed to split token");
  }
};

export const recreateKey = async (req: Request, res: Response) => {
  if (!req.body.email) {
    return res.status(400).json(`email to collect shards for must be provided`);
  }
  try {
    connected_clients.map((client) => {
      client.send(
        JSON.stringify({ event: "RequestShards", data: req.body.email })
      );
    });

    return res.status(200).json(`Request for shards was sent succesfully`);
  } catch (e: any) {
    res.status(500).json(e?.message);
  }
};
