import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import bcrypt from "bcrypt";

interface User {
    email: string;
    password: string;
}
export const store_credentials = async (email: string, password: string): Promise<string> => {
    if (!email || !password) {
      throw new Error("Bad request! Email and password not provided");
    }
  
    try {
      const filePath = path.join(__dirname, "credentials_data.json");
  
      
      let credentials: Record<string, string> = {};
  
      if (fs.existsSync(filePath)) {
        try {
          const data = await fs.promises.readFile(filePath, "utf-8");
          credentials = JSON.parse(data) || {};
        } catch (parseError) {
          console.warn("Warning: JSON file is empty or invalid. Reinitializing it.");
          credentials = {}; 
        }
      }
  
    
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);
  
      credentials[email] = hashedPassword;
 
      await fs.promises.writeFile(filePath, JSON.stringify(credentials, null, 2));
  
      return "Credentials stored successfully";
    } catch (error) {
      console.error("Error storing credentials:", error);
      throw new Error("Internal Server Error");
    }
  };


export const verify_credentials = async (req: Request, res: Response) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json("Bad request! Email and password not provided");
    }

    try {
        const filePath = path.join(__dirname, "credentials_data.json");

        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json("No credentials found");
        }

     
        const data = await fs.promises.readFile(filePath, "utf-8");
        const credentials: Record<string, string> = JSON.parse(data);

     
        const hashedPassword = credentials[email];
        if (!hashedPassword) {
            return res.status(401).json(false);
        }

        
        const isMatch = await bcrypt.compare(password, hashedPassword);

        
        if (isMatch) {
            res.status(200).json(true);
        } else {
            res.status(401).json(false);
        }
    } catch (e) {
        console.error("Error verifying credentials:", e);
        res.status(500).json("Internal Server Error");
    }
};
