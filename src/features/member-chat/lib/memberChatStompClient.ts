import { Client, type IMessage, type StompSubscription } from '@stomp/stompjs';
import SockJS from 'sockjs-client/dist/sockjs';
import { env } from '@/app/config/env';
import { getAccessToken } from '@/shared/stores/authTokenStore';
import type { MemberChatReadEvent, MemberChatSendRequest } from '@/features/member-chat/model/types';

const WS_ENDPOINT_PATH = '/mc/connect';
const TOPIC_PREFIX = '/mc/topic';
const APP_PREFIX = '/mc/app';

function websocketEndpointUrl(): string {
  const base = env.VITE_API_BASE_URL.replace(/\/$/, '');
  return `${base}${WS_ENDPOINT_PATH}`;
}

function authHeaders() {
  const token = getAccessToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

function parseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

type RoomMessageCb = (payload: unknown, raw: IMessage) => void;
type ReadCb = (payload: MemberChatReadEvent) => void;

/**
 * STOMP 재연결 시 기존 StompSubscription 은 무효화된다.
 * 방·콜백을 레지스트리에 두고 매 onConnect 마다 구독을 다시 붙인다.
 */
export class MemberChatStompClient {
  private client: Client | null = null;
  private connectingPromise: Promise<void> | null = null;

  private readonly roomMessageCbs = new Map<number, Set<RoomMessageCb>>();
  private readonly roomReadCbs = new Map<number, Set<ReadCb>>();
  private readonly errorCbs = new Set<(raw: unknown) => void>();

  private stompRoomMsg = new Map<number, StompSubscription>();
  private stompRoomRead = new Map<number, StompSubscription>();
  private stompErrors: StompSubscription | null = null;

  async connect(): Promise<void> {
    if (this.client?.connected) return;
    if (this.connectingPromise) return this.connectingPromise;

    this.client = new Client({
      webSocketFactory: () => new SockJS(websocketEndpointUrl()),
      reconnectDelay: 5_000,
      connectHeaders: authHeaders(),
      debug: () => undefined,
    });

    this.connectingPromise = new Promise<void>((resolve, reject) => {
      if (!this.client) {
        reject(new Error('STOMP client init failed'));
        return;
      }
      let firstResolved = false;
      this.client.onConnect = () => {
        this.reattachAllSubscriptions();
        if (!firstResolved) {
          firstResolved = true;
          resolve();
        }
      };
      this.client.onStompError = (frame) => {
        if (!firstResolved) {
          firstResolved = true;
          reject(new Error(frame.body || 'STOMP broker error'));
        }
      };
      this.client.onWebSocketError = () => {
        if (!firstResolved) {
          firstResolved = true;
          reject(new Error('WebSocket connection error'));
        }
      };
      this.client.activate();
    }).finally(() => {
      this.connectingPromise = null;
    });

    return this.connectingPromise;
  }

  disconnect() {
    if (!this.client) return;
    this.teardownStompSubscriptions();
    this.client.deactivate();
    this.client = null;
  }

  private teardownStompSubscriptions() {
    for (const s of this.stompRoomMsg.values()) {
      try {
        s.unsubscribe();
      } catch {
        /* noop */
      }
    }
    this.stompRoomMsg.clear();
    for (const s of this.stompRoomRead.values()) {
      try {
        s.unsubscribe();
      } catch {
        /* noop */
      }
    }
    this.stompRoomRead.clear();
    try {
      this.stompErrors?.unsubscribe();
    } catch {
      /* noop */
    }
    this.stompErrors = null;
  }

  /** 연결·재연결 직후 레지스트리 기준으로 STOMP 구독을 다시 생성한다. */
  private reattachAllSubscriptions() {
    if (!this.client?.connected) return;
    this.teardownStompSubscriptions();
    if (this.errorCbs.size > 0) {
      this.attachErrors();
    }
    for (const roomId of this.roomMessageCbs.keys()) {
      if ((this.roomMessageCbs.get(roomId)?.size ?? 0) > 0) {
        this.attachRoomMessages(roomId);
      }
    }
    for (const roomId of this.roomReadCbs.keys()) {
      if ((this.roomReadCbs.get(roomId)?.size ?? 0) > 0) {
        this.attachRoomRead(roomId);
      }
    }
  }

  private attachRoomMessages(roomId: number) {
    if (!this.client?.connected || this.stompRoomMsg.has(roomId)) return;
    const cbs = this.roomMessageCbs.get(roomId);
    if (!cbs || cbs.size === 0) return;

    const sub = this.client.subscribe(`${TOPIC_PREFIX}/room/${roomId}`, (message) => {
      const payload = parseJson(message.body);
      for (const cb of cbs) {
        cb(payload, message);
      }
    });
    this.stompRoomMsg.set(roomId, sub);
  }

  private attachRoomRead(roomId: number) {
    if (!this.client?.connected || this.stompRoomRead.has(roomId)) return;
    const cbs = this.roomReadCbs.get(roomId);
    if (!cbs || cbs.size === 0) return;

    const sub = this.client.subscribe(`${TOPIC_PREFIX}/read/${roomId}`, (message) => {
      const payload = parseJson<MemberChatReadEvent>(message.body);
      if (!payload) return;
      for (const cb of cbs) {
        cb(payload);
      }
    });
    this.stompRoomRead.set(roomId, sub);
  }

  private attachErrors() {
    if (!this.client?.connected || this.stompErrors) return;
    if (this.errorCbs.size === 0) return;
    this.stompErrors = this.client.subscribe('/user/queue/errors', (message) => {
      const parsed = parseJson<unknown>(message.body);
      for (const cb of this.errorCbs) {
        cb(parsed);
      }
    });
  }

  /**
   * payload 는 파싱 실패 시 null. (본문 형식이 달라도) 콜백은 항상 호출해 히스토리 refetch 등을 걸 수 있게 한다.
   */
  subscribeRoomMessages<T>(
    roomId: number,
    onMessage: (payload: T | null, raw: IMessage) => void,
  ): () => void {
    let set = this.roomMessageCbs.get(roomId);
    if (!set) {
      set = new Set();
      this.roomMessageCbs.set(roomId, set);
    }
    const wrapped: RoomMessageCb = (payload, raw) =>
      onMessage(payload as T | null, raw);
    set.add(wrapped);

    void this.connect().then(() => {
      if (this.client?.connected && !this.stompRoomMsg.has(roomId)) {
        this.attachRoomMessages(roomId);
      }
    });

    return () => {
      set!.delete(wrapped);
      if (set!.size === 0) {
        this.roomMessageCbs.delete(roomId);
        this.stompRoomMsg.get(roomId)?.unsubscribe();
        this.stompRoomMsg.delete(roomId);
      }
    };
  }

  subscribeReadEvents(roomId: number, onRead: (payload: MemberChatReadEvent) => void): () => void {
    let set = this.roomReadCbs.get(roomId);
    if (!set) {
      set = new Set();
      this.roomReadCbs.set(roomId, set);
    }
    set.add(onRead);

    void this.connect().then(() => {
      if (this.client?.connected && !this.stompRoomRead.has(roomId)) {
        this.attachRoomRead(roomId);
      }
    });

    return () => {
      set!.delete(onRead);
      if (set!.size === 0) {
        this.roomReadCbs.delete(roomId);
        this.stompRoomRead.get(roomId)?.unsubscribe();
        this.stompRoomRead.delete(roomId);
      }
    };
  }

  subscribeErrors(onError: (raw: unknown) => void): () => void {
    this.errorCbs.add(onError);
    void this.connect().then(() => {
      if (this.client?.connected && !this.stompErrors) {
        this.attachErrors();
      }
    });
    return () => {
      this.errorCbs.delete(onError);
      if (this.errorCbs.size === 0) {
        this.stompErrors?.unsubscribe();
        this.stompErrors = null;
      }
    };
  }

  async sendMessage(roomId: number, request: MemberChatSendRequest): Promise<void> {
    await this.connect();
    if (!this.client?.connected) {
      throw new Error('채팅 서버에 연결되어 있지 않습니다. 잠시 후 다시 시도해 주세요.');
    }
    this.client.publish({
      destination: `${APP_PREFIX}/room/${roomId}/send`,
      body: JSON.stringify(request),
      headers: authHeaders(),
    });
  }

  async sendReadAck(roomId: number, payload: { messageId: number; deviceId?: string }): Promise<void> {
    await this.connect();
    if (!this.client?.connected) return;
    this.client.publish({
      destination: `${APP_PREFIX}/room/${roomId}/read`,
      // 서버 ChatStompController 는 payload.messageId 를 본다. lastMessageId 키로 보내면 messageId 필수 에러.
      body: JSON.stringify({ messageId: payload.messageId, deviceId: payload.deviceId ?? 'web' }),
      headers: authHeaders(),
    });
  }

  /** 방 진입 시: 서버가 방의 최신 메시지까지 일괄 ack. 이미 읽은 상태면 no-op. */
  async sendReadLatest(roomId: number, deviceId: string = 'web'): Promise<void> {
    await this.connect();
    if (!this.client?.connected) return;
    this.client.publish({
      destination: `${APP_PREFIX}/room/${roomId}/read-latest`,
      body: JSON.stringify({ deviceId }),
      headers: authHeaders(),
    });
  }
}

export const memberChatStompClient = new MemberChatStompClient();
