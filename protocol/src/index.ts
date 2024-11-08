import express from "express";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import { store_credentials, verify_credentials } from "./credentials";
import { Request, Response } from "express";
import { generate_private_key_and_shard } from "./sharding";

dotenv.config();
const app = express();


app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true }));


app.post("/credentials", (req:Request, res:Response)=>{
store_credentials(req, res);
});
app.post("/credentials/verify", (req:Request, res:Response)=>{
    verify_credentials(req, res)
});
app.get("/shard", (req:Request, res:Response)=>{
    generate_private_key_and_shard(req, res);
})


const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    console.log(`App is listening on ${PORT}`);
});
