import RiyazPanel from "@/components/RiyazPanel";
import { Badge } from "@/components/ui/badge";
import { BookOpen, ChevronUp, GraduationCap, Music2, User } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

type Mode = "student" | "teacher";

const lessons = [
  {
    letter: "A",
    soundType: "Open vowel sound",
    question:
      "If the sound type is A (open vowel sound), how should I sing the starting line of a song?",
    answer: "Use an open, bright tone with a relaxed mouth.",
    example: "Ah\u2026 the sky is so wide, my heart wants to fly.",
  },
  {
    letter: "B",
    soundType: "Soft voiced consonant",
    question: "How should the B sound be used in singing?",
    answer: "Use a soft and warm voiced tone.",
    example: "Baby don\u2019t worry, I\u2019m always here.",
  },
  {
    letter: "C",
    soundType: "C sharp sound",
    question: "What tone suits the C sharp sound?",
    answer: "Use a clear and energetic voice.",
    example: "City lights shine as the morning begins.",
  },
  {
    letter: "D",
    soundType: "Deep consonant",
    question: "How should a deep D sound be sung?",
    answer: "Use a deeper and steady tone.",
    example: "Dreams rise slowly from the ground.",
  },
  {
    letter: "E",
    soundType: "Light vowel",
    question: "What tone should E light vowel use?",
    answer: "Use a light and bright voice.",
    example: "Every day brings a new hope.",
  },
  {
    letter: "F",
    soundType: "Air friction sound",
    question: "How should F air friction sound be expressed?",
    answer: "Add a little breath in the voice.",
    example: "Feel the wind across my face.",
  },
  {
    letter: "G",
    soundType: "Strong consonant",
    question: "How should the strong G sound be sung?",
    answer: "Use a confident and powerful tone.",
    example: "Glory waits beyond the road.",
  },
  {
    letter: "H",
    soundType: "Breath sound",
    question: "What about the H breath sound?",
    answer: "Use a soft breathy tone.",
    example: "Hearts whisper in the night.",
  },
  {
    letter: "I",
    soundType: "Thin vowel",
    question: "How should the thin I vowel sound be sung?",
    answer: "Use a delicate and gentle tone.",
    example: "I see your smile in the light.",
  },
  {
    letter: "J",
    soundType: "Rhythmic consonant",
    question: "How should the J sound be expressed?",
    answer: "Use a rhythmic and lively voice.",
    example: "Joy is dancing in the air.",
  },
  {
    letter: "K",
    soundType: "Sharp consonant",
    question: "How should the sharp K sound be sung?",
    answer: "Use a clear and strong tone.",
    example: "Keep running toward the light.",
  },
  {
    letter: "L",
    soundType: "Flowing consonant",
    question: "What tone suits the flowing L sound?",
    answer: "Use a smooth and flowing voice.",
    example: "Love moves like a river.",
  },
  {
    letter: "M",
    soundType: "Nasal consonant",
    question: "How should the nasal M sound be sung?",
    answer: "Use a warm humming tone.",
    example: "My dream stays close to me.",
  },
  {
    letter: "N",
    soundType: "Nasal resonance",
    question: "How should the N nasal sound be sung?",
    answer: "Use a soft nasal resonance.",
    example: "Now the night feels calm.",
  },
  {
    letter: "O",
    soundType: "Round vowel",
    question: "How should the round O vowel sound be sung?",
    answer: "Use a round and full tone.",
    example: "Oh the world is beautiful.",
  },
  {
    letter: "P",
    soundType: "Strong plosive",
    question: "How should the strong P consonant be sung?",
    answer: "Use a punchy and rhythmic tone.",
    example: "Power runs through my veins.",
  },
  {
    letter: "Q",
    soundType: "Clear rounded sound",
    question: "How should the Q sound be expressed?",
    answer: "Use a clear and rounded tone.",
    example: "Quiet morning shines again.",
  },
  {
    letter: "R",
    soundType: "Rolling consonant",
    question: "How should the rolling R sound be sung?",
    answer: "Use a rhythmic and vibrant tone.",
    example: "Running toward the rising sun.",
  },
  {
    letter: "S",
    soundType: "Sharp sibilant",
    question: "How should the sharp S sound be sung?",
    answer: "Use a soft airy tone.",
    example: "Stars are shining in the sky.",
  },
  {
    letter: "T",
    soundType: "Strong stop sound",
    question: "How should the strong T stop sound be sung?",
    answer: "Use a clear rhythmic attack.",
    example: "Tonight we touch the stars.",
  },
  {
    letter: "U",
    soundType: "Deep vowel",
    question: "How should the deep U vowel be sung?",
    answer: "Use a deep rounded tone.",
    example: "Under the moon we sing.",
  },
  {
    letter: "V",
    soundType: "Vibrating consonant",
    question: "How should the vibrating V sound be sung?",
    answer: "Use a smooth vibrating tone.",
    example: "Voices rising in the wind.",
  },
  {
    letter: "W",
    soundType: "Glide consonant",
    question: "How should the glide W sound be sung?",
    answer: "Use a smooth flowing tone.",
    example: "We walk into the dawn.",
  },
  {
    letter: "X",
    soundType: "Mixed sound",
    question: "How should the mixed X sound be sung?",
    answer: "Use a crisp energetic tone.",
    example: "X-ray lights across the night.",
  },
  {
    letter: "Y",
    soundType: "Semi-vowel",
    question: "How should the semi-vowel Y be sung?",
    answer: "Use a gentle smooth tone.",
    example: "You are the light I see.",
  },
  {
    letter: "Z",
    soundType: "Buzzing consonant",
    question: "How should the buzzing Z sound be sung?",
    answer: "Use a bright energetic tone.",
    example: "Zoom into the shining sky.",
  },
];

const badgeHues = [
  65, 45, 55, 35, 80, 170, 260, 50, 300, 130, 70, 195, 25, 220, 60, 150, 280,
  40, 170, 55, 75, 250, 185, 30, 145, 200,
];

export default function App() {
  const [activeLetter, setActiveLetter] = useState("A");
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [mode, setMode] = useState<Mode>("student");
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const observers: IntersectionObserver[] = [];

    for (let idx = 0; idx < lessons.length; idx++) {
      const lesson = lessons[idx];
      const el = cardRefs.current[idx];
      if (!el) continue;
      const obs = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              setActiveLetter(lesson.letter);
            }
          }
        },
        { rootMargin: "-40% 0px -40% 0px", threshold: 0 },
      );
      obs.observe(el);
      observers.push(obs);
    }

    return () => {
      for (const o of observers) o.disconnect();
    };
  }, []);

  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 600);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToLesson = (letter: string) => {
    const idx = lessons.findIndex((l) => l.letter === letter);
    const el = cardRefs.current[idx];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setActiveLetter(letter);
    }
  };

  const hue = badgeHues[lessons.findIndex((l) => l.letter === activeLetter)];

  return (
    <div className="relative min-h-screen">
      {/* Header */}
      <header className="relative z-10 text-center px-4 pt-16 pb-10 overflow-hidden">
        <div className="absolute inset-0 stave-lines opacity-40 pointer-events-none" />
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-48 rounded-full pointer-events-none"
          style={{
            background: `radial-gradient(ellipse, oklch(0.76 0.16 ${hue} / 0.12) 0%, transparent 70%)`,
            transition: "background 0.8s ease",
          }}
        />
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative"
        >
          <div className="flex items-center justify-center gap-3 mb-3">
            <Music2 className="w-5 h-5 text-primary opacity-60" />
            <span className="text-xs font-body tracking-[0.3em] uppercase text-muted-foreground">
              Singing Vocal Guide
            </span>
            <Music2 className="w-5 h-5 text-primary opacity-60" />
          </div>
          <h1 className="font-display text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight">
            <span
              style={{
                color: `oklch(0.88 0.12 ${hue})`,
                transition: "color 0.8s ease",
                textShadow: `0 0 40px oklch(0.76 0.16 ${hue} / 0.35)`,
              }}
            >
              A&#8211;Z
            </span>
            <span className="text-foreground"> Vocal</span>
          </h1>
          <p className="mt-3 text-muted-foreground font-body text-base sm:text-lg max-w-md mx-auto">
            Learn how to sing every sound &#8212; a complete teacher-student
            guide
          </p>
          <div className="mt-6 flex items-center justify-center gap-4">
            <div className="h-px flex-1 max-w-24 bg-gradient-to-r from-transparent to-border" />
            <BookOpen className="w-4 h-4 text-primary opacity-50" />
            <div className="h-px flex-1 max-w-24 bg-gradient-to-l from-transparent to-border" />
          </div>
        </motion.div>
      </header>

      {/* Mode Toggle */}
      <div className="relative z-10 flex justify-center px-4 pb-6">
        <div
          className="flex rounded-xl p-1 gap-1"
          style={{
            background: "oklch(0.13 0.022 35)",
            border: "1px solid oklch(0.24 0.025 40)",
            boxShadow: "0 4px 20px oklch(0 0 0 / 0.4)",
          }}
        >
          <button
            type="button"
            data-ocid="mode.student.toggle"
            onClick={() => setMode("student")}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-body font-semibold transition-all duration-200"
            style={{
              background:
                mode === "student"
                  ? "oklch(0.45 0.12 185 / 0.35)"
                  : "transparent",
              border:
                mode === "student"
                  ? "1px solid oklch(0.60 0.14 185 / 0.6)"
                  : "1px solid transparent",
              color:
                mode === "student"
                  ? "oklch(0.85 0.12 190)"
                  : "oklch(0.50 0.015 60)",
              boxShadow:
                mode === "student"
                  ? "0 0 16px oklch(0.55 0.14 185 / 0.3)"
                  : "none",
            }}
          >
            <User className="w-4 h-4" />
            Student Mode
          </button>
          <button
            type="button"
            data-ocid="mode.teacher.toggle"
            onClick={() => setMode("teacher")}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-body font-semibold transition-all duration-200"
            style={{
              background:
                mode === "teacher"
                  ? "oklch(0.50 0.16 65 / 0.35)"
                  : "transparent",
              border:
                mode === "teacher"
                  ? "1px solid oklch(0.72 0.18 65 / 0.6)"
                  : "1px solid transparent",
              color:
                mode === "teacher"
                  ? "oklch(0.88 0.14 65)"
                  : "oklch(0.50 0.015 60)",
              boxShadow:
                mode === "teacher"
                  ? "0 0 16px oklch(0.72 0.18 65 / 0.3)"
                  : "none",
            }}
          >
            <GraduationCap className="w-4 h-4" />
            Teacher Mode
          </button>
        </div>
      </div>

      {/* Mode label */}
      <div className="relative z-10 text-center mb-2 -mt-2">
        <AnimatePresence mode="wait">
          <motion.p
            key={mode}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
            className="text-xs font-body"
            style={{
              color:
                mode === "student"
                  ? "oklch(0.65 0.1 185)"
                  : "oklch(0.72 0.14 65)",
            }}
          >
            {mode === "student"
              ? "🎤 Record your singing & hear the teacher's Riyaz"
              : "👂 Hear student recordings & save your Riyaz demonstration"}
          </motion.p>
        </AnimatePresence>
      </div>

      {/* Sticky Alphabet Grid */}
      <div className="sticky top-0 z-20 bg-background/90 backdrop-blur-md border-b border-border/50 py-3 px-4 shadow-[0_4px_24px_oklch(0_0_0/0.4)]">
        <div
          data-ocid="alphabet.grid"
          className="max-w-4xl mx-auto"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(13, minmax(0, 1fr))",
            gap: "4px",
          }}
        >
          {lessons.map((lesson, idx) => {
            const isActive = activeLetter === lesson.letter;
            const h = badgeHues[idx];
            return (
              <button
                type="button"
                key={lesson.letter}
                data-ocid={`alphabet.letter.button.${idx + 1}`}
                onClick={() => scrollToLesson(lesson.letter)}
                className="flex items-center justify-center h-8 rounded-md text-sm font-bold font-display transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{
                  background: isActive
                    ? `oklch(0.76 0.16 ${h} / 0.2)`
                    : "transparent",
                  color: isActive
                    ? `oklch(0.88 0.14 ${h})`
                    : "oklch(0.55 0.015 60)",
                  border: isActive
                    ? `1px solid oklch(0.76 0.16 ${h} / 0.5)`
                    : "1px solid transparent",
                  boxShadow: isActive
                    ? `0 0 12px oklch(0.76 0.16 ${h} / 0.35)`
                    : "none",
                }}
              >
                {lesson.letter}
              </button>
            );
          })}
        </div>
      </div>

      {/* Lessons Grid */}
      <main className="relative z-10 max-w-7xl mx-auto px-4 py-10">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {lessons.map((lesson, idx) => {
            const h = badgeHues[idx];
            return (
              <motion.div
                key={lesson.letter}
                id={`lesson-${lesson.letter}`}
                data-ocid={`lesson.card.${idx + 1}`}
                ref={(el) => {
                  cardRefs.current[idx] = el;
                }}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.45, delay: (idx % 3) * 0.07 }}
                className="lesson-card rounded-xl overflow-hidden"
                style={{
                  background: "oklch(0.13 0.022 35)",
                  border: `1px solid oklch(0.76 0.16 ${h} / 0.18)`,
                  boxShadow: "0 4px 20px oklch(0 0 0 / 0.45)",
                }}
              >
                {/* Color bar */}
                <div
                  className="h-1 w-full"
                  style={{
                    background: `linear-gradient(to right, oklch(0.76 0.16 ${h} / 0.8), oklch(0.72 0.18 ${h + 20} / 0.3))`,
                  }}
                />

                <div className="p-5">
                  {/* Letter + sound type header */}
                  <div className="flex items-start gap-4 mb-5">
                    <div
                      className="flex-shrink-0 w-16 h-16 rounded-xl flex items-center justify-center font-display font-bold text-4xl"
                      style={{
                        background: `oklch(0.76 0.16 ${h} / 0.12)`,
                        border: `2px solid oklch(0.76 0.16 ${h} / 0.45)`,
                        color: `oklch(0.88 0.14 ${h})`,
                        textShadow: `0 0 20px oklch(0.76 0.16 ${h} / 0.5)`,
                      }}
                    >
                      {lesson.letter}
                    </div>
                    <div className="pt-1 min-w-0">
                      <Badge
                        className="text-xs font-body mb-1 border-0"
                        style={{
                          background: `oklch(0.76 0.16 ${h} / 0.15)`,
                          color: `oklch(0.82 0.12 ${h})`,
                        }}
                      >
                        {lesson.soundType}
                      </Badge>
                      <p className="text-xs text-muted-foreground font-body">
                        Lesson {idx + 1} of 26
                      </p>
                    </div>
                  </div>

                  {/* Student section */}
                  <div
                    className="rounded-lg p-3.5 mb-3"
                    style={{
                      background: "oklch(0.14 0.03 255 / 0.6)",
                      border: "1px solid oklch(0.28 0.05 255 / 0.4)",
                    }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: "oklch(0.45 0.08 255 / 0.4)" }}
                      >
                        <User
                          className="w-3 h-3"
                          style={{ color: "oklch(0.78 0.08 240)" }}
                        />
                      </div>
                      <span
                        className="text-xs font-bold tracking-wide uppercase font-body"
                        style={{ color: "oklch(0.65 0.07 240)" }}
                      >
                        Student asks
                      </span>
                    </div>
                    <p
                      className="text-sm font-body leading-relaxed"
                      style={{ color: "oklch(0.82 0.04 240)" }}
                    >
                      {lesson.question}
                    </p>
                  </div>

                  {/* Teacher section */}
                  <div
                    className="rounded-lg p-3.5 mb-3"
                    style={{
                      background: "oklch(0.14 0.03 155 / 0.6)",
                      border: "1px solid oklch(0.28 0.05 155 / 0.4)",
                    }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ background: "oklch(0.45 0.08 155 / 0.4)" }}
                      >
                        <GraduationCap
                          className="w-3 h-3"
                          style={{ color: "oklch(0.78 0.08 155)" }}
                        />
                      </div>
                      <span
                        className="text-xs font-bold tracking-wide uppercase font-body"
                        style={{ color: "oklch(0.65 0.07 155)" }}
                      >
                        Teacher says
                      </span>
                    </div>
                    <p
                      className="text-sm font-body leading-relaxed"
                      style={{ color: "oklch(0.82 0.04 160)" }}
                    >
                      {lesson.answer}
                    </p>
                  </div>

                  {/* Song example */}
                  <div
                    className="rounded-lg px-4 py-3 flex items-start gap-3"
                    style={{
                      background: `oklch(0.76 0.16 ${h} / 0.07)`,
                      border: `1px solid oklch(0.76 0.16 ${h} / 0.2)`,
                    }}
                  >
                    <Music2
                      className="w-4 h-4 mt-0.5 flex-shrink-0"
                      style={{ color: `oklch(0.76 0.16 ${h} / 0.8)` }}
                    />
                    <p
                      className="text-sm font-display italic leading-relaxed"
                      style={{ color: `oklch(0.80 0.08 ${h})` }}
                    >
                      &ldquo;{lesson.example}&rdquo;
                    </p>
                  </div>

                  {/* Riyaz Practice Panel */}
                  <RiyazPanel
                    letter={lesson.letter}
                    hue={h}
                    mode={mode}
                    index={idx + 1}
                  />
                </div>
              </motion.div>
            );
          })}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 text-center py-8 border-t border-border/40 mt-6">
        <p className="text-xs text-muted-foreground font-body">
          &copy; {new Date().getFullYear()}. Built with love using{" "}
          <a
            href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(typeof window !== "undefined" ? window.location.hostname : "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            caffeine.ai
          </a>
        </p>
      </footer>

      {/* Scroll to top */}
      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            type="button"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="fixed bottom-6 right-6 z-50 w-10 h-10 rounded-full flex items-center justify-center hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            style={{
              background: `oklch(0.76 0.16 ${hue} / 0.9)`,
              boxShadow: `0 0 20px oklch(0.76 0.16 ${hue} / 0.4)`,
              color: "oklch(0.08 0.01 65)",
            }}
          >
            <ChevronUp className="w-5 h-5" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
