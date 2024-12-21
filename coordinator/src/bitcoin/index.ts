import { BIP32Factory } from 'bip32';

import * as bip39 from 'bip39';
import * as bitcoin from 'bitcoinjs-lib';
import axios from "axios"
import * as ecc from 'tiny-secp256k1';
import { ECPairFactory } from 'ecpair';

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



interface BalanceHistoryItem {
  time: number;
  txs: number;
  received: string;
  sent: string;
  sentToSelf: string;
  rates?: Record<string, number>;
}


export async function getBitcoinBalance(address: string, apiKey: string): Promise<number> {
  const baseUrl = "https://rpc.ankr.com/http/btc_blockbook/api/v2/balancehistory/";
  const url = `${baseUrl}${address}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch balance history: ${response.statusText}`);
    }

    // Explicitly parse and cast the JSON response to the expected type
    const data:any = await response.json();
console.log(data)
    // Calculate the current balance
    const currentBalance = data.reduce((balance, item) => {
      return balance + parseInt(item.received, 10) - parseInt(item.sent, 10);
    }, 0);

    return currentBalance;
  } catch (error) {
    console.error("Error fetching balance history:", error);
    throw error;
  }
}
/**
 * Sends Bitcoin from one address to another.
 * @param privateKeyWIF - Private key in Wallet Import Format (WIF)
 * @param destinationAddress - Address to send Bitcoin to
 * @param amount - Amount to send in satoshis
 * @param network - Bitcoin network (mainnet or testnet)
 * @returns Transaction ID of the broadcasted transaction
 */
export const sendBTC = async (
  privateKeyWIF: string,
  destinationAddress: string,
  amount: number,
  network: bitcoin.Network
): Promise<string> => {
  try {
    // Decode private key
    const keyPair = ECPair.fromWIF(privateKeyWIF, network);

    // Generate sender address
    const senderAddress = bitcoin.payments.p2pkh({
      pubkey:Buffer.from( keyPair.publicKey),
      network,
    }).address;

    if (!senderAddress) {
      throw new Error('Failed to derive sender address');
    }

    // Fetch UTXOs for the sender's address
    const utxoResponse = await axios.get<UTXO[]>(
      `https://blockstream.info/${
        network === bitcoin.networks.testnet ? 'testnet/' : ''
      }api/address/${senderAddress}/utxo`
    );

    const utxos = utxoResponse.data;

    if (utxos.length === 0) {
      throw new Error('No UTXOs available to send funds');
    }

    // Create a new transaction
    const psbt = new bitcoin.Psbt({ network });
    let inputAmount = 0;

    // Add UTXOs as inputs
    utxos.forEach((utxo) => {
      psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        nonWitnessUtxo: Buffer.from(utxo.scriptpubkey, 'hex'),
      });
      inputAmount += utxo.value;
    });

    // Add the output (recipient)
    psbt.addOutput({
      address: destinationAddress,
      value: amount,
    });

    // Calculate change and add change output if applicable
    const fee = 10000; // Example fee in satoshis
    const change = inputAmount - amount - fee;

    if (change > 0) {
      psbt.addOutput({
        address: senderAddress,
        value: change,
      });
    }

   utxos.forEach((_, index) => {
  psbt.signInput(index, {
    publicKey: Buffer.from(keyPair.publicKey), // Convert Uint8Array to Buffer
    sign: (hash: Buffer) => Buffer.from(keyPair.sign(hash)), // Convert Uint8Array to Buffer
  });
});


    // Finalize and extract the transaction
    psbt.finalizeAllInputs();
    const rawTx = psbt.extractTransaction().toHex();

    // Broadcast the transaction
    const broadcastResponse = await axios.post<string>(
      `https://blockstream.info/${
        network === bitcoin.networks.testnet ? 'testnet/' : ''
      }api/tx`,
      rawTx
    );

    return broadcastResponse.data; // Transaction ID
  } catch (error) {
    console.error('Error sending BTC:', error);
    throw error;
  }
};