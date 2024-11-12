import { Request, Response } from "express";
import WebSocket from "ws";
import { connected_clients } from ".";

export const signup = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  try {
    connected_clients.map((client) => {
      client.send(
        JSON.stringify({ event: "Signup", data: { email, password } })
      );
    });

    return res.status(200).json(`Signup request broadcasted succesfully`);
  } catch (error) {
    console.error("Error during signup:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  try {
    connected_clients.map((client) => {
      client.send(
        JSON.stringify({ event: "Login", data: { email, password } })
      );
    });

    return res.status(200).json(`Login request broadcasted succesfully`);
  } catch (error) {
    console.error("Error during login:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};
