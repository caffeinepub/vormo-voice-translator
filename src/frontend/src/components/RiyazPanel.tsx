import { useActor } from "@/hooks/useActor";
import { Loader2, Mic, MicOff, Music, Play, Save, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRef, useState } from "react";

type Mode = "student" | "teacher";

interface RiyazPanelProps {
  letter: string;
  hue: number;
  mode: Mode;
  index: number;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
  });
}

function playBase64Audio(base64: string) {
  const audio = new Audio(`data:audio/webm;base64,${base64}`);
  audio.play().catch((e) => console.error("Audio play error:", e));
}

function getOrCreateStudentId(): string {
  let id = localStorage.getItem("riyaz_student_id");
  if (!id) {
    id = `student_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem("riyaz_student_id", id);
  }
  return id;
}

export default function RiyazPanel({
  letter,
  hue,
  mode,
  index,
}: RiyazPanelProps) {
  const { actor } = useActor();
  const [isOpen, setIsOpen] = useState(false);

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Async states
  const [isSending, setIsSending] = useState(false);
  const [isSavingRiyaz, setIsSavingRiyaz] = useState(false);
  const [isHearingStudent, setIsHearingStudent] = useState(false);
  const [isHearingTeacher, setIsHearingTeacher] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [noStudentMsg, setNoStudentMsg] = useState(false);
  const [noTeacherMsg, setNoTeacherMsg] = useState(false);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setRecordedBlob(blob);
        for (const track of stream.getTracks()) {
          track.stop();
        }
        setIsRecording(false);
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setIsRecording(true);
      setRecordedBlob(null);
      setSendSuccess(false);
      setSaveSuccess(false);

      stopTimerRef.current = setTimeout(() => stopRecording(mr), 8000);
    } catch (e) {
      console.error("Mic access error:", e);
    }
  };

  const stopRecording = (mr?: MediaRecorder) => {
    const rec = mr ?? mediaRecorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.stop();
    }
    if (stopTimerRef.current) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    setIsRecording(false);
  };

  const playRecording = () => {
    if (!recordedBlob) return;
    const url = URL.createObjectURL(recordedBlob);
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    audio.play().catch(console.error);
  };

  const sendToTeacher = async () => {
    if (!recordedBlob || !actor) return;
    setIsSending(true);
    try {
      const base64 = await blobToBase64(recordedBlob);
      const studentId = getOrCreateStudentId();
      // biome-ignore lint/suspicious/noExplicitAny: backend function not in generated types
      await (actor as any).storeStudentSing(letter, base64, studentId);
      setSendSuccess(true);
      setTimeout(() => setSendSuccess(false), 3000);
    } catch (e) {
      console.error("Send error:", e);
    } finally {
      setIsSending(false);
    }
  };

  const hearTeacherRiyaz = async () => {
    if (!actor) return;
    setIsHearingTeacher(true);
    setNoTeacherMsg(false);
    try {
      // biome-ignore lint/suspicious/noExplicitAny: backend function not in generated types
      const result = await (actor as any).getTeacherRiyaz(letter);
      if (result?.audioBase64) {
        playBase64Audio(result.audioBase64);
      } else {
        setNoTeacherMsg(true);
        setTimeout(() => setNoTeacherMsg(false), 3000);
      }
    } catch (e) {
      console.error("Hear teacher error:", e);
    } finally {
      setIsHearingTeacher(false);
    }
  };

  const hearStudentSing = async () => {
    if (!actor) return;
    setIsHearingStudent(true);
    setNoStudentMsg(false);
    try {
      // biome-ignore lint/suspicious/noExplicitAny: backend function not in generated types
      const result = await (actor as any).getStudentSing(letter);
      if (result?.audioBase64) {
        playBase64Audio(result.audioBase64);
      } else {
        setNoStudentMsg(true);
        setTimeout(() => setNoStudentMsg(false), 3000);
      }
    } catch (e) {
      console.error("Hear student error:", e);
    } finally {
      setIsHearingStudent(false);
    }
  };

  const saveRiyaz = async () => {
    if (!recordedBlob || !actor) return;
    setIsSavingRiyaz(true);
    try {
      const base64 = await blobToBase64(recordedBlob);
      // biome-ignore lint/suspicious/noExplicitAny: backend function not in generated types
      await (actor as any).storeTeacherRiyaz(letter, base64);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e) {
      console.error("Save riyaz error:", e);
    } finally {
      setIsSavingRiyaz(false);
    }
  };

  const isStudent = mode === "student";
  const panelColor = isStudent ? 185 : 65;

  return (
    <div
      className="mt-3 rounded-lg overflow-hidden"
      style={{
        border: `1px solid oklch(0.76 0.14 ${panelColor} / 0.25)`,
        background: `oklch(0.11 0.02 ${panelColor} / 0.4)`,
      }}
    >
      {/* Toggle header */}
      <button
        type="button"
        data-ocid={`riyaz.panel.toggle.${index}`}
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 transition-colors hover:bg-white/5"
      >
        <div className="flex items-center gap-2">
          <Music
            className="w-3.5 h-3.5"
            style={{ color: `oklch(0.76 0.14 ${panelColor})` }}
          />
          <span
            className="text-xs font-bold tracking-wider uppercase font-body"
            style={{ color: `oklch(0.72 0.12 ${panelColor})` }}
          >
            🎵 Riyaz Practice
          </span>
        </div>
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-muted-foreground text-xs"
        >
          ▾
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="riyaz-content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-1 flex flex-col gap-2">
              {isStudent ? (
                // ===== STUDENT MODE =====
                <>
                  {/* Record */}
                  <div className="flex gap-2 flex-wrap">
                    <button
                      type="button"
                      data-ocid={`riyaz.student.record.button.${index}`}
                      onClick={
                        isRecording ? () => stopRecording() : startRecording
                      }
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-body font-semibold transition-all"
                      style={{
                        background: isRecording
                          ? "oklch(0.55 0.22 25 / 0.3)"
                          : "oklch(0.45 0.12 185 / 0.3)",
                        border: isRecording
                          ? "1px solid oklch(0.65 0.22 25 / 0.6)"
                          : "1px solid oklch(0.60 0.12 185 / 0.5)",
                        color: isRecording
                          ? "oklch(0.82 0.15 25)"
                          : "oklch(0.82 0.1 185)",
                      }}
                    >
                      {isRecording ? (
                        <>
                          <MicOff className="w-3 h-3" />
                          Recording… (tap to stop)
                        </>
                      ) : (
                        <>
                          <Mic className="w-3 h-3" />🎤 Sing this line
                        </>
                      )}
                    </button>

                    {recordedBlob && !isRecording && (
                      <button
                        type="button"
                        data-ocid={`riyaz.student.play.button.${index}`}
                        onClick={playRecording}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-body font-semibold transition-all"
                        style={{
                          background: "oklch(0.45 0.1 145 / 0.3)",
                          border: "1px solid oklch(0.6 0.12 145 / 0.5)",
                          color: "oklch(0.82 0.1 150)",
                        }}
                      >
                        <Play className="w-3 h-3" />▶ Play my singing
                      </button>
                    )}

                    {recordedBlob && !isRecording && (
                      <button
                        type="button"
                        data-ocid={`riyaz.student.discard.button.${index}`}
                        onClick={() => setRecordedBlob(null)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-body transition-all"
                        style={{
                          background: "oklch(0.18 0.02 25 / 0.4)",
                          border: "1px solid oklch(0.3 0.04 25 / 0.4)",
                          color: "oklch(0.55 0.08 25)",
                        }}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {recordedBlob && !isRecording && (
                    <button
                      type="button"
                      data-ocid={`riyaz.student.send.button.${index}`}
                      onClick={sendToTeacher}
                      disabled={isSending}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-body font-semibold self-start transition-all disabled:opacity-60"
                      style={{
                        background: "oklch(0.55 0.18 250 / 0.25)",
                        border: "1px solid oklch(0.65 0.18 250 / 0.5)",
                        color: "oklch(0.82 0.12 250)",
                      }}
                    >
                      {isSending ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        "📤"
                      )}
                      {isSending ? "Sending…" : "Send to Teacher"}
                    </button>
                  )}

                  <AnimatePresence>
                    {sendSuccess && (
                      <motion.div
                        data-ocid={`riyaz.student.send.success_state.${index}`}
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="text-xs font-body px-2 py-1 rounded"
                        style={{
                          color: "oklch(0.78 0.15 145)",
                          background: "oklch(0.18 0.04 145 / 0.4)",
                        }}
                      >
                        ✓ Sent to teacher!
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div
                    className="h-px my-1"
                    style={{
                      background: `oklch(0.76 0.14 ${panelColor} / 0.15)`,
                    }}
                  />

                  <button
                    type="button"
                    data-ocid={`riyaz.student.hear_teacher.button.${index}`}
                    onClick={hearTeacherRiyaz}
                    disabled={isHearingTeacher}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-body font-semibold self-start transition-all disabled:opacity-60"
                    style={{
                      background: `oklch(0.45 0.12 ${hue} / 0.25)`,
                      border: `1px solid oklch(0.60 0.14 ${hue} / 0.5)`,
                      color: `oklch(0.82 0.1 ${hue})`,
                    }}
                  >
                    {isHearingTeacher ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      "🎶"
                    )}
                    {isHearingTeacher ? "Loading…" : "Hear Teacher's Riyaz"}
                  </button>

                  <AnimatePresence>
                    {noTeacherMsg && (
                      <motion.div
                        data-ocid={`riyaz.student.no_teacher.error_state.${index}`}
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="text-xs font-body px-2 py-1 rounded"
                        style={{
                          color: "oklch(0.72 0.08 60)",
                          background: "oklch(0.18 0.02 60 / 0.4)",
                        }}
                      >
                        Teacher hasn't recorded yet for letter {letter}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              ) : (
                // ===== TEACHER MODE =====
                <>
                  <button
                    type="button"
                    data-ocid={`riyaz.teacher.hear_student.button.${index}`}
                    onClick={hearStudentSing}
                    disabled={isHearingStudent}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-body font-semibold self-start transition-all disabled:opacity-60"
                    style={{
                      background: "oklch(0.45 0.12 250 / 0.25)",
                      border: "1px solid oklch(0.6 0.14 250 / 0.5)",
                      color: "oklch(0.82 0.1 250)",
                    }}
                  >
                    {isHearingStudent ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      "👂"
                    )}
                    {isHearingStudent ? "Loading…" : "Hear Student's Singing"}
                  </button>

                  <AnimatePresence>
                    {noStudentMsg && (
                      <motion.div
                        data-ocid={`riyaz.teacher.no_student.error_state.${index}`}
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="text-xs font-body px-2 py-1 rounded"
                        style={{
                          color: "oklch(0.72 0.08 60)",
                          background: "oklch(0.18 0.02 60 / 0.4)",
                        }}
                      >
                        No student recording yet for letter {letter}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div
                    className="h-px my-1"
                    style={{ background: "oklch(0.76 0.14 65 / 0.15)" }}
                  />

                  <div className="flex gap-2 flex-wrap">
                    <button
                      type="button"
                      data-ocid={`riyaz.teacher.record.button.${index}`}
                      onClick={
                        isRecording ? () => stopRecording() : startRecording
                      }
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-body font-semibold transition-all"
                      style={{
                        background: isRecording
                          ? "oklch(0.55 0.22 25 / 0.3)"
                          : "oklch(0.5 0.16 65 / 0.3)",
                        border: isRecording
                          ? "1px solid oklch(0.65 0.22 25 / 0.6)"
                          : "1px solid oklch(0.72 0.16 65 / 0.6)",
                        color: isRecording
                          ? "oklch(0.82 0.15 25)"
                          : "oklch(0.88 0.14 65)",
                      }}
                    >
                      {isRecording ? (
                        <>
                          <MicOff className="w-3 h-3" />
                          Recording… (tap to stop)
                        </>
                      ) : (
                        <>
                          <Mic className="w-3 h-3" />🎤 Record Riyaz
                        </>
                      )}
                    </button>

                    {recordedBlob && !isRecording && (
                      <button
                        type="button"
                        data-ocid={`riyaz.teacher.play.button.${index}`}
                        onClick={playRecording}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-body font-semibold transition-all"
                        style={{
                          background: "oklch(0.45 0.1 145 / 0.3)",
                          border: "1px solid oklch(0.6 0.12 145 / 0.5)",
                          color: "oklch(0.82 0.1 150)",
                        }}
                      >
                        <Play className="w-3 h-3" />▶ Play my Riyaz
                      </button>
                    )}

                    {recordedBlob && !isRecording && (
                      <button
                        type="button"
                        data-ocid={`riyaz.teacher.discard.button.${index}`}
                        onClick={() => setRecordedBlob(null)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-body transition-all"
                        style={{
                          background: "oklch(0.18 0.02 25 / 0.4)",
                          border: "1px solid oklch(0.3 0.04 25 / 0.4)",
                          color: "oklch(0.55 0.08 25)",
                        }}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {recordedBlob && !isRecording && (
                    <button
                      type="button"
                      data-ocid={`riyaz.teacher.save.button.${index}`}
                      onClick={saveRiyaz}
                      disabled={isSavingRiyaz}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-body font-semibold self-start transition-all disabled:opacity-60"
                      style={{
                        background: "oklch(0.5 0.18 65 / 0.3)",
                        border: "1px solid oklch(0.72 0.18 65 / 0.6)",
                        color: "oklch(0.88 0.14 65)",
                      }}
                    >
                      {isSavingRiyaz ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Save className="w-3 h-3" />
                      )}
                      {isSavingRiyaz ? "Saving…" : "💾 Save Riyaz"}
                    </button>
                  )}

                  <AnimatePresence>
                    {saveSuccess && (
                      <motion.div
                        data-ocid={`riyaz.teacher.save.success_state.${index}`}
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="text-xs font-body px-2 py-1 rounded"
                        style={{
                          color: "oklch(0.78 0.15 145)",
                          background: "oklch(0.18 0.04 145 / 0.4)",
                        }}
                      >
                        ✓ Riyaz saved for letter {letter}!
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
