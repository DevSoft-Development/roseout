declare module "next/dist/compiled/ws" {
  import type { WebSocketLikeConstructor } from "@supabase/realtime-js";
  const WebSocketTransport: WebSocketLikeConstructor;
  export default WebSocketTransport;
}
