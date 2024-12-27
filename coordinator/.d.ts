declare module "ws" {
  class _WS extends WebSocket {}
  export interface WebSocket extends _WS {
    id: string;
    ip: string;
    email?: string;
  }
}
declare module "bip32"
declare module "bip39"
declare module "bitcoinjs-lib"
declare module "tiny-secp256k1"
declare module "@oneramp"
declare module "@oneramp/sdk"

