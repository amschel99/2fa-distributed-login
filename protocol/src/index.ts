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




app.post("/credentials/verify", (req: Request, res: Response) => {
  verify_credentials(req, res);
});


const wsClient = new WebSocket("ws://localhost:8000"); 


wsClient.on("open", () => {
  console.log("WebSocket client connected to the server");
let message={event:"Join"}
  wsClient.send(JSON.stringify(message));
});

wsClient.on("message", async (rawData) => {
    const { event, data } = JSON.parse(rawData.toString());
  
    switch (event) {
      case "Signup":
    
        console.log("Handling Signup event with data:", data);
      let res= await  store_credentials(data.email, data.password)
      if(res=="Credentials stored successfully"){
        wsClient.send(JSON.stringify({event:"SignUpAck"}))
        break;
      }
      else{
        break;
      }
      case "JoinNotification":
    console.log(data)
   break;

   case "SignUpAckNotification":
    console.log(data)
   break;
      
        
  
     
  
      default:
        console.warn("Unhandled event type:", event);
    }
  
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
