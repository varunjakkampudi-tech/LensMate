# Runbook: test LensMate on the Android emulator and phone

Scope: the browser app (https://lensmate.tech/app, run in Chrome on Android) and the Expo development build once it exists.
Both point at the live broker in mock mode unless the owner changes BROKER_MODE.

## 1. Start the emulator

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe" -avd Medium_Phone_API_37.0 -no-snapshot-load -gpu swiftshader_indirect
```

Wait until this reports `1`:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" shell getprop sys.boot_completed
```

Only one emulator is needed. If two are running, close the second in Android Studio's Device Manager.

## 2. Open the browser app

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" shell am start -a android.intent.action.VIEW -d "https://lensmate.tech/app"
```

Check: the home screen loads, and Diagnostics lists the battery (the emulator usually reports it), the broker address and the camera.

## 3. Enrol the emulator (once)

The owner creates a code on the server (see docs/runbooks/broker-deploy.md). Enter it in **Enrol this phone**. The code works once and expires in 10 minutes.

## 4. Walk the features

For each item: note the result in the register and in blocker.txt.

- Ask a question: the answer streams in and is spoken (F3).
- Read all the text on a picture (F2).
- Dictate and save a note (F5), then find it in Memory (F6).
- Change the answer tone on Profile and ask again (F35).
- Translate a turn and check the transcript swaps the speaker (F20, F21).
- Start a capture: the indicator shows, and Stop ends it (F37, F40).

## 5. Record

Write the date, the emulator image, and each result in blocker.txt, under a new round heading. Mark a feature Verified on device only when it was tested on a device (emulator results count as "emulator", not "phone").
