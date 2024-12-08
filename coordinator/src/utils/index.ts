import { Wallet, ethers } from "ethers";
import { CHAINS_CONFIG, sepolia } from "./chains"; // Update this to your actual imports

export async function sendToken(
  amount: number, // Amount in ETH
  to: string, // Receiver's address
  privateKey: string, // Sender's private key
) {
  const chain = CHAINS_CONFIG[sepolia.chainId];

  // Create a provider using the Infura RPC URL for Sepolia
  const provider = new ethers.providers.JsonRpcProvider(chain.rpcUrl);

  // Create a wallet instance from the sender's private key
  const wallet: Wallet = new ethers.Wallet(privateKey, provider);

  // Fetch the current gas price from the network
  const gasPrice = await provider.getGasPrice();

  // Estimate the gas limit for the transaction
  const gasLimit = await provider.estimateGas({
    to,
    value: ethers.utils.parseEther(amount.toString()),
  });

  // Calculate the total gas fees
  const gasFee = gasPrice.mul(gasLimit); // gasFee in Wei

  // Ensure the wallet has enough balance to cover the amount + gas fees
  const balance = await wallet.getBalance();
  const totalCost = ethers.utils.parseEther(amount.toString()).add(gasFee);

  if (balance.lt(totalCost)) {
    throw new Error(
      `Insufficient funds: You need at least ${ethers.utils.formatEther(
        totalCost,
      )} ETH to cover the transaction and gas fees. Current balance is ${ethers.utils.formatEther(
        balance,
      )} ETH.`,
    );
  }

  // Construct the transaction object
  const tx = {
    to,
    value: ethers.utils.parseEther(amount.toString()),
    gasLimit, // Optional but good to include
    gasPrice, // Optional but good to include
  };

  // Sign and send the transaction
  const transaction = await wallet.sendTransaction(tx);

  // Wait for the transaction to be mined
  const receipt = await transaction.wait();

  return { transaction, receipt };
}
