import { useCallback, useEffect, useState } from "react";
import { Image, Platform, View } from "react-native";
import { aiErrorText, askText } from "../src/ai/assistant";
import { relevantNotes } from "../src/memory/search";
import {
  deleteAll,
  deleteItem,
  exportAll,
  listItems,
  memoryErrorText,
  saveItem,
  type MemoryItem,
  type MemoryKind,
} from "../src/memory/vault";
import { BackupCard } from "../src/memory/backup-card";
import { Body, Btn, Card, Chip, Field, H2, Notice, Page, Row } from "../src/ui/kit";
import { usePrefs } from "../src/ui/prefs";
import { useTheme } from "../src/ui/theme";

const FILTERS: { id: MemoryKind | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "note", label: "Notes" },
  { id: "capture", label: "Captures" },
  { id: "answer", label: "Answers" },
  { id: "reminder", label: "Reminders" },
  { id: "debrief", label: "Debriefs" },
];

export default function MemoryScreen() {
  const { c } = useTheme();
  const { prefs } = usePrefs();
  const [items, setItems] = useState<MemoryItem[]>([]);
  const [filter, setFilter] = useState<MemoryKind | "all">("all");
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");
  const [reminder, setReminder] = useState("");
  const [minutes, setMinutes] = useState("30");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void listItems()
      .then(setItems)
      .catch((error: unknown) => setMessage(memoryErrorText(error)));
  }, []);
  useEffect(refresh, [refresh]);

  const shown = items.filter(
    (i) =>
      (filter === "all" || i.kind === filter) &&
      `${i.title} ${i.text}`.toLowerCase().includes(search.toLowerCase()),
  );

  const addReminder = async () => {
    const mins = Math.max(1, Number.parseInt(minutes, 10) || 30);
    if (
      Platform.OS === "web" &&
      typeof Notification !== "undefined" &&
      Notification.permission === "default"
    ) {
      await Notification.requestPermission();
    }
    await saveItem({
      kind: "reminder",
      title: reminder.trim(),
      text: "",
      dueAt: Date.now() + mins * 60_000,
    });
    setReminder("");
    refresh();
  };

  /** Information retrieval over the user's own notes: only matching note text is sent, after the user asks. */
  const askNotes = async () => {
    setBusy(true);
    setAnswer(null);
    const context = relevantNotes(
      items.filter((i) => i.kind !== "capture"),
      question,
      8,
    )
      .map((i) => `- ${i.title}: ${i.text}`)
      .join("\n")
      .slice(0, 6000);
    try {
      const reply = await askText(
        [
          {
            role: "user",
            content: `My saved notes:\n${context || "(no matching notes)"}\n\nQuestion: ${question}`,
          },
        ],
        prefs.language,
        "Answer only from the saved notes. If they do not contain the answer, say so.",
      );
      setAnswer(reply.text);
    } catch (e) {
      setAnswer(aiErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title="Memory" kicker="NOTES · CAPTURES · REMINDERS">
      <Body muted>
        Kept only on this device, encrypted. Nothing here is uploaded unless you ask a question
        about your notes.
      </Body>
      {!prefs.features.memory ? (
        <Notice tone="warn">Notes and memory are switched off in Profile → Features.</Notice>
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
        <Card style={{ flexGrow: 1, flexBasis: 320 }}>
          <H2>New note</H2>
          <Field
            testID="memory-note-input"
            label="Note"
            value={note}
            onChange={setNote}
            multiline
          />
          <Btn
            testID="memory-save-note-button"
            label="Save note"
            icon="check"
            disabled={note.trim() === "" || !prefs.features.memory}
            onPress={() =>
              void saveItem({
                kind: "note",
                title: note.trim().split("\n")[0]?.slice(0, 60) ?? "Note",
                text: note.trim(),
              }).then(() => {
                setNote("");
                refresh();
              })
            }
          />
        </Card>
        <Card style={{ flexGrow: 1, flexBasis: 320 }}>
          <H2>Reminder</H2>
          <Field
            testID="memory-reminder-input"
            label="Remind me to"
            value={reminder}
            onChange={setReminder}
          />
          <Field
            testID="memory-reminder-minutes"
            label="In how many minutes"
            value={minutes}
            onChange={setMinutes}
          />
          <Btn
            testID="memory-add-reminder-button"
            label="Add reminder"
            icon="bell"
            disabled={reminder.trim() === "" || !prefs.features.reminders}
            onPress={() => void addReminder()}
          />
          <Body muted size={12}>
            Reminders fire while LensMate is open; the browser shows a notification if you allow it.
          </Body>
        </Card>
      </View>
      <Card>
        <H2>Ask my notes</H2>
        <Field
          testID="memory-ask-input"
          label="Question"
          value={question}
          onChange={setQuestion}
          placeholder="Where did I park?"
        />
        <Btn
          testID="memory-ask-button"
          label="Ask"
          icon="spark"
          busy={busy}
          disabled={question.trim() === ""}
          onPress={() => void askNotes()}
        />
        {answer === null ? null : (
          <Notice testID="memory-ask-answer" tone="info">
            {answer}
          </Notice>
        )}
      </Card>
      <Card>
        <Row>
          {FILTERS.map((f) => (
            <Chip
              key={f.id}
              testID={`memory-filter-${f.id}`}
              label={f.label}
              active={filter === f.id}
              onPress={() => setFilter(f.id)}
            />
          ))}
        </Row>
        <Field testID="memory-search-input" label="Search" value={search} onChange={setSearch} />
        {shown.length === 0 ? <Body muted>Nothing saved yet.</Body> : null}
        {shown.map((item) => (
          <View
            key={item.id}
            testID="memory-item"
            style={{
              flexDirection: "row",
              gap: 12,
              borderTopWidth: 1,
              borderTopColor: c.border,
              paddingTop: 12,
            }}
          >
            {item.imageDataUrl === undefined ? null : (
              <Image
                source={{ uri: item.imageDataUrl }}
                style={{ width: 84, height: 63, borderRadius: 10 }}
              />
            )}
            <View style={{ flex: 1, gap: 4 }}>
              <Body>{item.title}</Body>
              {item.text === "" ? null : (
                <Body muted size={14}>
                  {item.text.slice(0, 400)}
                </Body>
              )}
              <Body muted size={12}>
                {item.kind} · {new Date(item.createdAt).toLocaleString()}
                {item.dueAt === undefined
                  ? ""
                  : ` · due ${new Date(item.dueAt).toLocaleTimeString()}${item.done === true ? " (done)" : ""}`}
              </Body>
            </View>
            <Btn
              label="Delete"
              tone="ghost"
              icon="trash"
              onPress={() => void deleteItem(item.id).then(refresh)}
            />
          </View>
        ))}
      </Card>
      <BackupCard onRestored={refresh} />
      <Card>
        <H2>Your data</H2>
        <Row>
          <Btn
            testID="memory-export-button"
            label="Export all"
            tone="ghost"
            icon="upload"
            onPress={() => void exportAll().then((n) => setMessage(`Exported ${n} items.`))}
          />
          <Btn
            testID="memory-delete-all-button"
            label="Delete everything"
            tone="danger"
            icon="trash"
            onPress={() =>
              void deleteAll().then(() => {
                setMessage("All memory and its key were deleted.");
                refresh();
              })
            }
          />
        </Row>
        {message === null ? null : <Notice tone="info">{message}</Notice>}
        <Body muted size={12}>
          Server backup is optional and off until you use the card above.
        </Body>
      </Card>
    </Page>
  );
}
