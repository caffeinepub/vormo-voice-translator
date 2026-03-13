export interface BackendMessage {
    roomId: string;
    deviceId: string;
    sourceLang: string;
    sourceText: string;
    translatedText: string;
    timestamp: bigint;
}

export interface backendInterface {
    postMessage(
        roomId: string,
        deviceId: string,
        sourceLang: string,
        sourceText: string,
        translatedText: string
    ): Promise<boolean>;
    getMessages(
        roomId: string,
        notFromDevice: string,
        afterTimestamp: bigint
    ): Promise<BackendMessage[]>;
}
