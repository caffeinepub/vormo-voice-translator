import { Button } from "@/components/ui/button";
import {
  AlertCircle,
  ArrowLeftRight,
  Loader2,
  Mic,
  MicOff,
  Volume2,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

type AppState = "idle" | "listening" | "translating" | "done" | "error";
type Direction = "hi-zh" | "zh-hi";

const SPEECH_SUPPORTED =
  typeof window !== "undefined" &&
  ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

const DIRECTION_CONFIG = {
  "hi-zh": {
    speechLang: "hi-IN",
    langpair: "hi|zh",
    ttsLang: "zh-CN",
    ttsPredicate: (v: SpeechSynthesisVoice) =>
      v.lang.startsWith("zh") || v.lang.startsWith("cmn"),
    sourceLabel: "Hindi Speech",
    sourceFlag: "🇮🇳",
    targetLabel: "Chinese Translation",
    targetFlag: "🇨🇳",
    sourcePlaceholder: "आप जो बोलेंगे यहाँ दिखेगा",
    targetPlaceholder: "यहाँ Chinese translation दिखेगा",
    sourceAccent: "oklch(0.72 0.19 195)",
    targetAccent: "oklch(0.65 0.22 150)",
  },
  "zh-hi": {
    speechLang: "zh-CN",
    langpair: "zh|hi",
    ttsLang: "hi-IN",
    ttsPredicate: (v: SpeechSynthesisVoice) => v.lang.startsWith("hi"),
    sourceLabel: "Chinese Speech",
    sourceFlag: "🇨🇳",
    targetLabel: "Hindi Translation",
    targetFlag: "🇮🇳",
    sourcePlaceholder: "您说的话会显示在这里",
    targetPlaceholder: "हिंदी अनुवाद यहाँ दिखेगा",
    sourceAccent: "oklch(0.65 0.22 150)",
    targetAccent: "oklch(0.72 0.19 195)",
  },
};

export default function App() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [direction, setDirection] = useState<Direction>("hi-zh");
  const [sourceText, setSourceText] = useState("");
  const [targetText, setTargetText] = useState("");
  const [interimText, setInterimText] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const translatedRef = useRef(false); // guard against double-translate
  const directionRef = useRef<Direction>(direction);
  directionRef.current = direction;

  const stopRecognition = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopRecognition();
      window.speechSynthesis?.cancel();
    };
  }, [stopRecognition]);

  const translate = useCallback(async (text: string, dir: Direction) => {
    if (!text.trim()) return;
    setAppState("translating");
    const config = DIRECTION_CONFIG[dir];
    try {
      const res = await fetch(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${config.langpair}`,
      );
      const data = await res.json();
      const translated = data?.responseData?.translatedText;
      if (translated) {
        setTargetText(translated);
        setAppState("done");
      } else {
        throw new Error("No translation");
      }
    } catch {
      setAppState("error");
    }
  }, []);

  const startListening = useCallback(
    (dir: Direction) => {
      if (!SPEECH_SUPPORTED) {
        setAppState("error");
        return;
      }

      setSourceText("");
      setTargetText("");
      setInterimText("");
      translatedRef.current = false;
      setAppState("listening");

      const config = DIRECTION_CONFIG[dir];
      const SpeechRecognitionCtor =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognitionCtor();
      recognition.lang = config.speechLang;
      recognition.interimResults = true;
      recognition.continuous = false; // stop after one utterance

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = "";
        let finalTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interim += transcript;
          }
        }

        if (finalTranscript) {
          setSourceText(finalTranscript);
          setInterimText("");
          // Trigger translation immediately and guard onend from firing again
          if (!translatedRef.current) {
            translatedRef.current = true;
            recognition.stop();
            translate(finalTranscript, directionRef.current);
          }
        } else {
          setInterimText(interim);
        }
      };

      recognition.onend = () => {
        setInterimText("");
        // Only translate here if onresult never produced a final result
        // (e.g. user manually stopped before a final result came in)
        if (!translatedRef.current) {
          // nothing recognized — go back to idle
          setAppState("idle");
        }
        recognitionRef.current = null;
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event.error !== "no-speech" && event.error !== "aborted") {
          setAppState("error");
        } else if (!translatedRef.current) {
          setAppState("idle");
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    },
    [translate],
  );

  const stopListening = useCallback(() => {
    stopRecognition();
  }, [stopRecognition]);

  const handleMicClick = useCallback(() => {
    if (appState === "listening") {
      stopListening();
    } else if (
      appState === "idle" ||
      appState === "done" ||
      appState === "error"
    ) {
      startListening(direction);
    }
  }, [appState, direction, startListening, stopListening]);

  const handleSwap = useCallback(() => {
    // Stop any ongoing recognition
    stopRecognition();
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
    // Clear state and flip direction
    setSourceText("");
    setTargetText("");
    setInterimText("");
    translatedRef.current = false;
    setAppState("idle");
    setDirection((prev) => (prev === "hi-zh" ? "zh-hi" : "hi-zh"));
  }, [stopRecognition]);

  const handlePlayVoice = useCallback(() => {
    if (!targetText || isSpeaking) return;
    window.speechSynthesis.cancel();
    const config = DIRECTION_CONFIG[direction];
    const utter = new SpeechSynthesisUtterance(targetText);
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find(config.ttsPredicate);
    if (voice) utter.voice = voice;
    utter.lang = config.ttsLang;
    utter.rate = 0.9;
    utter.onstart = () => setIsSpeaking(true);
    utter.onend = () => setIsSpeaking(false);
    utter.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utter);
  }, [targetText, isSpeaking, direction]);

  const isListening = appState === "listening";
  const isTranslating = appState === "translating";
  const isBusy = isListening || isTranslating;
  const hasTranslation = !!targetText && appState === "done";
  const isError = appState === "error";

  const micLabel = isListening
    ? "Tap to Stop"
    : isTranslating
      ? "Translating..."
      : "Tap to Speak";

  const currentYear = new Date().getFullYear();
  const config = DIRECTION_CONFIG[direction];

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "oklch(0.11 0.008 260)" }}
    >
      {/* Ambient background orb */}
      <div
        className="fixed inset-0 pointer-events-none overflow-hidden"
        aria-hidden="true"
      >
        <div
          className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, oklch(0.72 0.19 195 / 0.12) 0%, transparent 70%)",
          }}
        />
      </div>

      {/* Header */}
      <header className="relative z-10 pt-10 pb-4 px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <h1
            className="text-4xl font-bold tracking-tight"
            style={{
              fontFamily: "Bricolage Grotesque, sans-serif",
              color: "oklch(0.95 0.01 260)",
            }}
          >
            <span style={{ color: "oklch(0.72 0.19 195)" }}>Vormo</span>
          </h1>
          <p
            className="text-sm mt-1 tracking-widest uppercase"
            style={{
              color: "oklch(0.60 0.02 260)",
              fontFamily: "Outfit, sans-serif",
            }}
          >
            Voice Translator
          </p>
          <div
            className="mx-auto mt-3 h-px w-16"
            style={{ background: "oklch(0.72 0.19 195 / 0.4)" }}
          />
        </motion.div>
      </header>

      {/* Main */}
      <main className="relative z-10 flex-1 flex flex-col items-center px-5 pb-10 gap-6">
        {/* Browser compatibility error */}
        {!SPEECH_SUPPORTED && (
          <motion.div
            data-ocid="app.error_state"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-sm mt-4 rounded-2xl p-4 flex items-start gap-3"
            style={{
              background: "oklch(0.20 0.06 25 / 0.4)",
              border: "1px solid oklch(0.60 0.22 25 / 0.4)",
            }}
          >
            <AlertCircle
              className="mt-0.5 shrink-0"
              size={18}
              style={{ color: "oklch(0.70 0.22 25)" }}
            />
            <p className="text-sm" style={{ color: "oklch(0.85 0.05 25)" }}>
              Your browser doesn't support the Web Speech API. Please try Chrome
              or Edge on desktop or Android.
            </p>
          </motion.div>
        )}

        {/* Error state (runtime) */}
        <AnimatePresence>
          {isError && SPEECH_SUPPORTED && (
            <motion.div
              data-ocid="app.error_state"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm rounded-2xl p-4 flex items-start gap-3"
              style={{
                background: "oklch(0.20 0.06 25 / 0.4)",
                border: "1px solid oklch(0.60 0.22 25 / 0.4)",
              }}
            >
              <AlertCircle
                className="mt-0.5 shrink-0"
                size={18}
                style={{ color: "oklch(0.70 0.22 25)" }}
              />
              <p className="text-sm" style={{ color: "oklch(0.85 0.05 25)" }}>
                Something went wrong. Please check your microphone permissions
                and try again.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mic button */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2, ease: "easeOut" }}
          className="mt-4 flex flex-col items-center gap-4"
        >
          <div className="relative flex items-center justify-center">
            {isListening && (
              <>
                <span
                  className="absolute inset-0 rounded-full"
                  style={{
                    animation: "pulse-ring 1.5s ease-out infinite",
                    background: "oklch(0.72 0.19 195 / 0.35)",
                  }}
                />
                <span
                  className="absolute inset-0 rounded-full"
                  style={{
                    animation: "pulse-ring-2 1.5s ease-out 0.5s infinite",
                    background: "oklch(0.72 0.19 195 / 0.2)",
                  }}
                />
              </>
            )}

            <button
              type="button"
              data-ocid="mic.primary_button"
              onClick={handleMicClick}
              disabled={isTranslating}
              aria-label={micLabel}
              className="relative z-10 rounded-full flex items-center justify-center transition-all duration-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                width: "120px",
                height: "120px",
                background: isListening
                  ? "oklch(0.72 0.19 195)"
                  : "oklch(0.20 0.015 260)",
                border: isListening
                  ? "3px solid oklch(0.85 0.15 195)"
                  : "2px solid oklch(0.30 0.02 260)",
                boxShadow: isListening
                  ? "0 0 40px oklch(0.72 0.19 195 / 0.5), 0 0 80px oklch(0.72 0.19 195 / 0.25)"
                  : "0 8px 32px oklch(0 0 0 / 0.4)",
              }}
            >
              {isTranslating ? (
                <Loader2
                  size={40}
                  className="animate-spin"
                  style={{ color: "oklch(0.72 0.19 195)" }}
                />
              ) : isListening ? (
                <MicOff size={40} style={{ color: "oklch(0.08 0.01 260)" }} />
              ) : (
                <Mic size={40} style={{ color: "oklch(0.72 0.19 195)" }} />
              )}
            </button>
          </div>

          <motion.p
            key={micLabel}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-sm font-medium tracking-wide"
            style={{
              color: isListening
                ? "oklch(0.72 0.19 195)"
                : "oklch(0.60 0.02 260)",
            }}
          >
            {micLabel}
          </motion.p>
        </motion.div>

        {/* Cards */}
        <div className="w-full max-w-sm flex flex-col gap-3">
          {/* Source Card */}
          <motion.div
            data-ocid="source.section"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="rounded-2xl p-5"
            style={{
              background: "oklch(0.16 0.012 260)",
              border: "1px solid oklch(0.25 0.015 260)",
            }}
          >
            <div className="flex items-center gap-2 mb-3">
              <span
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: config.sourceAccent }}
              >
                {config.sourceLabel}
              </span>
              <div
                className="flex-1 h-px"
                style={{
                  background: `${config.sourceAccent.replace(")", " / 0.2)")}`,
                }}
              />
              <span className="text-base">{config.sourceFlag}</span>
            </div>
            <p
              className="text-base leading-relaxed min-h-[3rem]"
              style={{
                fontFamily: "Outfit, sans-serif",
                color:
                  sourceText || interimText
                    ? "oklch(0.92 0.01 260)"
                    : "oklch(0.40 0.015 260)",
                fontSize: "1.05rem",
              }}
            >
              {sourceText
                ? sourceText + (interimText ? ` ${interimText}` : "")
                : interimText || config.sourcePlaceholder}
              {isListening && !sourceText && !interimText && (
                <span style={{ color: "oklch(0.72 0.19 195 / 0.7)" }}>▌</span>
              )}
            </p>
          </motion.div>

          {/* Swap Button */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4 }}
            className="flex items-center justify-center gap-3"
          >
            <div
              className="flex-1 h-px"
              style={{ background: "oklch(0.22 0.015 260)" }}
            />
            <button
              type="button"
              data-ocid="swap.toggle"
              onClick={handleSwap}
              disabled={isBusy}
              aria-label="Swap translation direction"
              className="flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-200 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: "oklch(0.18 0.015 260)",
                border: "1px solid oklch(0.32 0.04 195)",
                color: "oklch(0.72 0.19 195)",
                boxShadow: "0 2px 12px oklch(0.72 0.19 195 / 0.12)",
              }}
            >
              <span
                className="text-xs font-medium"
                style={{
                  fontFamily: "Outfit, sans-serif",
                  color: "oklch(0.65 0.02 260)",
                }}
              >
                {direction === "hi-zh" ? "हि" : "中"}
              </span>
              <ArrowLeftRight size={14} />
              <span
                className="text-xs font-medium"
                style={{
                  fontFamily: "Outfit, sans-serif",
                  color: "oklch(0.65 0.02 260)",
                }}
              >
                {direction === "hi-zh" ? "中" : "हि"}
              </span>
            </button>
            <div
              className="flex-1 h-px"
              style={{ background: "oklch(0.22 0.015 260)" }}
            />
          </motion.div>

          {/* Target Card */}
          <motion.div
            data-ocid="target.section"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45 }}
            className="rounded-2xl p-5"
            style={{
              background: "oklch(0.16 0.012 260)",
              border: "1px solid oklch(0.25 0.015 260)",
            }}
          >
            <div className="flex items-center gap-2 mb-3">
              <span
                className="text-xs font-semibold uppercase tracking-widest"
                style={{ color: config.targetAccent }}
              >
                {config.targetLabel}
              </span>
              <div
                className="flex-1 h-px"
                style={{
                  background: `${config.targetAccent.replace(")", " / 0.2)")}`,
                }}
              />
              <span className="text-base">{config.targetFlag}</span>
            </div>

            {isTranslating ? (
              <div className="flex items-center gap-2 min-h-[3rem]">
                <Loader2
                  size={16}
                  className="animate-spin"
                  style={{ color: config.targetAccent }}
                />
                <span
                  className="text-sm"
                  style={{ color: "oklch(0.55 0.02 260)" }}
                >
                  Translating...
                </span>
              </div>
            ) : (
              <p
                className="text-base leading-relaxed min-h-[3rem]"
                style={{
                  fontFamily: "Outfit, sans-serif",
                  color: targetText
                    ? "oklch(0.92 0.01 260)"
                    : "oklch(0.40 0.015 260)",
                  fontSize: "1.15rem",
                }}
              >
                {targetText || config.targetPlaceholder}
              </p>
            )}
          </motion.div>

          {/* Play Voice Button */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55 }}
          >
            <Button
              data-ocid="play.primary_button"
              onClick={handlePlayVoice}
              disabled={!hasTranslation || isBusy}
              className="w-full h-13 text-base font-semibold tracking-wide rounded-2xl transition-all duration-200 disabled:opacity-40"
              style={{
                background:
                  hasTranslation && !isBusy
                    ? config.targetAccent
                    : "oklch(0.22 0.015 260)",
                color:
                  hasTranslation && !isBusy
                    ? "oklch(0.08 0.01 260)"
                    : "oklch(0.50 0.02 260)",
                border: "none",
                boxShadow:
                  hasTranslation && !isBusy
                    ? `0 0 24px ${config.targetAccent.replace(")", " / 0.35)")}`
                    : "none",
              }}
            >
              {isSpeaking ? (
                <>
                  <Volume2 size={20} className="mr-2 animate-pulse" />
                  Speaking...
                </>
              ) : (
                <>
                  <span className="mr-2">🔊</span>
                  Play Voice
                </>
              )}
            </Button>
          </motion.div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 py-5 text-center">
        <p className="text-xs" style={{ color: "oklch(0.35 0.01 260)" }}>
          © {currentYear}.{" "}
          <a
            href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(typeof window !== "undefined" ? window.location.hostname : "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline"
            style={{ color: "oklch(0.45 0.02 260)" }}
          >
            Built with ❤️ using caffeine.ai
          </a>
        </p>
      </footer>
    </div>
  );
}
