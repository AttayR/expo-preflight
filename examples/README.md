# Example Expo app

`expo-app/` is a minimal Expo project layout (config files only, no install needed) that preflight
passes cleanly. Try it:

```sh
npx expo-preflight examples/expo-app
```

Delete `ios.infoPlist.NSCameraUsageDescription` from `app.json` and run again to see a failure.
