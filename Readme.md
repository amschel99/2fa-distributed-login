

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

---

## Notes
- Always include the `Authorization` header with the access token for protected endpoints.
- Errors are returned in JSON format with an appropriate status code and message.
```