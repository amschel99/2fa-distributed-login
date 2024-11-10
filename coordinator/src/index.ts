import express, { Request, Response } from "express";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import {v4 as uuidv4} from "uuid"
import http from "http";  
import * as WebSocket from "ws"


import { login, signup } from "./signup";
import { splitToken } from "./shard";


dotenv.config();


const app = express();
// interface Client extends WebSocket{
//     id:string,
//     ip:string,
//     email?:string
// }


export const connected_clients:Array<any>=[]
let credentials_consensus: { [key: string]: Array<boolean> } = {};
const addConsensus = (key: string, value: boolean) => {

    if (credentials_consensus[key]) {
        credentials_consensus[key].push(value);
    } else {
  
        credentials_consensus[key] = [value];
    }
};



app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.get("/", (req:Request, res:Response)=>{
  res.status(200).json(`Working`)
})
app.post("/signup", (req:Request, res:Response)=>{
    signup(req,res);
     })
     app.post("/login", (req:Request, res:Response)=>{
        login(req,res);
         })

const PORT = process.env.PORT || 4000;
const httpServer = http.createServer(app);  


const wss = new WebSocket.Server({ noServer:true});  

wss?.on("connection", (client:WebSocket.WebSocket, req) => {
  console.log("New WebSocket connection");
  const Ip = Array.isArray(req.headers['x-forwarded-for'])
  ? req.headers['x-forwarded-for'][0]
  : req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const client_id= uuidv4()
const ws= client;
ws["id"]=client_id;
ws["ip"]=Ip;
connected_clients.push(ws)

ws?.on("message", async (message) => {
    console.log("Received from client:", message);
  
    // Parse the incoming message
    const parsedMessage = JSON.parse(message.toString());
    const { event, data } = parsedMessage;
  
    switch (event) {
      case "Join":
        // Handle the "Join" event
        const remainingClients = connected_clients.filter((client) => client.id !== client_id);
        remainingClients.forEach((remainingClient) => {
          remainingClient?.send(
            JSON.stringify({ event: "JoinNotification", data: `${client_id}, ${Ip} Joined the network` })
          );
        });
        break;
        case "SavedShardAck":
          connected_clients.forEach((notifyClient) => {
            notifyClient?.send(
              JSON.stringify({ event: "SavedShardAckNotification", data: `${client_id}, ${Ip} Succesfully stored the shard` })
            );
          });
  
          break;
      // Add more cases for other event types as needed
      case "SignUpAck":
        
     connected_clients.forEach((notifyClient) => {
          notifyClient?.send(
            JSON.stringify({ event: "SignUpAckNotification", data: `${client_id}, ${Ip} Succesfully registered the user` })
          );
        });
        break;
        case "LoginAck":
         
            addConsensus(data.email, data.login_response);
           
            setTimeout(async ()=>{
              // && credentials_consensus[`${data.email}`][1]==true&& credentials_consensus[`${data.email}`][2]==true 
        
                if(credentials_consensus[`${data.email}`]?.[0]==true   && credentials_consensus[`${data.email}`]?.[1]==true&& credentials_consensus[`${data.email}`]?.[2]==true ){

connected_clients.forEach((notifyClient) => {
    notifyClient?.send(
      JSON.stringify({ event: "LoginAckNotification", data: `All servers agree on the credentials` })
    );
  });

let shards= await splitToken()

     
connected_clients.forEach((notifyClient,i) => {
  console.log(shards[i])
    notifyClient?.send(
      JSON.stringify({ event: "Shard", data:JSON.stringify( {id:data.email, shard:shards[i]})})
    );
  });
delete credentials_consensus[data.email];



      }
      else{
        console.log("bro its crazy", JSON.stringify(credentials_consensus))
        //do nothing literary
      }

            },3000)
        
        break;
      
      default:
        console.warn(`Unknown event type: ${event}`);
        break;
    }
  });
  
  
  ws?.on("close", () => {
   
   connected_clients.map((client,i)=>{
        if(client.id===client_id){
     
         connected_clients.splice(i,1)
        
         
        }
      
     });
     const remaining_clients= connected_clients.filter((client)=>client.id!==client_id);
     remaining_clients.forEach((remaining_client)=>{
        remaining_client?.send(JSON.stringify({event:"Notification", data:`${client_id} , ${Ip} left the network`}))

     })

  });
});


let server= httpServer.listen(4000, () => {
  console.log(`HTTP server with WebSocket is running on http://localhost:${PORT}`);
});
setInterval(()=>{
  console.log(connected_clients.length)
},2000)
server?.on('upgrade',async function upgrade(request,socket,head){

    //you can handle authentication here
       //return socket.end('HTTP/1.1 401 Unauthorized\r\n','ascii')
    
    wss.handleUpgrade(request,socket,head,function done(ws){
       wss.emit("connection",ws,request)
    
    })
    })