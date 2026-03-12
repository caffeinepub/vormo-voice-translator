import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Toaster } from "@/components/ui/sonner";
import { useActor } from "@/hooks/useActor";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Loader2,
  LogOut,
  Mic,
  MicOff,
  Users,
  Volume2,
  WifiOff,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

// ─── Types ──────────────────────────────────────────────────────────────────

interface BackendMessage {
  id: string;
  fromUser: string;
  forUser: string;
  sourceText: string;
  translatedText: string;
  direction: string;
  timestamp: bigint;
}

interface VormoActor {
  createRoom(): Promise<{ roomCode: string; userId: string }>;
  joinRoom(
    roomCode: string,
  ): Promise<{ ok: { userId: string } } | { err: string }>;
  heartbeat(roomCode: string, userId: string): Promise<boolean>;
  postMessage(
    roomCode: string,
    fromUser: string,
    sourceText: string,
    translatedText: string,
    direction: string,
  ): Promise<boolean>;
  getNewMessages(
    roomCode: string,
    forUser: string,
    afterTimestamp: bigint,
  ): Promise<BackendMessage[]>;
  getRoomStatus(roomCode: string): Promise<{
    usersConnected: bigint;
    userAOnline: boolean;
    userBOnline: boolean;
  }>;
}

type Screen = "landing" | "room";

interface HistoryEntry {
  id: string;
  sourceText: string;
  translatedText: string;
  direction: "hi-zh" | "zh-hi";
  time: string;
  isReceived: boolean;
}

interface RoomState {
  roomCode: string;
  userId: "A" | "B"; // A = Hindi, B = Chinese
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

async function translateText(
  text: string,
  from: string,
  to: string,
): Promise<string> {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.responseData?.translatedText ?? text;
}

function speakText(text: string, lang: string) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = lang;
  window.speechSynthesis.speak(utt);
}

// ─── App ────────────────────────────────────────────────────────────────────

export default function App() {
  const { actor: _actor, isFetching } = useActor();
  const actor = _actor as unknown as VormoActor | null;

  const [screen, setScreen] = useState<Screen>("landing");
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [partnerConnected, setPartnerConnected] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [latestTranslation, setLatestTranslation] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const recognitionRef = useRef<any>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTimestampRef = useRef<bigint>(BigInt(0));
  const roomStateRef = useRef<RoomState | null>(null);

  // Keep ref in sync
  useEffect(() => {
    roomStateRef.current = roomState;
  }, [roomState]);

  // ── Polling ─────────────────────────────────────────────────────────────

  const startPolling = useCallback(
    (rs: RoomState) => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

      lastTimestampRef.current = BigInt(0);

      pollIntervalRef.current = setInterval(async () => {
        if (!actor) return;
        const current = roomStateRef.current ?? rs;
        try {
          const msgs: BackendMessage[] = await actor.getNewMessages(
            current.roomCode,
            current.userId,
            lastTimestampRef.current,
          );

          if (msgs.length > 0) {
            setPartnerConnected(true);

            // Update timestamp to latest
            const maxTs = msgs.reduce(
              (max, m) => (m.timestamp > max ? m.timestamp : max),
              lastTimestampRef.current,
            );
            lastTimestampRef.current = maxTs + BigInt(1);

            for (const msg of msgs) {
              const speakLang = current.userId === "A" ? "zh-CN" : "hi-IN";
              setLatestTranslation(msg.translatedText);
              setHistory((prev) => [
                ...prev,
                {
                  id: msg.id,
                  sourceText: msg.sourceText,
                  translatedText: msg.translatedText,
                  direction: msg.direction as "hi-zh" | "zh-hi",
                  time: formatTime(new Date()),
                  isReceived: true,
                },
              ]);
              setIsSpeaking(true);
              speakText(msg.translatedText, speakLang);
              setTimeout(() => setIsSpeaking(false), 3000);
            }
          }

          // Also poll room status for partner detection
          const status = await actor.getRoomStatus(current.roomCode);
          if (Number(status.usersConnected) >= 2) {
            setPartnerConnected(true);
          }
        } catch (e) {
          console.error("Poll error", e);
        }
      }, 1500);
    },
    [actor],
  );

  const startHeartbeat = useCallback(
    (rs: RoomState) => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      heartbeatRef.current = setInterval(async () => {
        if (!actor) return;
        const current = roomStateRef.current ?? rs;
        try {
          await actor.heartbeat(current.roomCode, current.userId);
        } catch {}
      }, 5000);
    },
    [actor],
  );

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  // ── Room Actions ────────────────────────────────────────────────────────

  const handleCreateRoom = async () => {
    if (!actor) return;
    setIsCreating(true);
    try {
      const result = await actor.createRoom();
      const rs: RoomState = {
        roomCode: result.roomCode,
        userId: result.userId as "A" | "B",
      };
      setRoomState(rs);
      setScreen("room");
      setPartnerConnected(false);
      setHistory([]);
      setLatestTranslation("");
      lastTimestampRef.current = BigInt(0);
      startPolling(rs);
      startHeartbeat(rs);
      toast.success(`Room created! Code: ${result.roomCode}`);
    } catch (e) {
      console.error(e);
      toast.error("Failed to create room. Please try again.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!actor || !joinCode.trim()) return;
    setIsJoining(true);
    try {
      const result = await actor.joinRoom(joinCode.trim().toUpperCase());
      if ("err" in result) {
        toast.error(result.err || "Room not found.");
        return;
      }
      const rs: RoomState = {
        roomCode: joinCode.trim().toUpperCase(),
        userId: result.ok.userId as "A" | "B",
      };
      setRoomState(rs);
      setScreen("room");
      setPartnerConnected(true); // joining means room already has someone
      setHistory([]);
      setLatestTranslation("");
      lastTimestampRef.current = BigInt(0);
      startPolling(rs);
      startHeartbeat(rs);
      toast.success("Joined room!");
    } catch (e) {
      console.error(e);
      toast.error("Failed to join room. Please try again.");
    } finally {
      setIsJoining(false);
    }
  };

  const handleLeaveRoom = () => {
    stopPolling();
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setScreen("landing");
    setRoomState(null);
    setJoinCode("");
    setIsListening(false);
    setHistory([]);
    setLatestTranslation("");
    setPartnerConnected(false);
  };

  const handleCopyCode = () => {
    if (!roomState) return;
    navigator.clipboard.writeText(roomState.roomCode);
    toast.success("Room code copied!");
  };

  // ── Speech & Translation ────────────────────────────────────────────────

  const handleSpeak = () => {
    if (!roomState || !actor) return;

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition =
      (window as any).webkitSpeechRecognition ||
      (window as any).SpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("Speech recognition not supported. Use Chrome.");
      return;
    }

    const isHindi = roomState.userId === "A";
    const recognition = new SpeechRecognition();
    recognition.lang = isHindi ? "hi-IN" : "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognitionRef.current = recognition;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = (e: any) => {
      setIsListening(false);
      if (e.error !== "no-speech") {
        toast.error(`Mic error: ${e.error}`);
      }
    };

    recognition.onresult = async (e: any) => {
      const spokenText = e.results[0][0].transcript;
      setIsTranslating(true);

      try {
        const from = isHindi ? "hi" : "zh";
        const to = isHindi ? "zh" : "hi";
        const translated = await translateText(spokenText, from, to);
        const direction: "hi-zh" | "zh-hi" = isHindi ? "hi-zh" : "zh-hi";

        // Send to partner
        await actor.postMessage(
          roomState.roomCode,
          roomState.userId,
          spokenText,
          translated,
          direction,
        );

        // Show in history
        setHistory((prev) => [
          ...prev,
          {
            id: `local-${Date.now()}`,
            sourceText: spokenText,
            translatedText: translated,
            direction,
            time: formatTime(new Date()),
            isReceived: false,
          },
        ]);

        toast.success("Translation sent!");
      } catch (err) {
        console.error(err);
        toast.error("Translation failed.");
      } finally {
        setIsTranslating(false);
      }
    };

    recognition.start();
  };

  // ── Render ───────────────────────────────────────────────────────────────

  const isLoading = isFetching || !actor;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Toaster position="top-center" />

      {/* Header */}
      <header className="border-b border-border/50 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
            <Volume2 className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-display font-bold text-lg tracking-tight text-foreground">
            Vormo
          </span>
          <span className="text-muted-foreground text-sm hidden sm:block">
            Voice Translator
          </span>
        </div>
        {screen === "room" && (
          <button
            type="button"
            onClick={handleLeaveRoom}
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground text-sm transition-colors"
            data-ocid="room.secondary_button"
          >
            <LogOut className="w-4 h-4" />
            Leave
          </button>
        )}
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-4">
        <AnimatePresence mode="wait">
          {screen === "landing" ? (
            <motion.div
              key="landing"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -24 }}
              transition={{ duration: 0.35 }}
              className="w-full max-w-sm space-y-8"
            >
              {/* Hero */}
              <div className="text-center space-y-3">
                <motion.div
                  className="mx-auto w-20 h-20 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center"
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 3, repeat: Number.POSITIVE_INFINITY }}
                >
                  <Mic className="w-9 h-9 text-primary" />
                </motion.div>
                <h1 className="font-display text-3xl font-bold text-foreground">
                  Vormo Translator
                </h1>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Real-time Hindi ↔ Chinese voice translation across two phones.
                </p>
              </div>

              {/* Create Room */}
              <div className="space-y-3">
                <Button
                  className="w-full h-12 text-base font-semibold"
                  onClick={handleCreateRoom}
                  disabled={isCreating || isLoading}
                  data-ocid="room.create_button"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating Room...
                    </>
                  ) : (
                    <>
                      🎙️ Create Room
                      <br />
                      <span className="text-xs font-normal opacity-70">
                        You speak Hindi
                      </span>
                    </>
                  )}
                </Button>
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-muted-foreground text-xs">OR JOIN</span>
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* Join Room */}
              <div className="space-y-3">
                <Input
                  placeholder="Enter room code (e.g. AB12CD)"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  className="h-12 text-center text-lg font-mono tracking-widest uppercase"
                  maxLength={6}
                  data-ocid="room.input"
                  onKeyDown={(e) => e.key === "Enter" && handleJoinRoom()}
                />
                <Button
                  variant="outline"
                  className="w-full h-12 text-base font-semibold"
                  onClick={handleJoinRoom}
                  disabled={isJoining || isLoading || joinCode.length < 4}
                  data-ocid="room.join_button"
                >
                  {isJoining ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Joining...
                    </>
                  ) : (
                    <>
                      🈳 Join Room
                      <br />
                      <span className="text-xs font-normal opacity-70">
                        You speak Chinese
                      </span>
                    </>
                  )}
                </Button>
              </div>

              {isLoading && (
                <div
                  className="flex items-center justify-center gap-2 text-muted-foreground text-sm"
                  data-ocid="room.loading_state"
                >
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Connecting to network...
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="room"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -24 }}
              transition={{ duration: 0.35 }}
              className="w-full max-w-sm space-y-6"
            >
              {/* Room Code Bar */}
              <div className="bg-card rounded-xl border border-border px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="text-xs text-muted-foreground mb-0.5">
                    Room Code
                  </div>
                  <div className="font-mono font-bold text-xl tracking-widest text-primary">
                    {roomState?.roomCode}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="p-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
                    data-ocid="room.copy_button"
                    title="Copy room code"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Connection Status */}
              <div className="flex items-center justify-center gap-2">
                {partnerConnected ? (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="flex items-center gap-2 bg-accent/10 border border-accent/30 rounded-full px-4 py-1.5"
                    data-ocid="room.success_state"
                  >
                    <CheckCircle2 className="w-4 h-4 text-accent" />
                    <span className="text-sm text-accent font-medium">
                      Partner connected
                    </span>
                  </motion.div>
                ) : (
                  <div
                    className="flex items-center gap-2 bg-muted rounded-full px-4 py-1.5"
                    data-ocid="room.loading_state"
                  >
                    <motion.div
                      animate={{ opacity: [1, 0.4, 1] }}
                      transition={{
                        duration: 1.5,
                        repeat: Number.POSITIVE_INFINITY,
                      }}
                    >
                      <Users className="w-4 h-4 text-muted-foreground" />
                    </motion.div>
                    <span className="text-sm text-muted-foreground">
                      Waiting for partner...
                    </span>
                  </div>
                )}
              </div>

              {/* Role Badge */}
              <div className="text-center">
                <span className="inline-block bg-primary/10 border border-primary/20 rounded-full px-3 py-1 text-xs text-primary font-medium">
                  {roomState?.userId === "A"
                    ? "🇮🇳 You speak Hindi"
                    : "🇨🇳 You speak Chinese"}
                </span>
              </div>

              {/* Mic Button */}
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  {isListening && (
                    <>
                      <motion.div
                        className="absolute inset-0 rounded-full bg-primary/20"
                        animate={{ scale: [1, 1.8], opacity: [0.6, 0] }}
                        transition={{
                          duration: 1.2,
                          repeat: Number.POSITIVE_INFINITY,
                        }}
                      />
                      <motion.div
                        className="absolute inset-0 rounded-full bg-primary/15"
                        animate={{ scale: [1, 2.3], opacity: [0.4, 0] }}
                        transition={{
                          duration: 1.2,
                          repeat: Number.POSITIVE_INFINITY,
                          delay: 0.3,
                        }}
                      />
                    </>
                  )}
                  <motion.button
                    onClick={handleSpeak}
                    className={`relative w-24 h-24 rounded-full flex items-center justify-center text-white transition-all shadow-lg ${
                      isListening
                        ? "bg-destructive shadow-destructive/40"
                        : isTranslating
                          ? "bg-muted cursor-wait"
                          : "bg-primary hover:bg-primary/90 shadow-primary/30"
                    }`}
                    whileTap={{ scale: 0.92 }}
                    disabled={isTranslating}
                    data-ocid="translator.speak_button"
                    aria-label={
                      isListening ? "Stop listening" : "Start speaking"
                    }
                  >
                    {isTranslating ? (
                      <Loader2 className="w-9 h-9 animate-spin" />
                    ) : isListening ? (
                      <MicOff className="w-9 h-9" />
                    ) : (
                      <Mic className="w-9 h-9" />
                    )}
                  </motion.button>
                </div>
                <p className="text-sm text-muted-foreground">
                  {isTranslating
                    ? "Translating..."
                    : isListening
                      ? "Listening... tap to stop"
                      : isSpeaking
                        ? "Partner speaking..."
                        : "Tap to speak"}
                </p>
              </div>

              {/* Translation Display */}
              <div
                className="min-h-[80px] bg-card rounded-xl border border-border p-4 text-center"
                data-ocid="translator.output"
              >
                {latestTranslation ? (
                  <motion.p
                    key={latestTranslation}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-lg font-medium text-foreground"
                  >
                    {latestTranslation}
                  </motion.p>
                ) : (
                  <p className="text-muted-foreground text-sm flex items-center justify-center h-full pt-3">
                    Translation will appear here
                  </p>
                )}
              </div>

              {/* History */}
              {history.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                    Conversation History
                  </div>
                  <ScrollArea className="h-44 rounded-xl border border-border bg-card">
                    <div className="p-3 space-y-2">
                      <AnimatePresence initial={false}>
                        {history.map((entry, i) => (
                          <motion.div
                            key={entry.id}
                            initial={{
                              opacity: 0,
                              x: entry.isReceived ? -10 : 10,
                            }}
                            animate={{ opacity: 1, x: 0 }}
                            className={`flex flex-col gap-0.5 rounded-lg px-3 py-2 text-sm ${
                              entry.isReceived
                                ? "bg-accent/10 border border-accent/20 items-start"
                                : "bg-primary/10 border border-primary/20 items-end ml-4"
                            }`}
                            data-ocid={`translator.item.${i + 1}`}
                          >
                            <span className="text-xs text-muted-foreground">
                              {entry.isReceived ? "Partner" : "You"} ·{" "}
                              {entry.time}
                            </span>
                            <span className="text-foreground">
                              {entry.sourceText}
                            </span>
                            <span className="text-muted-foreground text-xs">
                              → {entry.translatedText}
                            </span>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  </ScrollArea>
                </div>
              )}

              {history.length === 0 && (
                <div
                  className="text-center text-muted-foreground text-xs py-2"
                  data-ocid="translator.empty_state"
                >
                  Speak to start the conversation
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/30 px-4 py-3 text-center">
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()}. Built with ❤️ using{" "}
          <a
            href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(typeof window !== "undefined" ? window.location.hostname : "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground transition-colors"
          >
            caffeine.ai
          </a>
        </p>
      </footer>
    </div>
  );
}
