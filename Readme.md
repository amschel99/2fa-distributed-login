

# Wallet Server API Documentation

## Base URL
All endpoints are relative to the base URL: `http://yourserver.com/api`

---

## Endpoints

### 1. **Signup**

#### Method: `POST`
#### Endpoint: `/signup`

#### Description:
Creates a new user account.

#### Request:
- **Body:**
  ```json
  {
    "email": "user@example.com",
    "password": "securepassword"
  }
  ```

#### Response:
- **200 OK:** User created successfully.
- **500 Internal Server Error:** An error occurred on the server.

---

### 2. **Create EVM Wallet**

#### Method: `POST`
#### Endpoint: `/create-evm`

#### Description:
Creates an Ethereum wallet for the user.

#### Request:
- **Body:**
  ```json
  {
    "email": "user@example.com",
    "password": "securepassword"
  }
  ```

#### Response:
- **200 OK:** Wallet created successfully. The frontend should listen for the `AccountCreationSuccess` event with the payload:
  ```json
  {
    "address": "0xYourWalletAddress",
    "accessToken": "YourAccessToken"
  }
  ```
- **400 Bad Request:** Invalid request data.
- **500 Internal Server Error:** An error occurred on the server.

---

### 3. **Balance**

#### Method: `GET`
#### Endpoint: `/balance`

#### Description:
Retrieves the balance of the user's Ethereum wallet.

#### Request:
- **Headers:**
  ```
  Authorization: Bearer <accessToken>
  ```

#### Response:
- **200 OK:** Balance retrieved successfully.
  ```json
  {
    "message": "Balance retrieved successfully",
    "balance": "0.123456789" // Balance in ETH
  }
  ```
- **401 Unauthorized:** Invalid or missing access token.
- **500 Internal Server Error:** An error occurred on the server.

---

### 4. **Spend**

#### Method: `POST`
#### Endpoint: `/spend`

#### Description:
Sends ETH to a specified address.

#### Request:
- **Headers:**
  ```
  Authorization: Bearer <accessToken>
  ```
- **Body:**
  ```json
  {
    "to": "0xReceiverAddress",
    "value": "0.01" // Amount in ETH as string
  }
  ```

#### Response:
- **200 OK:** Transaction sent successfully. The frontend should listen for the following events:
  - **TXSent:**  
    ```json
    {
      "message": "Transaction details as JSON"
    }
    ```
  - **TXConfirmed:**  
    ```json
    {
      "message": "Transaction receipt as JSON"
    }
    ```
- **401 Unauthorized:** Invalid or missing access token.

---

### 5. **Authorize Spend**

#### Method: `POST`
#### Endpoint: `/authorize-spend`

#### Description:
Authorizes another user to spend on the wallet.

#### Request:
- **Headers:**
  ```
  Authorization: Bearer <accessToken>
  ```
- **Body:**
  ```json
  {
    "time": "4s", // Duration for the authorization
    "receiver": "receiver@example.com" // Receiver's email
  }
  ```

#### Response:
- **200 OK:** Authorization successful.
  ```json
  {
    "message": "Authorization successful",
    "token": "NewAuthorizationToken"
  }
  ```
- **400 Bad Request:** Invalid request data.
- **401 Unauthorized:** Invalid or missing access token.
- **403 Forbidden:** Action not allowed.
- **500 Internal Server Error:** An error occurred on the server.

---

### 6. **Foreign Spend**

#### Method: `POST`
#### Endpoint: `/foreign-spend`

#### Description:
Executes a transaction using a spend token.

#### Request:
- **Headers:**
  ```
  Authorization: Bearer <accessToken>
  ```
- **Body:**
  ```json
  {
    "spendToken": "YourSpendToken"
  }
  ```

#### Response:
- **200 OK:** Transaction sent successfully. The frontend should listen for the following events:
  - **TXSent:**  
    ```json
    {
      "message": "Transaction details as JSON"
    }
    ```
  - **TXConfirmed:**  
    ```json
    {
      "message": "Transaction receipt as JSON"
    }
    ```
- **400 Bad Request:** Invalid request data.
- **401 Unauthorized:** Invalid or missing access token.
- **403 Forbidden:** Action not allowed.
- **500 Internal Server Error:** An error occurred on the server.

---

## Socket.IO Events

### `AccountCreationSuccess`
Payload:
```json
{
  "address": "0xYourWalletAddress",
  "accessToken": "YourAccessToken"
}
```

### `TXSent`
Payload:
```json
{
  "message": "Transaction details as JSON"
}
```

### `TXConfirmed`
Payload:
```json
{
  "message": "Transaction receipt as JSON"
}
```

### `AccountCreationFailed`

Occurs when evm account creation failed 

---

## Keys importation

- Always include the `Authorization` header with the access token for protected endpoints.
- Errors are returned in JSON format with an appropriate status code and message.
```

# Key Management API Documentation

This API allows users to manage keys associated with their accounts, share keys with others, and fetch key data.

## API Endpoints

### 1. Import Key
- **Endpoint**: `/import-key`
- **Method**: `POST`
- **Description**: Imports a key and associates it with the authenticated user's email.

#### Request Headers
- `Authorization`: `Bearer <JWT_TOKEN>`

#### Request Body
```json
{
  "key": "{\"name\":\"key name\", \"type\":\"own/foreign\", \"value\":\"key value\", \"owner\":\"owner's telegram id\"}"
}


2. Fetch Keys
Endpoint: /fetch-keys
Method: GET
Description: Fetches all keys associated with the authenticated user's email.
Request Headers
Authorization: Bearer <JWT_TOKEN>
Response Examples
Success:
json
Copy code
{
  "email": "user@example.com",
  "keys": [
    "{\"name\":\"key1\", \"type\":\"own\", \"value\":\"value1\", \"owner\":\"owner1\"}",
    "{\"name\":\"key2\", \"type\":\"foreign\", \"value\":\"value2\", \"owner\":\"owner2\"}"
  ]
}
Unauthorized:
json
Copy code
{
  "message": "Unauthorized"
}
3. Share Key
Endpoint: /share-key
Method: POST
Description: Shares a key with another email by adding it to their associated keys.
Request Headers
Authorization: Bearer <JWT_TOKEN>
Request Body
json
Copy code
{
  "email": "target@example.com",
  "key": "{\"name\":\"key name\", \"type\":\"own/foreign\", \"value\":\"key value\", \"owner\":\"owner's telegram id\"}"
}
Response Examples
Success:
json
Copy code
{
  "message": "Key shared successfully"
}
Unauthorized:
json
Copy code
{
  "message": "Unauthorized"
}
Invalid Input:
json
Copy code
{
  "message": "Email and key are required"
}
Key Format
Keys should always be sent as a JSON string with the following structure:

json
Copy code
{
  "name": "name of the key",
  "type": "own/foreign",
  "value": "value of the key",
  "owner": "telegram ID of the owner"
}
Example:

json
Copy code
"{\"name\":\"API Key\", \"type\":\"own\", \"value\":\"abc123\", \"owner\":\"@ownerTelegram\"}"



# `/quote` Endpoint Documentation

## Endpoint
`POST /quote`

## Description
This endpoint generates a quote based on the provided token symbol and amount. It requires an Authorization header with a valid JWT token.

## Request

### Headers
| Key             | Value                           |
|------------------|---------------------------------|
| `Authorization` | `Bearer <JWT_TOKEN>`           |

### Body
The request body should be sent in JSON format with the following fields:

| Field        | Type     | Description                           |
|--------------|----------|---------------------------------------|
| `tokenSymbol`| `string` | Symbol of the token (e.g., `usdt`)    |
| `amount`     | `number` | The amount of the token for the quote |

#### Example Request Body
```json
{
  "tokenSymbol": "usdt",
  "amount": 10
}

# `/off-ramp` Endpoint Documentation

## Endpoint
`POST /off-ramp`

## Description
This endpoint facilitates the off-ramping process by exchanging tokens for fiat or other assets. It requires an Authorization header with a valid JWT token.

## Request

### Headers
| Key             | Value                           |
|------------------|---------------------------------|
| `Authorization` | `Bearer <JWT_TOKEN>`           |

### Body
The request body should be sent in JSON format with the following fields:

| Field         | Type     | Description                                        |
|---------------|----------|----------------------------------------------------|
| `tokenSymbol` | `string` | Symbol of the token to off-ramp (e.g., `BTC`)     |
| `amount`      | `number` | The amount of the token to off-ramp               |
| `phone`       | `string` | Phone number to associate with the off-ramp process |

#### Example Request Body
```json
{
  "tokenSymbol": "BTC",
  "amount": 2.5,
  "phone": "+1234567890"
}
