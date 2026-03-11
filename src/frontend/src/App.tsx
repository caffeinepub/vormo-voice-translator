import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Toaster } from "@/components/ui/sonner";
import { useActor } from "@/hooks/useActor";
import {
  AlertCircle,
  Check,
  Clock,
  Copy,
  Link2,
  Loader2,
  LogOut,
  Mic,
  MicOff,
  Phone,
  PhoneIncoming,
  Trash2,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────────────

type AppMode = "select" | "local" | "remote-setup" | "remote-room";
type RemoteSetupStep = "choose" | "create" | "join";
type ListenState =
  | "idle"
  | "listening-hi"
  | "listening-zh"
  | "translating"
  | "error";

interface HistoryEntry {
  id: string;
  sourceText: string;
  translatedText: string;
  direction: "hi-zh" | "zh-hi";
  time: string;
  isReceived?: boolean;
}

interface RoomInfo {
  roomCode: string;
  userId: string; // "A" or "B"
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SPEECH_SUPPORTED =
  typeof window !== "undefined" &&
  ((window as any).SpeechRecognition !== undefined ||
    (window as any).webkitSpeechRecognition !== undefined);

const teal = "oklch(0.72 0.19 195)";
const green = "oklch(0.65 0.22 155)";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function translateText(text: string, langpair: string): Promise<string> {
  const res = await fetch(
    `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langpair}`,
  );
  const data = await res.json();
  const result = data?.responseData?.translatedText;
  if (!result) throw new Error("No translation returned");
  return result;
}

function getTime(): string {
  return new Date().toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function speakText(text: string, lang: "hi-IN" | "zh-CN", onEnd?: () => void) {
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  const voices = window.speechSynthesis.getVoices();
  const voice = voices.find((v) =>
    lang === "zh-CN"
      ? v.lang.startsWith("zh") || v.lang.startsWith("cmn")
      : v.lang.startsWith("hi"),
  );
  if (voice) utter.voice = voice;
  utter.lang = lang;
  utter.rate = 0.9;
  if (onEnd) utter.onend = onEnd;
  window.speechSynthesis.speak(utter);
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function WaveformBars({ color }: { color: string }) {
  return (
    <div className="flex items-center gap-[3px]" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          className="waveform-bar rounded-full"
          style={{
            width: "3px",
            height: i % 2 === 0 ? "20px" : "14px",
            background: color,
          }}
        />
      ))}
    </div>
  );
}

function StatusDot({ online }: { online: boolean }) {
  return (
    <span
      className="inline-block w-2 h-2 rounded-full"
      style={{
        background: online ? green : "oklch(0.45 0.01 200)",
        boxShadow: online ? `0 0 6px ${green}` : "none",
      }}
    />
  );
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const { actor, isFetching: actorFetching } = useActor();

  // Mode
  const [mode, setMode] = useState<AppMode>("select");
  const [remoteStep, setRemoteStep] = useState<RemoteSetupStep>("choose");

  // Room state
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [joinInput, setJoinInput] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [partnerOnline, setPartnerOnline] = useState(false);
  const [copied, setCopied] = useState(false);

  // Listen state (shared between local and remote)
  const [listenState, setListenState] = useState<ListenState>("idle");
  const [interimText, setInterimText] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);

  // History
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const historyEndRef = useRef<HTMLDivElement>(null);

  // Refs
  const recognitionRef = useRef<any>(null);
  const translatedRef = useRef(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTimestampRef = useRef<bigint>(0n);
  const roomRef = useRef<RoomInfo | null>(null);

  // Keep roomRef in sync
  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  // ── URL auto-join ──────────────────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("room");
    if (code) {
      setJoinInput(code.toUpperCase());
      setMode("remote-setup");
      setRemoteStep("join");
    }
  }, []);

  // ── Scroll history ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (history.length > 0) {
      historyEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [history]);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopRecognition();
      window.speechSynthesis?.cancel();
      clearIntervals();
    };
  }, []);

  // ─── Interval helpers ────────────────────────────────────────────────────

  const clearIntervals = useCallback(() => {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    if (pollRef.current) clearInterval(pollRef.current);
    heartbeatRef.current = null;
    pollRef.current = null;
  }, []);

  // ─── Recognition ────────────────────────────────────────────────────────

  const stopRecognition = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
  }, []);

  // ─── Translate + optional postMessage ───────────────────────────────────

  const doTranslate = useCallback(
    async (
      text: string,
      direction: "hi-zh" | "zh-hi",
      remote?: { roomCode: string; fromUser: string },
    ) => {
      setListenState("translating");
      setInterimText("");
      try {
        const langpair = direction === "hi-zh" ? "hi|zh" : "zh|hi";
        const translated = await translateText(text, langpair);

        // Post to backend if remote mode
        if (remote && actor) {
          await (actor as any).postMessage(
            remote.roomCode,
            remote.fromUser,
            text,
            translated,
            direction,
          );
        }

        const entry: HistoryEntry = {
          id: `${Date.now()}-${Math.random()}`,
          sourceText: text,
          translatedText: translated,
          direction,
          time: getTime(),
          isReceived: false,
        };
        setHistory((prev) => [...prev, entry]);
        setListenState("idle");

        // In local mode, auto-play translation
        if (!remote) {
          const ttsLang: "hi-IN" | "zh-CN" =
            direction === "hi-zh" ? "zh-CN" : "hi-IN";
          setIsSpeaking(true);
          setTimeout(() => {
            speakText(translated, ttsLang, () => setIsSpeaking(false));
          }, 300);
        }
      } catch {
        setListenState("error");
        toast.error("Translation failed. Check your connection.");
      }
    },
    [actor],
  );

  // ─── Start listening ────────────────────────────────────────────────────

  const startListening = useCallback(
    (
      direction: "hi-zh" | "zh-hi",
      remote?: { roomCode: string; fromUser: string },
    ) => {
      if (!SPEECH_SUPPORTED) {
        setListenState("error");
        return;
      }
      stopRecognition();
      window.speechSynthesis?.cancel();
      setIsSpeaking(false);
      setInterimText("");
      translatedRef.current = false;

      setListenState(direction === "hi-zh" ? "listening-hi" : "listening-zh");

      const SpeechRecognitionCtor =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognitionCtor();
      recognition.lang = direction === "hi-zh" ? "hi-IN" : "zh-CN";
      recognition.continuous = false;
      recognition.interimResults = true;

      recognition.onresult = (event: any) => {
        let interim = "";
        let final = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const t = event.results[i][0].transcript;
          if (event.results[i].isFinal) final += t;
          else interim += t;
        }
        if (final && !translatedRef.current) {
          translatedRef.current = true;
          recognition.stop();
          doTranslate(final, direction, remote);
        } else if (interim) {
          setInterimText(interim);
        }
      };

      recognition.onend = () => {
        setInterimText("");
        if (!translatedRef.current) setListenState("idle");
        recognitionRef.current = null;
      };

      recognition.onerror = (event: any) => {
        if (event.error !== "no-speech" && event.error !== "aborted") {
          setListenState("error");
          toast.error(`Microphone error: ${event.error}`);
        } else if (!translatedRef.current) {
          setListenState("idle");
        }
        recognitionRef.current = null;
      };

      recognitionRef.current = recognition;
      recognition.start();
    },
    [stopRecognition, doTranslate],
  );

  // ─── Remote: create room ─────────────────────────────────────────────────

  const handleCreateRoom = useCallback(async () => {
    if (!actor) return;
    setIsCreating(true);
    try {
      const result = await (actor as any).createRoom();
      const info: RoomInfo = {
        roomCode: result.roomCode,
        userId: result.userId,
      };
      setRoom(info);
      lastTimestampRef.current = 0n;
      setMode("remote-room");
      startRoomIntervals(info);
    } catch {
      toast.error("Failed to create room. Please try again.");
    } finally {
      setIsCreating(false);
    }
  }, [actor]);

  // ─── Remote: join room ──────────────────────────────────────────────────

  const handleJoinRoom = useCallback(async () => {
    if (!actor || !joinInput.trim()) return;
    setIsJoining(true);
    try {
      const result = await (actor as any).joinRoom(
        joinInput.trim().toUpperCase(),
      );
      if ("err" in result) {
        toast.error(result.err);
        return;
      }
      const info: RoomInfo = {
        roomCode: joinInput.trim().toUpperCase(),
        userId: result.ok.userId,
      };
      setRoom(info);
      lastTimestampRef.current = 0n;
      setMode("remote-room");
      startRoomIntervals(info);
    } catch {
      toast.error("Failed to join room. Check the code and try again.");
    } finally {
      setIsJoining(false);
    }
  }, [actor, joinInput]);

  // ─── Remote: start heartbeat + polling ──────────────────────────────────

  const startRoomIntervals = useCallback(
    (_info: RoomInfo) => {
      clearIntervals();

      // Heartbeat every 5s
      heartbeatRef.current = setInterval(async () => {
        const r = roomRef.current;
        if (!r || !actor) return;
        try {
          await (actor as any).heartbeat(r.roomCode, r.userId);
        } catch {}
      }, 5000);

      // Poll for messages every 1500ms
      pollRef.current = setInterval(async () => {
        const r = roomRef.current;
        if (!r || !actor) return;
        try {
          // Check partner status
          const status = await (actor as any).getRoomStatus(r.roomCode);
          const isA = r.userId === "A";
          setPartnerOnline(isA ? status.userBOnline : status.userAOnline);

          // Fetch new messages
          const msgs = await (actor as any).getNewMessages(
            r.roomCode,
            r.userId,
            lastTimestampRef.current,
          );
          if (msgs.length > 0) {
            // Update timestamp
            const maxTs = msgs.reduce(
              (acc, m) => (m.timestamp > acc ? m.timestamp : acc),
              lastTimestampRef.current,
            );
            lastTimestampRef.current = maxTs;

            // Add to history and play audio
            for (const msg of msgs) {
              const dir = msg.direction as "hi-zh" | "zh-hi";
              const entry: HistoryEntry = {
                id: msg.id,
                sourceText: msg.sourceText,
                translatedText: msg.translatedText,
                direction: dir,
                time: getTime(),
                isReceived: true,
              };
              setHistory((prev) => {
                if (prev.find((e) => e.id === msg.id)) return prev;
                return [...prev, entry];
              });
              // Play TTS for received message
              const ttsLang: "hi-IN" | "zh-CN" =
                r.userId === "A" ? "hi-IN" : "zh-CN";
              setIsSpeaking(true);
              setTimeout(() => {
                speakText(msg.translatedText, ttsLang, () =>
                  setIsSpeaking(false),
                );
              }, 200);
            }
          }
        } catch {}
      }, 1500);
    },
    [actor, clearIntervals],
  );

  // ─── Leave room ─────────────────────────────────────────────────────────

  const handleLeaveRoom = useCallback(() => {
    clearIntervals();
    stopRecognition();
    window.speechSynthesis?.cancel();
    setRoom(null);
    setPartnerOnline(false);
    setHistory([]);
    setListenState("idle");
    lastTimestampRef.current = 0n;
    setMode("select");
    setRemoteStep("choose");
    // Clear room param from URL
    const url = new URL(window.location.href);
    url.searchParams.delete("room");
    window.history.replaceState({}, "", url.toString());
  }, [stopRecognition, clearIntervals]);

  // ─── Copy room link ──────────────────────────────────────────────────────

  const handleCopyLink = useCallback(() => {
    if (!room) return;
    const url = new URL(window.location.href);
    url.searchParams.set("room", room.roomCode);
    navigator.clipboard
      .writeText(url.toString())
      .then(() => {
        setCopied(true);
        toast.success("Link copied! Share it with your partner.");
        setTimeout(() => setCopied(false), 2500);
      })
      .catch(() => toast.error("Could not copy link."));
  }, [room]);

  // ─── Derived ─────────────────────────────────────────────────────────────

  const isListeningHi = listenState === "listening-hi";
  const isListeningZh = listenState === "listening-zh";
  const isListening = isListeningHi || isListeningZh;
  const isTranslating = listenState === "translating";
  const currentYear = new Date().getFullYear();

  // ─── Render helpers ──────────────────────────────────────────────────────

  function renderMicButton(
    direction: "hi-zh" | "zh-hi",
    remoteContext?: { roomCode: string; fromUser: string },
  ) {
    const isHindi = direction === "hi-zh";
    const isThisListening = isHindi ? isListeningHi : isListeningZh;
    const color = isHindi ? green : teal;
    const flag = isHindi ? "🇮🇳" : "🇨🇳";
    const label = isHindi ? "हिंदी बोलें" : "Speak Chinese";
    const stopLabel = isHindi ? "रोकने के लिए टैप करें" : "Tap to Stop";
    const isDisabled =
      isTranslating || (isHindi ? isListeningZh : isListeningHi);
    const ocid = isHindi
      ? "translator.hindi_button"
      : "translator.chinese_button";

    return (
      <div className="flex flex-col items-center gap-3">
        <div className="relative flex items-center justify-center">
          {isThisListening && (
            <>
              <span
                className="absolute inset-0 rounded-full"
                style={{
                  animation: "pulse-ring 1.5s ease-out infinite",
                  background: `${color}55`,
                }}
              />
              <span
                className="absolute inset-0 rounded-full"
                style={{
                  animation: "pulse-ring-2 1.5s ease-out 0.5s infinite",
                  background: `${color}33`,
                }}
              />
            </>
          )}
          <button
            type="button"
            data-ocid={ocid}
            onClick={() =>
              isThisListening
                ? stopRecognition()
                : startListening(direction, remoteContext)
            }
            disabled={isDisabled}
            aria-label={isHindi ? "Speak Hindi" : "Speak Chinese"}
            className="relative z-10 rounded-full flex flex-col items-center justify-center gap-1 transition-all duration-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              width: "100px",
              height: "100px",
              background: isThisListening ? color : "oklch(0.17 0.012 200)",
              border: isThisListening
                ? `3px solid oklch(${isHindi ? "0.82 0.14 155" : "0.88 0.12 195"})`
                : `2px solid oklch(${isHindi ? "0.28 0.04 155" : "0.28 0.04 195"})`,
              boxShadow: isThisListening
                ? `0 0 32px ${color}80, 0 0 64px ${color}40`
                : "0 6px 24px oklch(0 0 0 / 0.35)",
            }}
          >
            <span className="text-2xl">{flag}</span>
            {isThisListening ? (
              <MicOff size={16} style={{ color: "oklch(0.08 0.01 200)" }} />
            ) : (
              <Mic size={16} style={{ color }} />
            )}
          </button>
        </div>
        <span
          className="text-xs font-semibold text-center leading-tight"
          style={{
            color: isThisListening ? color : "oklch(0.55 0.02 200)",
            fontFamily: "Outfit, sans-serif",
          }}
        >
          {isThisListening ? stopLabel : `🎤 ${label}`}
        </span>
      </div>
    );
  }

  function renderHistoryPanel() {
    if (history.length === 0) return null;
    return (
      <motion.div
        key="history-panel"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        className="w-full max-w-sm"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Clock size={13} style={{ color: "oklch(0.45 0.015 200)" }} />
            <span
              className="text-[11px] font-semibold uppercase tracking-widest"
              style={{ color: "oklch(0.45 0.015 200)" }}
            >
              Conversation
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            data-ocid="history.delete_button"
            onClick={() => setHistory([])}
            className="h-7 px-2 gap-1 text-[11px] hover:bg-destructive/20 hover:text-destructive"
            style={{ color: "oklch(0.45 0.015 200)" }}
          >
            <Trash2 size={11} />
            Clear
          </Button>
        </div>
        <ScrollArea className="h-64">
          <div data-ocid="history.list" className="flex flex-col gap-2 pr-3">
            {history.map((entry, idx) => (
              <motion.div
                key={entry.id}
                data-ocid={`history.item.${idx + 1}`}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05 * Math.min(idx, 5) }}
                className="rounded-xl p-3"
                style={{
                  background: entry.isReceived
                    ? "oklch(0.14 0.018 195)"
                    : "oklch(0.14 0.01 200)",
                  border: entry.isReceived
                    ? `1px solid ${teal}33`
                    : "1px solid oklch(0.2 0.012 200)",
                }}
              >
                {entry.isReceived && (
                  <span
                    className="text-[9px] font-bold uppercase tracking-widest block mb-1"
                    style={{ color: "oklch(0.55 0.12 195)" }}
                  >
                    📥 Received
                  </span>
                )}
                <div className="flex items-start gap-2 mb-1.5">
                  <span className="text-sm leading-none mt-0.5">
                    {entry.direction === "zh-hi" ? "🇨🇳" : "🇮🇳"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span
                      className="text-[9px] font-bold uppercase tracking-widest block mb-0.5"
                      style={{
                        color: entry.direction === "zh-hi" ? teal : green,
                      }}
                    >
                      {entry.direction === "zh-hi" ? "Chinese" : "Hindi"}
                    </span>
                    <p
                      className="text-xs leading-snug"
                      style={{ color: "oklch(0.72 0.01 200)" }}
                    >
                      {entry.sourceText}
                    </p>
                  </div>
                </div>
                <div className="flex justify-center my-1" aria-hidden="true">
                  <span
                    style={{ color: "oklch(0.32 0.01 200)", fontSize: "10px" }}
                  >
                    ↓
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-sm leading-none mt-0.5">
                    {entry.direction === "zh-hi" ? "🇮🇳" : "🇨🇳"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span
                      className="text-[9px] font-bold uppercase tracking-widest block mb-0.5"
                      style={{
                        color: entry.direction === "zh-hi" ? green : teal,
                      }}
                    >
                      {entry.direction === "zh-hi" ? "Hindi" : "Chinese"}
                    </span>
                    <p
                      className="text-xs leading-snug font-medium"
                      style={{ color: "oklch(0.88 0.01 200)" }}
                    >
                      {entry.translatedText}
                    </p>
                  </div>
                </div>
                <div className="flex justify-end mt-2">
                  <span
                    className="text-[9px]"
                    style={{ color: "oklch(0.32 0.01 200)" }}
                  >
                    {entry.time}
                  </span>
                </div>
              </motion.div>
            ))}
            <div ref={historyEndRef} />
          </div>
        </ScrollArea>
      </motion.div>
    );
  }

  // ─── Screens ─────────────────────────────────────────────────────────────

  function renderModeSelect() {
    return (
      <motion.div
        key="mode-select"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        className="w-full max-w-sm flex flex-col gap-4"
      >
        <p
          className="text-center text-sm mb-2"
          style={{ color: "oklch(0.5 0.015 200)" }}
        >
          Choose how you want to translate
        </p>

        {/* Local mode card */}
        <button
          type="button"
          data-ocid="mode.local.button"
          onClick={() => setMode("local")}
          className="w-full rounded-2xl p-5 text-left transition-all duration-200 active:scale-[0.98] hover:scale-[1.01]"
          style={{
            background: "oklch(0.15 0.012 200)",
            border: `1px solid ${green}44`,
          }}
        >
          <div className="flex items-center gap-3 mb-2">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: `${green}22` }}
            >
              <Phone size={18} style={{ color: green }} />
            </div>
            <div>
              <h3
                className="font-bold text-sm"
                style={{
                  color: "oklch(0.92 0.01 200)",
                  fontFamily: "Bricolage Grotesque, sans-serif",
                }}
              >
                Local Mode
              </h3>
              <p
                className="text-[11px]"
                style={{ color: "oklch(0.48 0.015 200)" }}
              >
                Single device · Pass the phone
              </p>
            </div>
          </div>
          <p className="text-xs" style={{ color: "oklch(0.55 0.01 200)" }}>
            Both people use the same device. Speak, pass the phone, and hear the
            translation.
          </p>
        </button>

        {/* Remote mode card */}
        <button
          type="button"
          data-ocid="mode.remote.button"
          onClick={() => {
            setMode("remote-setup");
            setRemoteStep("choose");
          }}
          className="w-full rounded-2xl p-5 text-left transition-all duration-200 active:scale-[0.98] hover:scale-[1.01]"
          style={{
            background: "oklch(0.15 0.018 200)",
            border: `1px solid ${teal}44`,
          }}
        >
          <div className="flex items-center gap-3 mb-2">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: `${teal}22` }}
            >
              <Users size={18} style={{ color: teal }} />
            </div>
            <div>
              <h3
                className="font-bold text-sm"
                style={{
                  color: "oklch(0.92 0.01 200)",
                  fontFamily: "Bricolage Grotesque, sans-serif",
                }}
              >
                Remote Mode
              </h3>
              <p
                className="text-[11px]"
                style={{ color: "oklch(0.48 0.015 200)" }}
              >
                Two devices · Share a link
              </p>
            </div>
          </div>
          <p className="text-xs" style={{ color: "oklch(0.55 0.01 200)" }}>
            Each person uses their own phone. Translation plays on the other
            person's device automatically.
          </p>
          <div
            className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider"
            style={{ background: `${teal}22`, color: teal }}
          >
            <Wifi size={10} />
            Real-time via internet
          </div>
        </button>
      </motion.div>
    );
  }

  function renderRemoteSetup() {
    return (
      <motion.div
        key="remote-setup"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        className="w-full max-w-sm flex flex-col gap-4"
      >
        <button
          type="button"
          data-ocid="nav.back.button"
          onClick={() => setMode("select")}
          className="flex items-center gap-1.5 text-xs self-start transition-opacity hover:opacity-70"
          style={{ color: "oklch(0.5 0.015 200)" }}
        >
          ← Back
        </button>

        {remoteStep === "choose" && (
          <motion.div
            key="choose"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col gap-3"
          >
            <p
              className="text-center text-sm"
              style={{ color: "oklch(0.5 0.015 200)" }}
            >
              Start a new session or join an existing one
            </p>
            <Button
              data-ocid="room.create.button"
              onClick={() => {
                setRemoteStep("create");
                handleCreateRoom();
              }}
              disabled={isCreating || actorFetching || !actor}
              className="w-full h-14 text-base font-semibold rounded-2xl"
              style={{
                background: teal,
                color: "oklch(0.08 0.01 200)",
              }}
            >
              {isCreating ? (
                <>
                  <Loader2 size={18} className="mr-2 animate-spin" />
                  Creating room...
                </>
              ) : (
                <>
                  <Phone size={18} className="mr-2" />
                  Create Room
                </>
              )}
            </Button>
            <Button
              data-ocid="room.join.open_modal_button"
              onClick={() => setRemoteStep("join")}
              variant="outline"
              className="w-full h-14 text-base font-semibold rounded-2xl"
              style={{
                borderColor: `${teal}44`,
                color: teal,
                background: "transparent",
              }}
            >
              <PhoneIncoming size={18} className="mr-2" />
              Join Room
            </Button>
          </motion.div>
        )}

        {remoteStep === "create" && isCreating && (
          <motion.div
            key="creating"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center gap-3 py-6"
          >
            <Loader2
              size={32}
              className="animate-spin"
              style={{ color: teal }}
            />
            <p className="text-sm" style={{ color: "oklch(0.55 0.015 200)" }}>
              Creating your room...
            </p>
          </motion.div>
        )}

        {remoteStep === "join" && (
          <motion.div
            key="join"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col gap-3"
          >
            <p
              className="text-center text-sm"
              style={{ color: "oklch(0.5 0.015 200)" }}
            >
              Enter the 6-character room code shared by your partner
            </p>
            <Input
              data-ocid="room.join.input"
              value={joinInput}
              onChange={(e) => setJoinInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && handleJoinRoom()}
              placeholder="ROOM CODE"
              maxLength={6}
              className="text-center text-2xl font-bold tracking-[0.3em] h-16 rounded-2xl"
              style={{
                background: "oklch(0.15 0.012 200)",
                border: `1px solid ${teal}44`,
                color: teal,
                fontFamily: "Geist Mono, monospace",
              }}
            />
            <Button
              data-ocid="room.join.submit_button"
              onClick={handleJoinRoom}
              disabled={isJoining || !joinInput.trim() || !actor}
              className="w-full h-12 text-base font-semibold rounded-2xl"
              style={{
                background: teal,
                color: "oklch(0.08 0.01 200)",
              }}
            >
              {isJoining ? (
                <>
                  <Loader2 size={16} className="mr-2 animate-spin" />
                  Joining...
                </>
              ) : (
                <>
                  <Link2 size={16} className="mr-2" />
                  Join Room
                </>
              )}
            </Button>
            <Button
              data-ocid="room.join.cancel_button"
              variant="ghost"
              onClick={() => setRemoteStep("choose")}
              className="w-full h-10 rounded-2xl text-sm"
              style={{ color: "oklch(0.45 0.015 200)" }}
            >
              Back
            </Button>
          </motion.div>
        )}
      </motion.div>
    );
  }

  function renderRemoteRoom() {
    if (!room) return null;
    const isA = room.userId === "A";
    const myDirection: "hi-zh" | "zh-hi" = isA ? "hi-zh" : "zh-hi";
    const remoteCtx = { roomCode: room.roomCode, fromUser: room.userId };

    return (
      <motion.div
        key="remote-room"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        className="w-full max-w-sm flex flex-col gap-4"
      >
        {/* Room code + copy */}
        <div
          className="rounded-2xl p-4"
          style={{
            background: "oklch(0.14 0.018 200)",
            border: `1px solid ${teal}33`,
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p
                className="text-[10px] font-bold uppercase tracking-widest mb-1"
                style={{ color: "oklch(0.48 0.015 200)" }}
              >
                Room Code
              </p>
              <p
                className="text-2xl font-bold tracking-[0.25em]"
                style={{
                  color: teal,
                  fontFamily: "Geist Mono, monospace",
                }}
              >
                {room.roomCode}
              </p>
            </div>
            <Button
              data-ocid="room.copy.button"
              onClick={handleCopyLink}
              size="sm"
              className="h-9 px-4 rounded-xl font-semibold text-xs"
              style={{
                background: copied ? green : `${teal}22`,
                color: copied ? "oklch(0.08 0.01 200)" : teal,
                border: `1px solid ${copied ? green : teal}55`,
              }}
            >
              {copied ? (
                <>
                  <Check size={13} className="mr-1.5" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy size={13} className="mr-1.5" />
                  Copy Link
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Connection status */}
        <div
          className="rounded-xl px-4 py-3 flex items-center justify-between"
          style={{
            background: "oklch(0.13 0.01 200)",
            border: "1px solid oklch(0.2 0.012 200)",
          }}
        >
          <div className="flex items-center gap-2">
            <StatusDot online={true} />
            <span className="text-xs" style={{ color: green }}>
              You ({isA ? "Hindi" : "Chinese"})
            </span>
          </div>
          <div className="flex items-center gap-2">
            {partnerOnline ? (
              <>
                <StatusDot online={true} />
                <span
                  className="text-xs flex items-center gap-1"
                  style={{ color: teal }}
                >
                  <Wifi size={11} />
                  Partner connected
                </span>
              </>
            ) : (
              <>
                <StatusDot online={false} />
                <span
                  className="text-xs animate-pulse flex items-center gap-1"
                  style={{ color: "oklch(0.48 0.015 200)" }}
                >
                  <WifiOff size={11} />
                  Waiting for partner...
                </span>
              </>
            )}
          </div>
        </div>

        {/* Role indicator */}
        <div
          className="rounded-xl px-4 py-3 text-center"
          style={{
            background: `${isA ? green : teal}11`,
            border: `1px solid ${isA ? green : teal}33`,
          }}
        >
          <p
            className="text-xs font-semibold"
            style={{ color: isA ? green : teal }}
          >
            {isA
              ? "🇮🇳 You speak Hindi → partner hears Chinese"
              : "🇨🇳 You speak Chinese → partner hears Hindi"}
          </p>
        </div>

        {/* Listening status */}
        <AnimatePresence>
          {isListening && (
            <motion.div
              data-ocid="translator.loading_state"
              key="listening-indicator"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex flex-col items-center gap-2"
            >
              <div
                className="flex items-center gap-3 px-5 py-2.5 rounded-full"
                style={{
                  background: "oklch(0.17 0.015 200)",
                  border: `1px solid ${isA ? green : teal}33`,
                }}
              >
                <WaveformBars color={isA ? green : teal} />
                <span
                  className="text-sm font-medium"
                  style={{ color: isA ? green : teal }}
                >
                  {isA ? "हिंदी सुन रहे हैं..." : "Listening in Chinese..."}
                </span>
                <WaveformBars color={isA ? green : teal} />
              </div>
              {interimText && (
                <p
                  className="text-sm text-center px-4"
                  style={{ color: "oklch(0.65 0.015 200)" }}
                >
                  {interimText}
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Translating spinner */}
        <AnimatePresence>
          {isTranslating && (
            <motion.div
              data-ocid="translator.loading_state"
              key="translating"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 justify-center"
            >
              <Loader2
                size={16}
                className="animate-spin"
                style={{ color: teal }}
              />
              <span
                className="text-sm"
                style={{ color: "oklch(0.55 0.015 200)" }}
              >
                Translating &amp; sending...
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Speaking indicator */}
        <AnimatePresence>
          {isSpeaking && (
            <motion.div
              key="speaking"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 justify-center"
            >
              <WaveformBars color={teal} />
              <span className="text-xs" style={{ color: teal }}>
                Playing translation...
              </span>
              <WaveformBars color={teal} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* My mic button */}
        <div className="flex justify-center pt-2">
          {renderMicButton(myDirection, remoteCtx)}
        </div>

        {/* Conversation */}
        {renderHistoryPanel()}

        {/* Leave */}
        <Button
          data-ocid="room.leave.button"
          onClick={handleLeaveRoom}
          variant="ghost"
          className="w-full h-10 rounded-2xl text-sm mt-2"
          style={{
            color: "oklch(0.55 0.2 25)",
            border: "1px solid oklch(0.3 0.1 25 / 0.3)",
          }}
        >
          <LogOut size={14} className="mr-2" />
          Leave Room
        </Button>
      </motion.div>
    );
  }

  function renderLocalMode() {
    return (
      <motion.div
        key="local-mode"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -12 }}
        className="w-full max-w-sm flex flex-col gap-5"
      >
        <button
          type="button"
          data-ocid="nav.back.button"
          onClick={() => {
            stopRecognition();
            window.speechSynthesis?.cancel();
            setListenState("idle");
            setMode("select");
          }}
          className="flex items-center gap-1.5 text-xs self-start transition-opacity hover:opacity-70"
          style={{ color: "oklch(0.5 0.015 200)" }}
        >
          ← Back
        </button>

        {/* Listening indicator */}
        <AnimatePresence>
          {isListening && (
            <motion.div
              data-ocid="translator.loading_state"
              key="listening-indicator"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="flex flex-col items-center gap-2"
            >
              <div
                className="flex items-center gap-3 px-5 py-2.5 rounded-full"
                style={{
                  background: "oklch(0.17 0.015 200)",
                  border: `1px solid ${isListeningZh ? teal : green}33`,
                }}
              >
                <WaveformBars color={isListeningZh ? teal : green} />
                <span
                  className="text-sm font-medium"
                  style={{ color: isListeningZh ? teal : green }}
                >
                  {isListeningZh
                    ? "Listening in Chinese..."
                    : "हिंदी सुन रहे हैं..."}
                </span>
                <WaveformBars color={isListeningZh ? teal : green} />
              </div>
              {interimText && (
                <p
                  className="text-sm text-center px-4"
                  style={{ color: "oklch(0.65 0.015 200)" }}
                >
                  {interimText}
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Two mic buttons */}
        <div className="grid grid-cols-2 gap-4">
          {renderMicButton("zh-hi")}
          {renderMicButton("hi-zh")}
        </div>

        {/* Translating */}
        <AnimatePresence>
          {isTranslating && (
            <motion.div
              data-ocid="translator.loading_state"
              key="translating"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 justify-center"
            >
              <Loader2
                size={16}
                className="animate-spin"
                style={{ color: teal }}
              />
              <span
                className="text-sm"
                style={{ color: "oklch(0.55 0.015 200)" }}
              >
                Translating...
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Speaking indicator */}
        <AnimatePresence>
          {isSpeaking && (
            <motion.div
              key="speaking"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2 justify-center"
            >
              <WaveformBars color={teal} />
              <span className="text-xs" style={{ color: teal }}>
                🔊 Playing...
              </span>
              <WaveformBars color={teal} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Latest translation */}
        <AnimatePresence>
          {history.length > 0 && listenState === "idle" && !isSpeaking && (
            <motion.div
              key="latest-result"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              className="rounded-2xl p-4"
              style={{
                background: "oklch(0.14 0.016 200)",
                border: `1px solid ${history[history.length - 1]?.direction === "zh-hi" ? "oklch(0.65 0.22 155 / 0.35)" : "oklch(0.72 0.19 195 / 0.35)"}`,
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <span>
                  {history[history.length - 1]?.direction === "zh-hi"
                    ? "🇮🇳"
                    : "🇨🇳"}
                </span>
                <span
                  className="text-[10px] font-bold uppercase tracking-widest"
                  style={{
                    color:
                      history[history.length - 1]?.direction === "zh-hi"
                        ? green
                        : teal,
                  }}
                >
                  Translation
                </span>
              </div>
              <p
                className="text-lg leading-relaxed font-medium"
                style={{ color: "oklch(0.94 0.01 200)" }}
              >
                {history[history.length - 1]?.translatedText}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Idle hint */}
        <AnimatePresence>
          {listenState === "idle" && history.length === 0 && (
            <motion.p
              key="hint"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-sm text-center max-w-xs"
              style={{
                color: "oklch(0.38 0.01 200)",
                fontFamily: "Outfit, sans-serif",
              }}
            >
              Tap a mic button to speak. Pass the phone after each turn.
            </motion.p>
          )}
        </AnimatePresence>

        {/* History */}
        <AnimatePresence>{renderHistoryPanel()}</AnimatePresence>
      </motion.div>
    );
  }

  // ─── Main render ─────────────────────────────────────────────────────────

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "oklch(0.11 0.008 200)" }}
    >
      <Toaster position="top-center" richColors />

      {/* Ambient glow */}
      <div
        className="fixed inset-0 pointer-events-none overflow-hidden"
        aria-hidden="true"
      >
        <div
          className="absolute top-[-15%] left-1/2 -translate-x-1/2 w-[700px] h-[500px] rounded-full"
          style={{
            background:
              "radial-gradient(ellipse, oklch(0.72 0.19 195 / 0.10) 0%, transparent 65%)",
          }}
        />
        <div
          className="absolute bottom-[-10%] left-[10%] w-[400px] h-[400px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, oklch(0.65 0.22 155 / 0.07) 0%, transparent 65%)",
          }}
        />
      </div>

      {/* Header */}
      <header className="relative z-10 pt-10 pb-2 px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <div className="flex items-center justify-center gap-3 mb-1">
            <span className="text-2xl">🇨🇳</span>
            <h1
              className="text-3xl font-bold tracking-tight"
              style={{
                fontFamily: "Bricolage Grotesque, sans-serif",
                color: "oklch(0.95 0.01 200)",
              }}
            >
              <span style={{ color: teal }}>Vormo</span>
            </h1>
            <span className="text-2xl">🇮🇳</span>
          </div>
          <p
            className="text-xs tracking-[0.22em] uppercase"
            style={{
              color: "oklch(0.48 0.015 200)",
              fontFamily: "Outfit, sans-serif",
            }}
          >
            Chinese · Hindi Voice Translator
          </p>
          <div
            className="mx-auto mt-3 h-px w-20"
            style={{
              background: `linear-gradient(90deg, ${teal}, ${green})`,
              opacity: 0.5,
            }}
          />
        </motion.div>
      </header>

      {/* Main */}
      <main className="relative z-10 flex-1 flex flex-col items-center px-5 pb-10 gap-5 pt-6">
        {/* Speech not supported */}
        {!SPEECH_SUPPORTED && (
          <motion.div
            data-ocid="app.error_state"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-sm rounded-2xl p-4 flex items-start gap-3"
            style={{
              background: "oklch(0.18 0.06 25 / 0.5)",
              border: "1px solid oklch(0.55 0.22 25 / 0.4)",
            }}
          >
            <AlertCircle
              size={18}
              className="mt-0.5 shrink-0"
              style={{ color: "oklch(0.70 0.22 25)" }}
            />
            <p className="text-sm" style={{ color: "oklch(0.85 0.05 25)" }}>
              Your browser doesn't support Speech API. Use Chrome or Edge on
              desktop/Android.
            </p>
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          {mode === "select" && renderModeSelect()}
          {mode === "remote-setup" && renderRemoteSetup()}
          {mode === "remote-room" && renderRemoteRoom()}
          {mode === "local" && renderLocalMode()}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="relative z-10 py-5 text-center">
        <p className="text-xs" style={{ color: "oklch(0.32 0.01 200)" }}>
          © {currentYear}.{" "}
          <a
            href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(typeof window !== "undefined" ? window.location.hostname : "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline transition-colors"
            style={{ color: "oklch(0.42 0.015 200)" }}
          >
            Built with ❤️ using caffeine.ai
          </a>
        </p>
      </footer>
    </div>
  );
}
