#!/bin/bash

# Set the email and password variables
EMAIL="kariukiamschel9@gmail.com"
PASSWORD="mysecurepasswordthatcannotbecracked"

# Make a POST request with curl using the email and password variables
curl -X POST http://localhost:4000/credentials/verify \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EMAIL\", \"password\": \"$PASSWORD\"}"
