declare module "ws" {
  class _WS extends WebSocket {}
  export interface WebSocket extends _WS {
    id: string;
    ip: string;
    email?: string;
  }
}
