import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './App.css';
import SignupForm from './components/Signup';
import Login from './components/Login';
import io from "socket.io-client";
import { useEffect, useState } from 'react';

export const socket = io(`http://54.206.14.84:4000/`);

function objectToHex(obj: { [x: string]: any }) {
  let hexString = "";
  for (let key in obj) {
    const value = obj[key];
    hexString += value.toString(16).padStart(2, '0'); // Convert each byte to a 2-digit hex value
  }
  return hexString;
}

async function sha256Hex(data: string | undefined) {
  if (!data) return ''; // Return empty string if no data is provided
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data); // Convert the hex string to a Uint8Array
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  
  // Convert hash buffer to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function App() {
  const [email, setEmail] = useState("");
  const [connection_status, setConnection_status] = useState("No servers connected");
  const [shards, setShards] = useState<any[]>([]);  // Typing shards as an array of any objects
  const [hashes, setHashes] = useState<string[]>([]); // State to store an array of SHA-256 hashes
  const [loginFailed, setLoginFailed] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    socket.on("connect", () => {
      console.log("Connected to server");
    });

    socket.on("disconnect", () => {
      console.log("Disconnected from server");
    });

    socket.on("newConnection", (data) => {
      setConnection_status(JSON.stringify(data));
    });
    socket.on("Success", (data) => {
      setSuccess(data.key);
    });
    socket.on("LoginFailed", (data) => {
      setLoginFailed(data.message);
    });
    socket.on("getShards", (data) => {
      setShards(JSON.parse(data?.shards));
      console.log('Shards received:', data); // Added for debugging
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
    };
  }, []);

  useEffect(() => {
    // Ensure shards data is valid
    if (shards.length > 0) {
      const hashesArray: string[] = [];

      // Loop through each shard and generate its hash
      shards.forEach((obj) => {
        const hexString = objectToHex(obj);  // Convert object to hex
        sha256Hex(hexString).then((calculatedHash) => {
          hashesArray.push(calculatedHash);  // Store the hash for each shard
          if (hashesArray.length === shards.length) {
            setHashes(hashesArray);  // Set the state with all the hashes when all are computed
          }
        });
      });
    }
  }, [shards]);  // Dependency array triggers the effect when shards change

  const handleReconstructAPIKey = async () => {
    // Send POST request to /request-shards with email
    try {
      const response = await fetch('http://54.206.14.84:4000/request-shards', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (response.ok) {
        console.log('Shards reconstructed successfully:', data);
        setSuccess('API Key reconstructed successfully');
      } else {
        setLoginFailed('Failed to reconstruct API key');
      }
    } catch (error) {
      console.error('Error during API key reconstruction:', error);
      setLoginFailed('An error occurred while reconstructing API key');
    }
  };

  return (
    <>
      <h3>{connection_status}</h3>
      <BrowserRouter>
        <Routes>
          <Route path='/' element={<SignupForm />} />
          <Route path='/login' element={<Login email={email} setEmail={setEmail} />} />
        </Routes>
      </BrowserRouter>

      {/* Render all SHA-256 hashes */}
      <div>
        {hashes.length > 0 ? (
          <div>
            <h4>API key shard hashes living in different nodes</h4>
            <ul>
              {hashes.map((hash, index) => (
                <li key={index}>{hash}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p>Waiting for shards data...</p>
        )}

        <p style={{ color: "red" }}>{loginFailed}</p>
        {hashes?.length > 1 && (
          <>
            <button onClick={handleReconstructAPIKey}>Reconstruct API key using the shards</button>
            {success && <p>{success}</p>}
          </>
        )}
      </div>
    </>
  );
}

export default App;
