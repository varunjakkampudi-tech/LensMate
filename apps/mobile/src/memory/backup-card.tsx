import { useEffect, useState } from "react";
import { Switch, Text, View } from "react-native";
import {
  RETENTION_CHOICES,
  backUp,
  backupErrorText,
  backupStatus,
  deleteBackup,
  restore,
} from "./backup";
import { Body, Btn, Card, Chip, Field, H2, Notice, Row } from "../ui/kit";
import { useTheme } from "../ui/theme";

/** Optional encrypted server backup with a user-chosen retention period. Off until the user backs up. */
export function BackupCard({ onRestored }: { onRestored: () => void }) {
  const { c } = useTheme();
  const [pass, setPass] = useState("");
  const [days, setDays] = useState<number>(30);
  const [photos, setPhotos] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "info" | "error"; text: string } | null>(null);

  const refresh = () =>
    void backupStatus()
      .then((s) =>
        setStatus(
          s === null
            ? "No backup on the server."
            : `Last backup ${new Date(s.updatedAt).toLocaleString()} · deleted on ${new Date(s.expiresAt).toLocaleDateString()}`,
        ),
      )
      .catch(() => setStatus("Backup is available after enrolment and the cloud notice."));
  useEffect(refresh, []);

  const run = async (op: () => Promise<string>) => {
    setBusy(true);
    setMessage(null);
    try {
      setMessage({ tone: "info", text: await op() });
      refresh();
    } catch (e) {
      setMessage({ tone: "error", text: backupErrorText(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card testID="backup-card">
      <H2>Encrypted server backup (optional)</H2>
      <Body muted size={13}>
        Encrypted on this phone with your backup passphrase before upload. The server cannot read it
        and deletes it when the retention period ends. Lose the passphrase and the backup cannot be
        opened.
      </Body>
      {status === null ? null : (
        <Text testID="backup-status" style={{ color: c.muted, fontSize: 12 }}>
          {status}
        </Text>
      )}
      <Field
        testID="backup-passphrase-input"
        label="Backup passphrase (at least 10 characters)"
        value={pass}
        onChange={setPass}
        secure
      />
      <Body muted size={13}>
        Keep the backup for
      </Body>
      <Row>
        {RETENTION_CHOICES.map((d) => (
          <Chip
            key={d}
            testID={`backup-days-${d}`}
            label={d === 365 ? "1 year" : `${d} days`}
            active={days === d}
            onPress={() => setDays(d)}
          />
        ))}
      </Row>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Body size={14}>Include photos (larger upload)</Body>
        <Switch
          testID="backup-photos"
          accessibilityRole="switch"
          aria-checked={photos}
          value={photos}
          onValueChange={setPhotos}
        />
      </View>
      <Row>
        <Btn
          testID="backup-now-button"
          label="Back up now"
          icon="upload"
          busy={busy}
          disabled={pass.length < 10}
          onPress={() =>
            void run(async () => {
              const r = await backUp(pass, days, photos);
              return `Backed up ${r.count} items. Deleted automatically on ${new Date(r.expiresAt).toLocaleDateString()}.`;
            })
          }
        />
        <Btn
          testID="backup-restore-button"
          label="Restore"
          tone="ghost"
          icon="check"
          busy={busy}
          disabled={pass.length < 10}
          onPress={() =>
            void run(async () => {
              const n = await restore(pass);
              onRestored();
              return `Restored ${n} items.`;
            })
          }
        />
        <Btn
          testID="backup-delete-button"
          label="Delete backup"
          tone="ghost"
          icon="trash"
          busy={busy}
          onPress={() =>
            void run(async () => {
              await deleteBackup();
              return "The server backup was deleted.";
            })
          }
        />
      </Row>
      {message === null ? null : (
        <Notice testID="backup-message" tone={message.tone}>
          {message.text}
        </Notice>
      )}
    </Card>
  );
}
