
import { BrowserRouter, Routes, Route } from 'react-router-dom'

import './App.css'
import SignupForm from './components/Signup'
import Login from './components/Login'
import io from "socket.io-client"
import { useEffect } from 'react'



export const socket = io(`http://54.206.14.84:4000/client`);

function App() {


  useEffect(() => {
    socket.on("connect", () => {
      alert(`Connected`)
      console.log("Connected to server");
    });
  
    socket.on("disconnect", () => {
      console.log("Disconnected from server");
    });
    
    socket.on("getShards", (data)=>{
      alert(data)

    })
  
  
    return () => {
      socket.off("connect");
      socket.off("disconnect");
    };
  }, []);
  
  return (
    <>
    <BrowserRouter>
    
    <Routes>
      <Route path='/' element={<SignupForm/>}/>
      <Route path='/login' element={<Login/>}/>

   
    </Routes>
    </BrowserRouter>
   
    </>
  )
}

export default App
