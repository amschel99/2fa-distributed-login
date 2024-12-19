export type Chain = {
    chainId: string;
    name: string;
    blockExplorerUrl: string;
    rpcUrl: string;
  };
  
export const sepolia: Chain = {
    chainId: '11155111',
    name: 'sepolia',
    blockExplorerUrl: 'https://sepolia.etherscan.io',
    rpcUrl: 'https://rpc.ankr.com/eth_sepolia/ad2fbd3050cc25e97a0548126287480688815b0d2c9cd6154f0105bf91879f23',
};

export const mainnet: Chain = {
    chainId: '1',
    name: 'Ethereum',
    blockExplorerUrl: 'https://etherscan.io',
    rpcUrl: 'https://mainnet.infura.io/v3/b63c0b03df1e46a08d801f0f48f09e91',
};

export const CHAINS_CONFIG = {
    [sepolia.chainId]: sepolia,
    [mainnet.chainId]: mainnet,
};