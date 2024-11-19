import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./App.css";
import SignupForm from "./components/Signup";
import Login from "./components/Login";
import io from "socket.io-client";
import { useEffect, useState } from "react";

export const socket = io(`http://54.206.14.84:4000/`);

function objectToHex(obj: { [x: string]: any }) {
  let hexString = "";
  for (let key in obj) {
    const value = obj[key];
    hexString += value.toString(16).padStart(2, "0");
  }
  return hexString;
}

async function sha256Hex(data: string | undefined) {
  if (!data) return "";
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
interface LoginResponse {
  [key: string]: boolean[]; // Assuming the response is an object with email keys and boolean arrays
}

function App() {
  const [email, setEmail] = useState("");
  const [connectionStatus, setConnectionStatus] = useState([]);
  const [shards, setShards] = useState<any[]>([]);
  const [hashes, setHashes] = useState<string[]>([]);
  const [success, setSuccess] = useState("");
  const [turnedOffNodes, setTurnedOffNodes] = useState<Set<string>>(new Set());
  const [loginResponse, setLoginResponse] = useState<LoginResponse | null>(
    null
  );

  function generateRandom256BitHash() {
    // Create an array of 32 random bytes (32 bytes = 256 bits)
    const randomBytes = Array.from({ length: 32 }, () =>
      Math.floor(Math.random() * 256)
    );

    // Convert each byte to a hexadecimal string and join them
    const hash = randomBytes
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

    return hash;
  }
  useEffect(() => {
    socket.on("connect", () => console.log("Connected to server"));
    socket.on("disconnect", () => console.log("Disconnected from server"));
    socket.on("newConnection", (data) => setConnectionStatus(data.message));
    socket.on("Success", async (data) => {
      setSuccess(JSON.stringify(data.key)); // Access response data
    });
    socket.on("getShards", (data) => setShards(JSON.parse(data?.shards)));
    socket.on("LoginResponse", (data) => {
      setLoginResponse(data);
    });
    return () => {
      socket.off("connect");
      socket.off("disconnect");
    };
  }, []);

  useEffect(() => {
    if (shards.length > 0) {
      const hashesArray: string[] = [];
      shards.forEach((obj) => {
        const hexString = objectToHex(obj);
        sha256Hex(hexString).then((calculatedHash) => {
          hashesArray.push(calculatedHash);
          if (hashesArray.length === shards.length) {
            setHashes(hashesArray);
          }
        });
      });
    }
  }, [shards]);

  const handleReconstructAPIKey = async () => {
    try {
      const response = await fetch("http://54.206.14.84:4000/request-shards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (response.ok) {
        setSuccess("API Key reconstructed successfully");
      }
    } catch (error) {
      console.error("Error during API key reconstruction:", error);
    }
  };

  const handleTurnOffNode = (address: string, id: string) => {
    socket.emit("removeNode", { node: id });
    setTurnedOffNodes((prev) => new Set(prev).add(address));
  };

  return (
    <>
      <h3>Network Nodes</h3>
      <div className="node-container">
        {connectionStatus.map((client: any, index) => {
          const address = client?._sender._socket._peername.address;
          if (turnedOffNodes.has(address)) return null; // Skip rendering if node is turned off

          return (
            <div key={index} className="node-card">
              <p>Address: {address}</p>
              <button onClick={() => handleTurnOffNode(address, client?.id)}>
                Turn Off
              </button>
            </div>
          );
        })}
      </div>

      <BrowserRouter>
        <Routes>
          <Route path="/signup" element={<SignupForm />} />
          <Route
            path="/"
            element={<Login email={email} setEmail={setEmail} />}
          />
        </Routes>
      </BrowserRouter>

      <div>
        <>
          {loginResponse?.[email]?.map((res, i) => (
            <div key={i}>
              Node {i + 1}: {res.toString()}
            </div>
          ))}
        </>

        {hashes.length > 1 && (
          <>
            <button onClick={handleReconstructAPIKey}>Make API request</button>
            {success && (
              <ul>
                <li>Node 1 response: ${generateRandom256BitHash()}</li>
                <li>Node 2 response: ${generateRandom256BitHash()}</li>
                <li>Node 3 response: ${generateRandom256BitHash()}</li>
                <li></li>
                <li></li>
              </ul>
            )}
            {success && <p>{success}</p>}
          </>
        )}
      </div>
    </>
  );
}

export default App;
