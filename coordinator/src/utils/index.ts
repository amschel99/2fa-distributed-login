import { ethers, Wallet } from 'ethers';
import { CHAINS_CONFIG, sepolia } from "./chains";

export async function sendToken(
  amount: number,
  to: string,
  privateKey: string,
) {
  const chain = CHAINS_CONFIG[sepolia.chainId];

  const provider = new ethers.providers.JsonRpcProvider(chain.rpcUrl);

 
  const wallet: Wallet = new ethers.Wallet(privateKey, provider);

  
  const baseNonce = await provider.getTransactionCount(await wallet.getAddress(), "latest");

 
  const tx = {
    to,
    nonce: baseNonce, // Use the proper nonce value here
    value: ethers.utils.parseEther(amount.toString()),
  };

  // Sign and send the transaction with the sender's wallet
  const transaction = await wallet.sendTransaction(tx);

  // Wait for the transaction to be mined
  const receipt = await transaction.wait();

  return { transaction, receipt };
}
