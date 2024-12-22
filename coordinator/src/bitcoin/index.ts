import { BIP32Factory } from 'bip32';

import * as bip39 from 'bip39';
import * as bitcoin from 'bitcoinjs-lib';
import axios from "axios"
import * as ecc from 'tiny-secp256k1';
import { ECPairFactory } from 'ecpair';
import bitcore from "bitcore-lib"


const ECPair = ECPairFactory(ecc);

interface UTXO {
  txid: string;
  vout: number;
  value: number;
  scriptpubkey: string;
}

const bip32 = BIP32Factory(ecc);

const network = bitcoin.networks.bitcoin;
//path for testnet
const path = `m/44'/1'/0'/0`;
//btc address 1ABA3Y8XQDDP4LSkV4qmjoxAZM3VCpgc79

// import * as bitcoin from 'bitcoinjs-lib';
// import * as bip39 from 'bip39';
// import { bip32 } from 'bip32';

interface Wallet {
  address: string;
  key: string;
  mnemonic: string;
}

export const createBTCWallet = (): Wallet => {
  // Generate a mnemonic (12 words for recovery)
  const mnemonic: string = bip39.generateMnemonic();

  // Convert the mnemonic to a seed
  const seed = bip39.mnemonicToSeedSync(mnemonic);

  // Set network to testnet
  const network = bitcoin.networks.testnet;

  // Define BIP32 derivation path (m/44'/1'/0'/0 for testnet)
  const path = `m/44'/1'/0'/0`;

  // Create a root node from the seed and derive the account
  const root = bip32.fromSeed(seed, network);

  // Derive the first address (0'/0)
  const account = root.derivePath(path);
  const node = account.derive(0).derive(0);  // 0 is the first address

  // Generate the P2PKH address (starts with 'm' for testnet)
  const btcAddress = bitcoin.payments.p2pkh({
    pubkey: Buffer.from(node.publicKey),
    network: network,
  }).address;

  return {
    address: btcAddress,
    key: node.toWIF(),  // Private key in Wallet Import Format (WIF)
    mnemonic: mnemonic,
  };
};



// interface BalanceHistoryItem {
//   time: number;
//   txs: number;
//   received: string;
//   sent: string;
//   sentToSelf: string;
//   rates?: Record<string, number>;
// }


// export async function getBitcoinBalance(address: string, apiKey: string): Promise<number> {
//   const baseUrl = "https://rpc.ankr.com/http/btc_blockbook/api/v2/balancehistory/";
//   const url = `${baseUrl}${address}`;

//   try {
//     const response = await fetch(url, {
//       method: "GET",
//       headers: {
//         Authorization: `Bearer ${apiKey}`,
//       },
//     });

//     if (!response.ok) {
//       throw new Error(`Failed to fetch balance history: ${response.statusText}`);
//     }

//     // Explicitly parse and cast the JSON response to the expected type
//     const data:any = await response.json();
// console.log(data)
//     // Calculate the current balance
//     const currentBalance = data.reduce((balance, item) => {
//       return balance + parseInt(item.received, 10) - parseInt(item.sent, 10);
//     }, 0);

//     return currentBalance;
//   } catch (error) {
//     console.error("Error fetching balance history:", error);
//     throw error;
//   }
// }


const getSoChainApi = (address: string, network: 'BTC' | 'BTCTEST') =>
  `https://sochain.com/api/v2/get_address_balance/${network}/${address}`;

export async function getBitcoinBalance({ address, inSatoshi = true, network = 'BTCTEST' }: { address: string; inSatoshi?: boolean; network?: 'BTC' | 'BTCTEST' }): Promise<number> {
  try {
    const res = await axios.get(getSoChainApi(address, network));

    if (inSatoshi) {
      return Number(res.data.data.confirmed_balance) * 100000000; // Convert BTC to Satoshis
    }

    return Number(res.data.data.confirmed_balance); // Balance in BTC
  } catch (error) {
    console.error("Error fetching Bitcoin balance from SoChain:", error);
    throw new Error("Failed to fetch Bitcoin balance");
  }
}

export const sendBTC = async (fromAddress: string, toAddress: string, privateKey: string, amount: number) => {
  try {
    const network = "BTCTEST";
    
    // Fetch UTXOs
    const fetchUTXOs = async () => {
      const response = await axios.get(`https://sochain.com/api/v2/get_tx_unspent/${network}/${fromAddress}`);
      return response.data.data.txs;
    };

    // Create transaction
    const createTransaction = (utxos: any[], amount: number, inputs: any[], fromAddress: string, toAddress: string) => {
      let totalAmountAvailable = 0;
      let inputCount = 0;

      utxos.forEach((element: any) => {
        const utxo: any = {
          satoshis: Math.floor(Number(element.value) * 100000000),
          script: element.script_hex,
          address: fromAddress,
          txid: element.txid,
          outputIndex: element.output_no
        };
        totalAmountAvailable += utxo.satoshis;
        inputCount += 1;
        inputs.push(utxo);
      });

      const satoshiToSend = amount * 100000000;
      const outputCount = 2;
      const transactionSize = inputCount * 180 + outputCount * 34 + 10 - inputCount;
      const fee = Math.round(transactionSize * 33);

      if (totalAmountAvailable - satoshiToSend - fee < 0) {
        throw new Error("Insufficient funds");
      }

      const transaction = new bitcore.Transaction();
      transaction.from(inputs)
        .to(toAddress, satoshiToSend)
        .change(fromAddress)
        .fee(fee)
        .sign(privateKey);

      return transaction;
    };

    // Broadcast transaction
    const broadcastTransaction = async (transaction: any) => {
      const serializedTransaction = transaction.serialize();
      const result = await axios.post(`https://sochain.com/api/v2/send_tx/${network}`, {
        tx_hex: serializedTransaction
      });
      return result.data.data; // return the result (e.g., transaction hash)
    };

    // Main flow
    const utxos = await fetchUTXOs();
    const inputs: any[] = [];
    const transaction = createTransaction(utxos, amount, inputs, fromAddress, toAddress);
    const result = await broadcastTransaction(transaction);
    
    return result; // Return the transaction result (e.g., transaction hash)

  } catch (error) {
    console.error('Transaction failed:', error.message);
    throw error; // Rethrow the error if you want the calling function to handle it
  }
};
