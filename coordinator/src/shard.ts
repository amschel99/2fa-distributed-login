import crypto from "crypto";
import { Response, Request } from "express";
import { split, combine } from "shamir-secret-sharing";
import axios from "axios";
import dotenv from "dotenv";
import { connected_clients } from ".";
export let accessToken = "";
dotenv.config();

export const splitToken = async (token: string): Promise<Uint8Array[]> => {
  try {
    accessToken = token;

    const tokenUint8Array = new Uint8Array(Buffer.from(token, "hex"));

    const [share1, share2, share3] = await split(tokenUint8Array, 3, 2);

    return [share1, share2, share3];
  } catch (error) {
    console.error("Error splitting token:", error);
    throw new Error("Failed to split token");
  }
};
