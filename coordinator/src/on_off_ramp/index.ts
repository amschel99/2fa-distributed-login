import { OneRamp } from '@oneramp/sdk';
import { ethers } from "ethers";

const clientPub = "RMPPUBK-471e157d471f6743f960d3adb304abb3-X";
const secretKey = "RMPSEC-9faf5d4f4b622a01e5e9ce50c826230569b17f85cd089c32f56ebb8318c8a724-X";


const provider = new ethers.providers.AnkrProvider(
  "polygon",
  "ad2fbd3050cc25e97a0548126287480688815b0d2c9cd6154f0105bf91879f23"
);

;

export const quote= async (  token:string, amount:string, privateKey:string)=>{
    const wallet = new ethers.Wallet(privateKey, provider);
    const oneRamp = new OneRamp(
  "matic",
  clientPub,
  secretKey,
  provider,
  wallet
);
    try{

          const result = await oneRamp.quote(amount, token)
       
        return result
    }
    catch(e){
        console.log(`An error occurred while trying to quote`)

        return null
    }

}
export const offramp= async (privateKey:string,  token:string, amount:string, phone:string)=>{
    const wallet = new ethers.Wallet(privateKey, provider);
    const oneRamp = new OneRamp(
  "matic",
  clientPub,
  secretKey,
  provider,
  wallet
);
    try{

          const tx= await oneRamp.offramp(token , amount, phone)
       
        return tx
    }
    catch(e){
        console.log(`An error occurred while trying to offramp`)

        return null
    }

}