/**
 * sockjs-client 은 자체 타입을 제공하지 않고 @types/sockjs-client 를 설치하지 않은 상태이므로
 * member-chat 에서 사용하는 default export 만 최소한으로 선언한다.
 */
declare module 'sockjs-client/dist/sockjs' {
  type EventListener = (event: unknown) => void;

  class SockJS {
    constructor(url: string, _reserved?: unknown, options?: Record<string, unknown>);
    readonly url: string;
    readyState: number;
    onopen: EventListener | null;
    onclose: EventListener | null;
    onmessage: EventListener | null;
    onerror: EventListener | null;
    send(data: string): void;
    close(code?: number, reason?: string): void;
    addEventListener(type: string, listener: EventListener): void;
    removeEventListener(type: string, listener: EventListener): void;
  }

  export default SockJS;
}
