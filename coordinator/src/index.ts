import express, { Request, Response } from "express";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import {v4 as uuidv4} from "uuid"
import http from "http";  
import WebSocket from "ws";  
import { signup } from "./signup";


dotenv.config();


const app = express();
interface Client extends WebSocket.WebSocket{
    id:string,
    ip:string
}

export const connected_clients:Array<Client>=[]


app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.post("/signup", (req:Request, res:Response)=>{
    signup(req,res);
     })

const PORT = process.env.PORT || 4000;
const httpServer = http.createServer(app);  


const wss = new WebSocket.Server({ server: httpServer });  

wss.on("connection", (ws:Client, req) => {
  console.log("New WebSocket connection");
  const Ip = Array.isArray(req.headers['x-forwarded-for'])
  ? req.headers['x-forwarded-for'][0]
  : req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const client_id= uuidv4()

ws["id"]=client_id;
ws["ip"]=Ip;
connected_clients.push(ws)

  ws.on("message", (message) => {
    console.log("Received from client:", message);

    
    ws.send(`Server received: ${message}`);
  });

  
  ws.on("close", () => {
   
   connected_clients.map((client,i)=>{
        if(client.id===client_id){
     
         connected_clients.splice(i,1)
        
         
        }
      
     });
     const remaining_clients= connected_clients.filter((client)=>client.id!==client_id);
     remaining_clients.forEach((remaining_client)=>{
        remaining_client.send(JSON.stringify({event:"Notification", data:`${client_id} , ${Ip} left the network`}))

     })

  });
});


let server= httpServer.listen(PORT, () => {
  console.log(`HTTP server with WebSocket is running on http://localhost:${PORT}`);
});

server.on('upgrade',async function upgrade(request,socket,head){

    //you can handle authentication here
       //return socket.end('HTTP/1.1 401 Unauthorized\r\n','ascii')
    
    wss.handleUpgrade(request,socket,head,function done(ws){
       wss.emit("connection",ws,request)
    
    })
    })