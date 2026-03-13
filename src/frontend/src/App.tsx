import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Toaster } from "@/components/ui/sonner";
import {
  Check,
  Copy,
  Loader2,
  LogOut,
  Mic,
  MicOff,
  Volume2,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { BackendMessage, backendInterface } from "./backend.d";
import { useActor } from "./hooks/useActor";

// ─── Types ───────────────────────────────────────────────────────────────────

type Screen = "room" | "lang" | "translator";
type Language = "hindi" | "chinese";

type HistoryItem = {
  id: string;
  speaker: "me" | "them";
  original: string;
  translated: string;
  timestamp: number;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getOrCreateDeviceId(): string {
  const existing = localStorage.getItem("vormo_device_id");
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem("vormo_device_id", id);
  return id;
}

function generateRoomCode(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
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
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = lang;
  utt.rate = 0.9;
  window.speechSynthesis.speak(utt);
}

// ─── WaveformBars ─────────────────────────────────────────────────────────────

function WaveformBars() {
  return (
    <div className="flex items-center gap-[3px] h-6">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="waveform-bar w-1 rounded-full bg-primary" />
      ))}
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const { actor: _actor, isFetching } = useActor();
  const actor = _actor as unknown as backendInterface | null;

  // ── Persistent IDs ──
  const deviceId = useRef<string>(getOrCreateDeviceId());
  const [generatedCode] = useState<string>(generateRoomCode);

  // ── Screen state ──
  const [screen, setScreen] = useState<Screen>("room");
  const [roomCodeInput, setRoomCodeInput] = useState<string>("");
  const [activeRoomId, setActiveRoomId] = useState<string>("");
  const [language, setLanguage] = useState<Language | null>(null);
  const [copied, setCopied] = useState(false);

  // ── Translator state ──
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [partnerMessage, setPartnerMessage] = useState<HistoryItem | null>(
    null,
  );
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // ── Refs ──
  const lastTimestampRef = useRef<bigint>(BigInt(0));
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const micGrantedRef = useRef(false);

  // ── Language mappings ──
  const mySourceLang = language === "hindi" ? "hi-IN" : "zh-CN";
  const translateFrom = language === "hindi" ? "hi" : "zh";
  const translateTo = language === "hindi" ? "zh" : "hi";

  // ── Copy room code ──
  const handleCopy = () => {
    navigator.clipboard.writeText(generatedCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ── Room actions ──
  const handleCreateRoom = () => {
    if (!generatedCode) return;
    setActiveRoomId(generatedCode);
    setScreen("lang");
  };

  const handleJoinRoom = () => {
    const code = roomCodeInput.trim();
    if (!code || code.length < 4) {
      toast.error("Please enter a valid 4-digit room code.");
      return;
    }
    setActiveRoomId(code);
    setScreen("lang");
  };

  // ── Mic permission ──
  const requestMicPermission = async (): Promise<boolean> => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      micGrantedRef.current = true;
      return true;
    } catch {
      micGrantedRef.current = false;
      toast.error("Microphone permission denied. Please allow mic access.");
      return false;
    }
  };

  // ── Language selection ──
  const handleSelectLanguage = async (lang: Language) => {
    const granted = await requestMicPermission();
    if (!granted) return;
    setLanguage(lang);
    setScreen("translator");
  };

  // ── Polling for partner messages ──
  const pollMessages = useCallback(async () => {
    if (!actor || !activeRoomId || !language) return;
    try {
      const msgs: BackendMessage[] = await actor.getMessages(
        activeRoomId,
        deviceId.current,
        lastTimestampRef.current,
      );
      if (msgs.length === 0) return;

      const sorted = [...msgs].sort((a, b) =>
        a.timestamp < b.timestamp ? -1 : 1,
      );
      const latest = sorted[sorted.length - 1];
      lastTimestampRef.current = latest.timestamp + BigInt(1);

      for (const msg of sorted) {
        const item: HistoryItem = {
          id: `them-${msg.timestamp.toString()}`,
          speaker: "them",
          original: msg.sourceText,
          translated: msg.translatedText,
          timestamp: Number(msg.timestamp),
        };
        setHistory((prev) => {
          if (prev.some((h) => h.id === item.id)) return prev;
          return [item, ...prev].slice(0, 50);
        });
        setPartnerMessage(item);

        // Determine what language to speak the translated text in
        // Partner's sourceLang tells us what they spoke;
        // their translatedText is already in OUR language
        const speakLang = msg.sourceLang === "hi-IN" ? "zh-CN" : "hi-IN";
        speakText(msg.translatedText, speakLang);
      }
    } catch {
      // silent — network blip, retry next tick
    }
  }, [actor, activeRoomId, language]);

  // Start / stop polling when entering/leaving translator screen
  useEffect(() => {
    if (screen !== "translator" || !language || !activeRoomId) return;
    lastTimestampRef.current = BigInt(0);
    pollIntervalRef.current = setInterval(pollMessages, 1500);
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [screen, language, activeRoomId, pollMessages]);

  // ── Speech & send ──
  const handleSpeak = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    if (!micGrantedRef.current) {
      toast.error("Mic not available. Please reload and allow access.");
      return;
    }

    const SpeechRecognitionAPI =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      toast.error("Speech recognition not supported. Use Chrome.");
      return;
    }

    const recognition: SpeechRecognition = new SpeechRecognitionAPI();
    recognition.lang = mySourceLang;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognitionRef.current = recognition;

    recognition.addEventListener("start", () => setIsListening(true));
    recognition.onend = () => setIsListening(false);

    recognition.onresult = async (e: SpeechRecognitionEvent) => {
      const text = e.results[0][0].transcript;
      if (!text.trim()) return;

      setIsProcessing(true);
      try {
        const translated = await translateText(
          text,
          translateFrom,
          translateTo,
        );

        const item: HistoryItem = {
          id: `me-${Date.now()}`,
          speaker: "me",
          original: text,
          translated,
          timestamp: Date.now(),
        };
        setHistory((prev) => [item, ...prev].slice(0, 50));

        if (actor) {
          await actor.postMessage(
            activeRoomId,
            deviceId.current,
            mySourceLang,
            text,
            translated,
          );
        }
        // Do NOT speak own translation back to self
      } catch {
        toast.error("Translation failed. Check your connection.");
      } finally {
        setIsProcessing(false);
      }
    };

    recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
      if (e.error !== "aborted") toast.error(`Recognition error: ${e.error}`);
      setIsListening(false);
    };

    // Synchronous start — no await before this
    recognition.start();
  };

  // ── Leave / reset ──
  const handleLeave = () => {
    recognitionRef.current?.stop();
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    micGrantedRef.current = false;
    setScreen("room");
    setLanguage(null);
    setActiveRoomId("");
    setRoomCodeInput("");
    setIsListening(false);
    setIsProcessing(false);
    setHistory([]);
    setPartnerMessage(null);
    lastTimestampRef.current = BigInt(0);
  };

  const isConnecting = isFetching;

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Toaster position="top-center" />

      {/* ── Header ── */}
      <header className="px-4 pt-6 pb-2 flex items-center justify-between max-w-md mx-auto w-full">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center">
            <Volume2 className="w-4 h-4 text-primary" />
          </div>
          <span className="font-display text-lg font-bold tracking-tight text-foreground">
            Vormo
          </span>
        </div>
        <div className="flex items-center gap-2">
          {screen === "translator" && activeRoomId && (
            <Badge
              variant="outline"
              className="font-mono text-xs border-border text-muted-foreground"
            >
              Room {activeRoomId}
            </Badge>
          )}
          {screen !== "room" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLeave}
              data-ocid="translator.leave_button"
              className="text-muted-foreground hover:text-foreground text-xs gap-1"
            >
              <LogOut className="w-3 h-3" />
              Leave
            </Button>
          )}
        </div>
      </header>

      {/* ── Main ── */}
      <main className="flex-1 flex flex-col items-center">
        <AnimatePresence mode="wait">
          {/* ════════ Screen 1 — Room Setup ════════ */}
          {screen === "room" && (
            <motion.div
              key="room"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -24 }}
              transition={{ duration: 0.35 }}
              className="w-full max-w-sm px-6 pt-8 pb-4 flex flex-col gap-8"
            >
              <div className="text-center space-y-2">
                <h1 className="font-display text-4xl font-bold text-foreground tracking-tight">
                  Connect
                </h1>
                <p className="text-muted-foreground text-sm">
                  Share your code or enter your partner's
                </p>
              </div>

              {/* Generated room code display */}
              <div className="rounded-2xl bg-card border border-border p-5 space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
                  Your Room Code
                </p>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-5xl font-bold text-foreground tracking-widest flex-1">
                    {generatedCode}
                  </span>
                  <button
                    onClick={handleCopy}
                    data-ocid="room.copy_button"
                    className="w-10 h-10 rounded-xl bg-muted hover:bg-primary/20 border border-border hover:border-primary/40 flex items-center justify-center transition-all"
                    type="button"
                    aria-label="Copy room code"
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-accent" />
                    ) : (
                      <Copy className="w-4 h-4 text-muted-foreground" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground/60">
                  Share this code with your partner
                </p>
                <Button
                  onClick={handleCreateRoom}
                  data-ocid="room.create_button"
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl font-semibold"
                >
                  Create Room
                </Button>
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground/50">
                  or enter theirs
                </span>
                <div className="flex-1 h-px bg-border" />
              </div>

              {/* Join existing room */}
              <div className="space-y-3">
                <Input
                  placeholder="Partner's 4-digit code"
                  value={roomCodeInput}
                  onChange={(e) =>
                    setRoomCodeInput(
                      e.target.value.replace(/\D/g, "").slice(0, 4),
                    )
                  }
                  data-ocid="room.code_input"
                  maxLength={4}
                  inputMode="numeric"
                  className="text-center font-mono text-2xl tracking-widest h-14 rounded-xl bg-card border-border focus:border-primary/50"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleJoinRoom();
                  }}
                />
                <Button
                  variant="outline"
                  onClick={handleJoinRoom}
                  data-ocid="room.join_button"
                  className="w-full rounded-xl border-border hover:border-primary/40 hover:bg-primary/5 font-semibold"
                >
                  Join Room
                </Button>
              </div>
            </motion.div>
          )}

          {/* ════════ Screen 2 — Language Selection ════════ */}
          {screen === "lang" && (
            <motion.div
              key="lang"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.35 }}
              className="w-full max-w-sm px-6 pt-8 pb-4 flex flex-col gap-8"
            >
              <div className="flex flex-col items-center gap-3">
                <Badge
                  variant="outline"
                  className="font-mono text-sm border-primary/30 text-primary bg-primary/10 px-4 py-1.5"
                >
                  Room {activeRoomId}
                </Badge>
                <h2 className="font-display text-3xl font-bold text-foreground tracking-tight text-center">
                  Choose your language
                </h2>
                <p className="text-muted-foreground text-sm text-center">
                  Which language will you speak?
                </p>
              </div>

              <div className="space-y-3">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => handleSelectLanguage("hindi")}
                  data-ocid="lang.hindi_button"
                  className="w-full rounded-2xl bg-card border border-border hover:border-primary/50 hover:bg-primary/5 transition-all p-5 flex items-center gap-4 text-left"
                >
                  <span className="text-4xl">🇮🇳</span>
                  <div>
                    <div className="text-foreground font-semibold text-lg leading-tight">
                      Hindi बोलूँगा
                    </div>
                    <div className="text-muted-foreground text-xs mt-0.5">
                      I will speak Hindi → translated to Chinese
                    </div>
                  </div>
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => handleSelectLanguage("chinese")}
                  data-ocid="lang.chinese_button"
                  className="w-full rounded-2xl bg-card border border-border hover:border-accent/50 hover:bg-accent/5 transition-all p-5 flex items-center gap-4 text-left"
                >
                  <span className="text-4xl">🇨🇳</span>
                  <div>
                    <div className="text-foreground font-semibold text-lg leading-tight">
                      Chinese 说
                    </div>
                    <div className="text-muted-foreground text-xs mt-0.5">
                      I will speak Chinese → translated to Hindi
                    </div>
                  </div>
                </motion.button>
              </div>

              <p className="text-xs text-muted-foreground/50 text-center">
                Mic permission will be requested after your selection.
              </p>
            </motion.div>
          )}

          {/* ════════ Screen 3 — Translator ════════ */}
          {screen === "translator" && language && (
            <motion.div
              key="translator"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.35 }}
              className="w-full max-w-md px-4 pb-4 flex flex-col gap-4"
            >
              {/* Top badges */}
              <div className="flex items-center justify-between pt-2 flex-wrap gap-2">
                <Badge
                  variant="outline"
                  className={`text-xs px-3 py-1 font-medium ${
                    language === "hindi"
                      ? "border-primary/40 text-primary bg-primary/10"
                      : "border-accent/40 text-accent bg-accent/10"
                  }`}
                >
                  {language === "hindi"
                    ? "🇮🇳 Speaking Hindi"
                    : "🇨🇳 Speaking Chinese"}
                </Badge>
                {isConnecting ? (
                  <div
                    data-ocid="translator.loading_state"
                    className="flex items-center gap-1.5 text-xs text-muted-foreground"
                  >
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Connecting…
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                    Live
                  </div>
                )}
              </div>

              {/* Mic button */}
              <div className="flex flex-col items-center justify-center py-6 gap-4">
                <div className="relative">
                  {isListening && (
                    <>
                      <span
                        className="absolute inset-0 rounded-full"
                        style={{
                          animation: "pulse-ring 1.4s ease-out infinite",
                          background: "oklch(var(--primary) / 0.2)",
                        }}
                      />
                      <span
                        className="absolute inset-0 rounded-full"
                        style={{
                          animation: "pulse-ring-2 1.4s ease-out 0.4s infinite",
                          background: "oklch(var(--primary) / 0.12)",
                        }}
                      />
                    </>
                  )}
                  <motion.button
                    whileTap={{ scale: 0.93 }}
                    onClick={handleSpeak}
                    data-ocid="translator.speak_button"
                    disabled={isProcessing || isConnecting}
                    className={`relative w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 shadow-glow ${
                      isListening
                        ? "bg-destructive text-destructive-foreground"
                        : isProcessing
                          ? "bg-muted text-muted-foreground"
                          : "bg-primary text-primary-foreground hover:bg-primary/90"
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                    aria-label={
                      isListening ? "Stop listening" : "Start speaking"
                    }
                  >
                    {isListening ? (
                      <MicOff className="w-9 h-9" />
                    ) : isProcessing ? (
                      <Loader2 className="w-8 h-8 animate-spin" />
                    ) : (
                      <Mic className="w-9 h-9" />
                    )}
                  </motion.button>
                </div>

                <p className="text-xs text-muted-foreground">
                  {isListening
                    ? "Listening… tap to stop"
                    : isProcessing
                      ? "Translating…"
                      : "Tap to speak"}
                </p>

                {isListening && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                  >
                    <WaveformBars />
                  </motion.div>
                )}
              </div>

              {/* Partner message panel */}
              <motion.div
                data-ocid="translator.partner_panel"
                className="rounded-2xl bg-card border border-border p-4 min-h-[72px]"
                animate={{
                  borderColor: partnerMessage
                    ? "oklch(var(--primary) / 0.5)"
                    : "oklch(var(--border))",
                }}
              >
                {partnerMessage ? (
                  <div className="space-y-1">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">
                      Partner said
                    </p>
                    <p className="text-foreground text-sm">
                      {partnerMessage.original}
                    </p>
                    <p className="text-primary text-base font-semibold mt-1">
                      {partnerMessage.translated}
                    </p>
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    Partner's translation will appear here…
                  </p>
                )}
              </motion.div>

              {/* Conversation history */}
              <div className="flex-1 flex flex-col min-h-0">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-2">
                  Conversation
                </p>
                <ScrollArea className="h-64 rounded-xl">
                  <AnimatePresence initial={false}>
                    {history.length === 0 ? (
                      <motion.div
                        key="empty"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        data-ocid="translator.empty_state"
                        className="py-8 text-center text-muted-foreground/50 text-sm"
                      >
                        No messages yet. Start speaking!
                      </motion.div>
                    ) : (
                      history.map((item, index) => (
                        <motion.div
                          key={item.id}
                          initial={{
                            opacity: 0,
                            x: item.speaker === "me" ? 20 : -20,
                          }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.25 }}
                          data-ocid={`translator.item.${index + 1}`}
                          className={`mb-3 flex ${
                            item.speaker === "me"
                              ? "justify-end"
                              : "justify-start"
                          }`}
                        >
                          <div
                            className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                              item.speaker === "me"
                                ? "bg-primary/20 border border-primary/30"
                                : "bg-card border border-border"
                            }`}
                          >
                            <p className="text-[10px] text-muted-foreground mb-1">
                              {item.speaker === "me" ? "You" : "Partner"}
                            </p>
                            <p className="text-foreground text-sm">
                              {item.original}
                            </p>
                            <p className="text-muted-foreground text-xs mt-1 font-medium">
                              → {item.translated}
                            </p>
                          </div>
                        </motion.div>
                      ))
                    )}
                  </AnimatePresence>
                </ScrollArea>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* ── Footer ── */}
      <footer className="py-4 text-center">
        <p className="text-[11px] text-muted-foreground/40">
          {"© "}
          {new Date().getFullYear()}
          {". Built with ♥ using "}
          <a
            href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-muted-foreground/70 transition-colors"
          >
            caffeine.ai
          </a>
        </p>
      </footer>
    </div>
  );
}
