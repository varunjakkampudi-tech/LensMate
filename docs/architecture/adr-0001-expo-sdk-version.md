# Expo application architecture

Status: accepted

LensMate's phone companion uses Expo and React Native with Expo Router. The SDK and native package versions are maintained
in the workspace manifests and lockfile. Keep Expo packages aligned with the selected SDK and use generated native
projects; do not hand-edit generated `ios/` or `android/` directories.

When changing SDK versions, review the official compatibility guidance, update the related packages together, and run
the mobile build, type, lint, and relevant device checks before accepting the change. An emulator or web build does not
replace a native-device check for camera, microphone, encrypted storage, or speech behavior.
