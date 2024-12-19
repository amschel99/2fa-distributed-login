import { BIP32Factory } from 'bip32';
import * as ecc from 'tiny-secp256k1';
import * as bip39 from 'bip39';
import * as bitcoin from 'bitcoinjs-lib';

const bip32 = BIP32Factory(ecc);

const network = bitcoin.networks.bitcoin;
const path = `m/44'/0'/0'/0`;

interface Wallet {
  address: string;
  key: string;
  mnemonic: string;
}
interface BlockchairAPIResponse {
  data: {
    [address: string]: {
      address: {
        balance: number;
      };
    };
  };
}


export const createBTCWallet = (): Wallet => {
  const mnemonic: string = bip39.generateMnemonic();
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const root = bip32.fromSeed(seed, network);
  const account = root.derivePath(path);
  const node = account.derive(0).derive(0);

  const btcAddress = bitcoin.payments.p2pkh({
    pubkey: Buffer.from(node.publicKey),
    network: network,
  }).address;

  return {
    address: btcAddress,
    key: node.toWIF(),
    mnemonic: mnemonic,
  };
};

export const getBTCBalance = async (address: string): Promise<number> => {
  try {
    const response = await fetch(`https://api.blockchair.com/bitcoin/dashboards/address/${address}`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch data: ${response.statusText}`);
    }

    const data = (await response.json()) as BlockchairAPIResponse;

    const balanceSatoshis = data.data[address].address.balance; // Safely access the balance
    const balanceBTC = balanceSatoshis / 100000000; // Convert from satoshis to BTC
    return balanceBTC;
  } catch (error) {
    console.error('Error fetching BTC balance:', error);
    return 0; // Return 0 in case of an error
  }
};

