import express, { Request, Response } from "express";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import { store_credentials, verify_credentials } from "./credentials";
import WebSocket from "ws"; 
import http from "http";  

dotenv.config();

const app = express();


app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));


app.post("/credentials", (req: Request, res: Response) => {
  store_credentials(req, res);
});

app.post("/credentials/verify", (req: Request, res: Response) => {
  verify_credentials(req, res);
});


const wsClient = new WebSocket("ws://external-websocket-server-address"); 


wsClient.on("open", () => {
  console.log("WebSocket client connected to the server");

  wsClient.send("Hello from the client!");
});

wsClient.on("message", (data) => {
  console.log("Received message from WebSocket server:", data);
});

wsClient.on("close", () => {
  console.log("WebSocket client connection closed");
});

wsClient.on("error", (error) => {
  console.error("WebSocket client error:", error);
});

const PORT = process.env.PORT || 4000;
const httpServer = http.createServer(app);

httpServer.listen(PORT, () => {
  console.log(`HTTP server running on http://localhost:${PORT}`);
});
