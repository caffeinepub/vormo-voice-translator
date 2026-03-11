import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;

export interface BackendMessage {
    id: string;
    fromUser: string;
    forUser: string;
    sourceText: string;
    translatedText: string;
    direction: string;
    timestamp: bigint;
}

export interface backendInterface {
    createRoom(): Promise<{ roomCode: string; userId: string }>;
    joinRoom(roomCode: string): Promise<{ ok: { userId: string } } | { err: string }>;
    heartbeat(roomCode: string, userId: string): Promise<boolean>;
    postMessage(roomCode: string, fromUser: string, sourceText: string, translatedText: string, direction: string): Promise<boolean>;
    getNewMessages(roomCode: string, forUser: string, afterTimestamp: bigint): Promise<BackendMessage[]>;
    getRoomStatus(roomCode: string): Promise<{ usersConnected: bigint; userAOnline: boolean; userBOnline: boolean }>;
}
