// LensMate prototype control-flow simulation only. No real camera or microphone is attached.
constexpr int ASK_BUTTON_PIN = 18;
constexpr int PHOTO_BUTTON_PIN = 19;
constexpr int MUTE_SWITCH_PIN = 4;
constexpr int PRIVACY_LED_PIN = 2;
constexpr int BUZZER_PIN = 5;

bool requestActive = false;
bool previousAsk = HIGH;
bool previousPhoto = HIGH;
bool previousMute = HIGH;
unsigned long lastAskEventMs = 0;
unsigned long lastPhotoEventMs = 0;
unsigned long photoIndicatorUntil = 0;

void setup() {
  Serial.begin(115200);
  pinMode(ASK_BUTTON_PIN, INPUT_PULLUP);
  pinMode(PHOTO_BUTTON_PIN, INPUT_PULLUP);
  pinMode(MUTE_SWITCH_PIN, INPUT_PULLUP);
  pinMode(PRIVACY_LED_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(PRIVACY_LED_PIN, LOW);
  Serial.println("LENS MATE SIM READY");
}

void loop() {
  const unsigned long now = millis();
  const bool ask = digitalRead(ASK_BUTTON_PIN);
  const bool photo = digitalRead(PHOTO_BUTTON_PIN);
  const bool mute = digitalRead(MUTE_SWITCH_PIN);

  if (mute == LOW && previousMute == HIGH && requestActive) {
    requestActive = false;
    Serial.println("SIM:MIC_MUTED_REQUEST_STOPPED");
  }

  if (ask == LOW && previousAsk == HIGH && now - lastAskEventMs >= 200) {
    lastAskEventMs = now;
    if (mute == LOW) {
      Serial.println("SIM:ASK_BLOCKED_MIC_MUTED");
    } else {
      requestActive = !requestActive;
      Serial.println(requestActive ? "SIM:VOICE_REQUEST_STARTED" : "SIM:VOICE_REQUEST_STOPPED");
      if (!requestActive) Serial.println("SIM:ANSWER_ROUTE_NOT_IMPLEMENTED");
      tone(BUZZER_PIN, requestActive ? 880 : 660, 70);
    }
  }

  if (photo == LOW && previousPhoto == HIGH && now - lastPhotoEventMs >= 200) {
    lastPhotoEventMs = now;
    photoIndicatorUntil = now + 900;
    Serial.println("SIM:PHOTO_CAPTURE_REQUESTED_NO_CAMERA_ATTACHED");
    tone(BUZZER_PIN, 1200, 70);
  }

  const bool captureActive = requestActive || now < photoIndicatorUntil;
  digitalWrite(PRIVACY_LED_PIN, captureActive ? HIGH : LOW);

  if (mute == LOW && previousMute == HIGH) Serial.println("SIM:PHYSICAL_MUTE_ON");
  if (mute == HIGH && previousMute == LOW) Serial.println("SIM:PHYSICAL_MUTE_OFF");
  previousAsk = ask;
  previousPhoto = photo;
  previousMute = mute;
  delay(10);
}
