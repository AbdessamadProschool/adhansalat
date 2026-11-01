# Android — code écrit, **non compilé**

> **Aucun APK ni AAB n'est fourni par ce dépôt.** Cet environnement ne dispose ni de JDK, ni du SDK
> Android, ni de Gradle. Le code Kotlin ci-dessous n'a donc **jamais été compilé**, et aucune alarme
> système n'a été déclenchée sur un appareil. Ne pas le présenter comme un binaire validé.

Ce dossier contient l'hôte Android du même moteur que la PWA : une `WebView` qui charge le bundle
`dist/`, plus la seule capacité qu'un navigateur n'a pas — des alarmes qui survivent à la fermeture
de l'application.

## Ce que fait ce module

| Fichier | Rôle |
| --- | --- |
| `MainActivity.kt` | WebView, `WebViewAssetLoader`, insets, bouton retour, recréation si le renderer meurt |
| `WebAssetHandler.kt` | sert `assets/web/` sur `https://appassets.androidplatform.net/` (contexte sécurisé : service worker, IndexedDB, `Intl`) |
| `AzanBridge.kt` | unique surface `window.AzanNative` : `schedule` (atomique, renvoie `ArmResult`), `cancelAll`, import/suppression de sons, permissions, diagnostic |
| `NativeAlarmScheduler.kt` | `setAlarmClock()` pour l'Adhan, `setExactAndAllowWhileIdle()` pour les pré-rappels, un `PendingIntent` par `eventKey`, audit des événements manqués |
| `CustomSounds.kt` | copie privée des sons importés (`filesDir/sounds/<id>`), validation d'identifiant et de taille |
| `AdhanReceiver.kt` | livraison, verrou anti-doublon persistant, événement trop tardif → `missed` |
| `AdhanService.kt` | service de premier plan, un `MediaPlayer`, `USAGE_ALARM`, focus transitoire (arrêt, jamais de ducking) |
| `SystemEventReceiver.kt` | réarmement après boot, changement d'heure/fuseau, mise à jour, octroi de permission |
| `ScheduleStore.kt` | `SharedPreferences` avec `commit()` ; payload, locale, registre `fired`/`missed`, dernier résultat |
| `Notifications.kt` | canaux, notifications localisées, heure formatée dans le fuseau de l'utilisateur |
| `Sounds.kt` | `soundId` → `R.raw` pour l'Adhan CC0 vérifié et les trois carillons |
| `NativeDiagnosticsActivity.kt` | écran Compose : état réel des permissions, alarmes armées, test à 20 s, arrêt du son |
| `ui/Theme.kt`, `res/` | jetons visuels de la PWA, textes fr/en/ar, icônes |

## Ce que ce module ne fait pas

- **Il ne calcule aucune heure.** Les instants arrivent en UTC depuis le moteur TypeScript testé. Il
  n'existe pas de seconde implémentation astronomique en Kotlin, donc pas de divergence possible.
- **Il ne déclare pas la permission `INTERNET`.** L'application ne peut rien envoyer.
- **Il ne lit pas IndexedDB**, mais il reçoit une copie privée du fichier importé via
  `importSound()` (`filesDir/sounds/<id>`). Si cette copie a échoué ou si le fichier a disparu,
  l'alarme affiche une notification sans audio et l'indique ; l'Adhan CC0 et les trois carillons de
  `res/raw/` restent toujours disponibles.
- **Il ne contourne pas le mode silencieux** ni les restrictions constructeur.
- **Il n'a aucun mode « debug » de livraison silencieuse** : si une alarme exacte est refusée, le
  résultat est `deferred` et l'écran natif le montre.

## Compiler

Prérequis : JDK 17, Android SDK platform 36, build-tools 36.0.0, Gradle 8.13. Le fichier
`gradle/wrapper/gradle-wrapper.properties` est présent, mais le jar et les scripts `gradlew` /
`gradlew.bat` manquent : ils auraient été générés par Gradle, absent ici.

```bash
# à la racine du dépôt
npm install
npm run build          # produit dist/, sinon Gradle échoue volontairement

cd android
gradle wrapper --gradle-version 8.13   # une seule fois
./gradlew assembleDebug                # → app/build/outputs/apk/debug/app-debug.apk
./gradlew bundleRelease                # → app/build/outputs/bundle/release/app-release.aab
```

Le build copie `dist/` dans `assets/web/`, `public/audio/*.wav` et l'Adhan CC0
`public/audio/adhan/adhan-cc0.mp3` dans `res/raw/`, et refuse de continuer si `dist/` ou
`public/audio/` est absent. Les trois WAV et le MP3 CC0 sont également commités dans `res/raw/` pour
que `R.raw.chime_*` et `R.raw.adhan_cc0` existent toujours au moment du linkage des ressources.

La signature release n'est pas fournie : voir
[`docs/ANDROID.md`](../docs/ANDROID.md#signature-release).

## Lire ensuite

- [`docs/ANDROID.md`](../docs/ANDROID.md) — permissions, politique Play, contrat du pont, pièges OEM,
  **checklist des points à vérifier à la première compilation** et recette sur appareil.
- [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md) — place du module natif dans l'ensemble.
- [`docs/LIMITES.md`](../docs/LIMITES.md) — ce qui reste incertain même après compilation.
