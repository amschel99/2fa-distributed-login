### Architecture

This software is designed to run across multiple machines, enabling them to perform specific tasks in a distributed system. The core functionalities of the software are outlined below:

#### Core Features

1. **Store User Credentials**  
   Each machine will securely store user credentials for authentication purposes.

2. **Validate Credentials**  
   The software will validate user credentials to ensure that only authorized users can access the system.

3. **Generate Token/Private Key**  
   After validation, a unique token or private key is generated for the user to ensure secure communication within the system.

4. **Shamir Secret Sharing for Key Splitting**  
   The private key is split into 4 shards using the **Shamir Secret Sharing Algorithm**.  
   **Note**: It needs to be decided whether the key splitting process should be performed by the individual nodes or by a dedicated machine responsible for this task.

5. **Shard Storage**  
   Each machine will securely store a shard of the private key, ensuring redundancy and security.

6. **Shard Distribution**  
   The software will send a shard to another machine to ensure that all shards are distributed across the system for fault tolerance and security.

#### Considerations

- **Key Splitting Location**: The decision on whether to handle key splitting at the node level or through a dedicated machine should be made based on performance, security, and fault tolerance requirements.
- **Fault Tolerance & Redundancy**: Storing and distributing shards across multiple machines will ensure data availability even if one machine fails.

This architecture aims to provide a distributed and secure method of storing and managing user credentials, private keys, and secret shards across different machines.


##### P.S
This library is used for shamir secret sharing, https://github.com/privy-io/shamir-secret-sharing
### Running coordinator using docker
```bash
sudo docker-compose -f docker-compose.yml  build api
```

Then run,
```bash
sudo docker-compose -f docker-compose.yml  up -d

```

Interact with the container

```bash
sudo docker exec -it coordinator-api-1  bash

```
