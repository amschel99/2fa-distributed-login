
# Endpoint Documentation: Conversational AI

## Endpoint

**POST** `/conversational-ai`

## Description

This endpoint allows users to interact with an AI bot using OpenAI's GPT-4. It requires a valid access token and a user prompt, providing responses via a streaming interface.

---

## Request

### Headers

- `Content-Type`: `application/json`

### Body

```json
{
  "accessToken": "string", // Required: JWT access token for authentication
  "user_prompt": "string"  // Required: The user's input or query
}
```
## Response

### Success (Streaming Response)

- **Status**: `200 OK`
- **Headers**:
  - `Content-Type`: `text/event-stream`
  - `Cache-Control`: `no-cache`
  - `Connection`: `keep-alive`
- **Body**: A streamed response containing the AI's output in chunks.

---

### Error Responses

#### Missing Fields

- **Status**: `400 Bad Request`
- **Body**:

```json
{
  "message": "Access token and user_prompt are required"
}
```
## Token Verification Failure
Status: 401 Unauthorized
Body:

```json

{
  "message": "Your access to the AI bot has expired"
}
```
Missing OpenAI API Key
Status: 401 Unauthorized
Body:
```json
{
  "message": "Invalid token: OpenAI API key is missing"
}```
Internal Server Error
Status: 500 Internal Server Error

```json
{
  "message": "Internal server error"
}```
Stream Processing Error
Status: 500 Internal Server Error
Body:
```json
{
  "message": "Error processing stream"
}```
