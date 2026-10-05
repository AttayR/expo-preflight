export interface IosKey {
  /** Info.plist key. */
  key: string;
  /** Option name in the package's config plugin that sets this key (if any). */
  pluginOption?: string;
  /**
   * API identifiers (functions, hooks, components) that actually trigger this key. When set, the
   * key is only an error if one of them is found in app sources.
   */
  apis?: string[];
  /** Extra regex (source text patterns) that also trigger the key, e.g. a JSX prop. */
  pattern?: RegExp;
  /** Report only when a triggering API is detected (never as info/warn for unused or unscannable). */
  onlyIfDetected?: boolean;
}

/** Package -> iOS Info.plist usage-description keys it requires. */
export const IOS_USAGE: Record<string, IosKey[]> = {
  'expo-camera': [
    {
      key: 'NSCameraUsageDescription',
      pluginOption: 'cameraPermission',
      apis: [
        'CameraView',
        'Camera',
        'useCameraPermissions',
        'requestCameraPermissionsAsync',
        'getCameraPermissionsAsync',
      ],
    },
    {
      key: 'NSMicrophoneUsageDescription',
      pluginOption: 'microphonePermission',
      apis: [
        'recordAsync',
        'requestMicrophonePermissionsAsync',
        'getMicrophonePermissionsAsync',
        'useMicrophonePermissions',
      ],
      // Video mode records audio unless `mute` is set.
      pattern: /\bmode\s*=\s*\{?\s*['"]video['"]/,
    },
  ],
  'expo-location': [
    {
      key: 'NSLocationWhenInUseUsageDescription',
      pluginOption: 'locationWhenInUsePermission',
      apis: [
        'requestForegroundPermissionsAsync',
        'getForegroundPermissionsAsync',
        'useForegroundPermissions',
        'requestPermissionsAsync',
        'getPermissionsAsync',
        'getCurrentPositionAsync',
        'watchPositionAsync',
        'getLastKnownPositionAsync',
        'watchHeadingAsync',
        'getHeadingAsync',
      ],
    },
    {
      key: 'NSLocationAlwaysAndWhenInUseUsageDescription',
      pluginOption: 'locationAlwaysAndWhenInUsePermission',
      onlyIfDetected: true,
      apis: [
        'requestBackgroundPermissionsAsync',
        'getBackgroundPermissionsAsync',
        'useBackgroundPermissions',
        'startLocationUpdatesAsync',
        'startGeofencingAsync',
      ],
    },
  ],
  'expo-image-picker': [
    {
      key: 'NSPhotoLibraryUsageDescription',
      pluginOption: 'photosPermission',
      apis: [
        'launchImageLibraryAsync',
        'requestMediaLibraryPermissionsAsync',
        'getMediaLibraryPermissionsAsync',
        'useMediaLibraryPermissions',
      ],
    },
    {
      key: 'NSCameraUsageDescription',
      pluginOption: 'cameraPermission',
      apis: [
        'launchCameraAsync',
        'requestCameraPermissionsAsync',
        'getCameraPermissionsAsync',
        'useCameraPermissions',
      ],
    },
  ],
  'expo-media-library': [
    { key: 'NSPhotoLibraryUsageDescription', pluginOption: 'photosPermission' },
  ],
  'expo-contacts': [{ key: 'NSContactsUsageDescription', pluginOption: 'contactsPermission' }],
  'expo-av': [{ key: 'NSMicrophoneUsageDescription', pluginOption: 'microphonePermission' }],
  'expo-audio': [{ key: 'NSMicrophoneUsageDescription', pluginOption: 'microphonePermission' }],
  'expo-calendar': [
    { key: 'NSCalendarsUsageDescription', pluginOption: 'calendarPermission' },
    { key: 'NSRemindersUsageDescription', pluginOption: 'remindersPermission' },
  ],
  'expo-local-authentication': [
    { key: 'NSFaceIDUsageDescription', pluginOption: 'faceIDPermission' },
  ],
  'expo-barcode-scanner': [{ key: 'NSCameraUsageDescription', pluginOption: 'cameraPermission' }],
  'expo-tracking-transparency': [
    { key: 'NSUserTrackingUsageDescription', pluginOption: 'userTrackingPermission' },
  ],
  // Only CoreMotion activity/altimeter APIs need the Motion & Fitness string; plain
  // Accelerometer/Gyroscope/Magnetometer/DeviceMotion do not.
  'expo-sensors': [
    {
      key: 'NSMotionUsageDescription',
      pluginOption: 'motionPermission',
      apis: ['Pedometer', 'Barometer'],
    },
  ],
  'react-native-ble-plx': [
    { key: 'NSBluetoothAlwaysUsageDescription', pluginOption: 'bluetoothAlwaysPermission' },
  ],
  'react-native-ble-manager': [{ key: 'NSBluetoothAlwaysUsageDescription' }],
  'react-native-vision-camera': [
    { key: 'NSCameraUsageDescription', pluginOption: 'cameraPermissionText' },
  ],
  'expo-speech-recognition': [
    { key: 'NSSpeechRecognitionUsageDescription', pluginOption: 'speechRecognitionPermission' },
    { key: 'NSMicrophoneUsageDescription', pluginOption: 'microphonePermission' },
  ],
};

/**
 * Package -> Android permissions. "A|B" means any one of the listed permissions satisfies it.
 */
export const ANDROID_PERMISSIONS: Record<string, string[]> = {
  'expo-camera': ['CAMERA'],
  'expo-location': ['ACCESS_FINE_LOCATION|ACCESS_COARSE_LOCATION'],
  'expo-image-picker': ['CAMERA'],
  'expo-media-library': ['READ_MEDIA_IMAGES|READ_EXTERNAL_STORAGE'],
  'expo-contacts': ['READ_CONTACTS'],
  'expo-av': ['RECORD_AUDIO'],
  'expo-audio': ['RECORD_AUDIO'],
  'expo-calendar': ['READ_CALENDAR'],
  'expo-local-authentication': ['USE_BIOMETRIC|USE_FINGERPRINT'],
  'react-native-ble-plx': ['BLUETOOTH_SCAN', 'BLUETOOTH_CONNECT', 'ACCESS_FINE_LOCATION'],
  'react-native-ble-manager': ['BLUETOOTH_SCAN', 'BLUETOOTH_CONNECT', 'ACCESS_FINE_LOCATION'],
  'react-native-vision-camera': ['CAMERA'],
  'expo-notifications': ['POST_NOTIFICATIONS'],
};

/** Permissions that commonly trigger Google Play policy review or are rarely needed. */
export const DANGEROUS_ANDROID: Record<string, string> = {
  READ_SMS: 'SMS permissions are restricted by Google Play policy',
  SEND_SMS: 'SMS permissions are restricted by Google Play policy',
  RECEIVE_SMS: 'SMS permissions are restricted by Google Play policy',
  READ_CALL_LOG: 'Call log permissions are restricted by Google Play policy',
  WRITE_CALL_LOG: 'Call log permissions are restricted by Google Play policy',
  PROCESS_OUTGOING_CALLS: 'Call-related permissions are restricted by Google Play policy',
  MANAGE_EXTERNAL_STORAGE: 'All-files access requires a Play Console declaration',
  ACCESS_BACKGROUND_LOCATION: 'Background location requires a Play Console declaration',
  SYSTEM_ALERT_WINDOW: 'Draw-over-apps is rarely needed and draws store scrutiny',
  READ_PHONE_STATE: 'Rarely needed and flagged in privacy reviews',
  REQUEST_INSTALL_PACKAGES: 'Requires a Play Console declaration',
  QUERY_ALL_PACKAGES: 'Requires a Play Console declaration',
};

/** Files that must not be committed, with default severity. */
export const SECRET_FILE_PATTERNS: {
  re: RegExp;
  label: string;
  severity: 'error' | 'warn';
  /** Paths matching this are never reported (public by design, e.g. debug keystores). */
  exempt?: RegExp;
  /** Report as info unless the file's JSON contains key/password-like fields. */
  inspectJson?: boolean;
}[] = [
  {
    re: /(^|\/)\.env(\.[^/]+)?$/,
    exempt: /(^|\/)\.env(\.[^/]+)*\.(example|sample|template)$/,
    label: '.env file',
    severity: 'error',
  },
  { re: /(^|\/)google-services\.json$/, label: 'google-services.json', severity: 'warn' },
  { re: /(^|\/)GoogleService-Info\.plist$/, label: 'GoogleService-Info.plist', severity: 'warn' },
  {
    re: /\.(jks|keystore)$/,
    exempt: /(^|\/)debug\.keystore$/,
    label: 'Android keystore',
    severity: 'error',
  },
  { re: /\.(p8|p12|mobileprovision)$/, label: 'Apple signing credential', severity: 'error' },
  {
    re: /(^|\/)credentials\.json$/,
    label: 'credentials.json',
    severity: 'error',
    inspectJson: true,
  },
];

/** Permissions a package's config plugin / native module adds beyond the ones it requires. */
export const ANDROID_COVERS: Record<string, string[]> = {
  'expo-calendar': ['WRITE_CALENDAR'],
  'expo-contacts': ['WRITE_CONTACTS'],
  'expo-media-library': [
    'READ_EXTERNAL_STORAGE',
    'WRITE_EXTERNAL_STORAGE',
    'READ_MEDIA_IMAGES',
    'READ_MEDIA_VIDEO',
    'READ_MEDIA_AUDIO',
    'ACCESS_MEDIA_LOCATION',
  ],
  'expo-image-picker': ['READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE'],
  'expo-camera': ['RECORD_AUDIO'],
  'expo-file-system': ['READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE'],
};

/** Packages whose iOS plugin can supply NSMicrophoneUsageDescription. */
export const MICROPHONE_FAMILY = ['expo-camera', 'expo-av', 'expo-audio', 'expo-video'];

/** Extra key accepted/required for expo-media-library when it is only used to save to the library. */
export const MEDIA_SAVE_KEY: IosKey = {
  key: 'NSPhotoLibraryAddUsageDescription',
  pluginOption: 'savePhotosPermission',
};
export const MEDIA_SAVE_APIS = new Set(['saveToLibraryAsync', 'createAssetAsync']);
