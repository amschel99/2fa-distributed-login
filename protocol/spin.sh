#!/bin/bash

# Set the email and password variables
EMAIL="kariukiahel9@gmail.com"
PASSWORD="mysecurepasswordthatcannotbecracked"

# Make a POST request with curl
curl -X POST http://localhost:4000/credentials \
     -H "Content-Type: application/json" \
     -d "{\"email\": \"$EMAIL\", \"password\": \"$PASSWORD\"}"


