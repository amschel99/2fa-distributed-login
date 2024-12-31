const mongoose = require('mongoose');

// Define the schema for the History array
const historySchema = new mongoose.Schema({
  prompt: {
    type: String,
    required: true,
  },
  response: {
    type: String,
    required: true,
  },
});

// Define the schema for the Conversation model
const conversationSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
 
  },
  history: {
    type: [historySchema], // Array of history objects
    default: [],
  },
  conversation_id:{
    type:String,
    unique:true,
    required:[true , "A conversation ID is required"]
  }
});

// Create the Conversation model
const Conversation = mongoose.model('Conversation', conversationSchema);

export default Conversation
