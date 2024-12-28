import { ethers, Wallet } from "ethers";
import { celoMainnet, CHAINS_CONFIG, sepolia } from "./chains";

export async function sendToken(
  amount: number,
  to: string,
  privateKey: string,
) {
  const chain = CHAINS_CONFIG[sepolia.chainId];

  const provider = new ethers.providers.JsonRpcProvider(chain.rpcUrl);
  const wallet: Wallet = new ethers.Wallet(privateKey, provider);

  try {
    const baseNonce = await provider.getTransactionCount(
      await wallet.getAddress(),
      "latest"
    );

    const tx = {
      to,
      nonce: baseNonce,
      value: ethers.utils.parseEther(amount.toFixed(5)),
    };

    const transaction = await wallet.sendTransaction(tx);

    // Add a timeout for the transaction wait
    const receipt = await Promise.race([
      transaction.wait(), // Wait for transaction to be mined
      timeoutPromise(30000), // 30-second timeout
    ]);

    return { transaction, receipt };
  } catch (error) {
    console.log(`TXN failed ${error}`)
    throw new Error(
      "Transaction failed. Please check the logs for more details."
    );
  }
}

// Helper function to handle timeouts
function timeoutPromise(ms: number) {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error("Transaction timed out"));
    }, ms);
  });
}
