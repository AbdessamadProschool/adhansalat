# Application Android native

> **Statut : code écrit, jamais compilé.** Cet environnement ne dispose ni de JDK, ni du SDK
> Android, ni de Gradle. Aucun APK/AAB n'est fourni, aucune alarme système n'a été déclenchée sur un
> appareil. Les sections 2 et 9 listent exactement ce qu'il faut vérifier lors de la première
> compilation.

L'application Android n'est pas une réécriture : c'est le **même bundle web** (`dist/`) emballé dans
une WebView, plus la seule capacité qu'un navigateur n'a pas — des alarmes système.

## 1. Fichiers

```
android/
  settings.gradle.kts, build.gradle.kts, gradle.properties
  gradle/wrapper/gradle-wrapper.properties   Gradle 8.13 épinglé (jar/scripts absents)
  app/
    build.gradle.kts              versions, copie de dist/ et des WAV, noCompress
    proguard-rules.pro            garde le bridge JavaScript
    src/main/
      AndroidManifest.xml         permissions, receivers, service
      assets/web/                 (généré depuis dist/ au build)
      res/values{,-en,-ar}/       textes natifs
      res/raw/chime_*.wav         carillons (commités + recopiés au build)
      res/raw/adhan_cc0.mp3       Adhan CC0 vérifié (commité + recopié au build)
      res/raw/                    aucun autre MP3 : les 8 Adhan fournis ne sont pas livrés
      res/drawable/               icône, icône de notification
      java/app/azan/global/
        AzanApplication.kt        canaux de notification
        MainActivity.kt           WebView, insets, back, sélecteur audio
        AzanBridge.kt             @JavascriptInterface (contrat §5)
        WebAssetHandler.kt        assets/web → https://appassets.androidplatform.net/
        NativeAlarmScheduler.kt   setAlarmClock / setExactAndAllowWhileIdle, audit des manqués
        AdhanReceiver.kt          livraison, anti-doublon, « manquée »
        AdhanService.kt           premier plan, MediaPlayer, focus audio
        SystemEventReceiver.kt    boot, heure, fuseau, permission, mise à jour
        ScheduleStore.kt          SharedPreferences + registre fired/missed
        AlarmPayload.kt           parsing JSON, ArmResult
        CustomSounds.kt           copie privée des sons importés (+ validation)
        Notifications.kt          canaux, constructions, heure localisée
        Sounds.kt                 soundId → R.raw (Adhan CC0 + 3 carillons)
        LocaleHelper.kt           langue de l'app web appliquée au natif
        NativeDiagnosticsActivity.kt + ui/Theme.kt
```

## 2. Compiler

### Prérequis

| Outil | Version |
| --- | --- |
| JDK | 17 |
| Android SDK | platform 36, build-tools 36.0.0 |
| Gradle | 8.13 (`gradle-wrapper.properties` épinglé) |
| AGP / Kotlin | 8.11.1 / 2.1.20 |
| Node/npm | pour produire `dist/` d'abord |

Aucun wrapper Gradle complet n'est commité : `gradle/wrapper/gradle-wrapper.properties` fixe la
version 8.13, mais le jar et les scripts `gradlew`/`gradlew.bat` auraient dû être générés par Gradle,
absent ici. Une fois :

```bash
cd android
gradle wrapper --gradle-version 8.13
```

ou ouvrir `android/` dans Android Studio, qui le crée automatiquement.

### Construire

```bash
# à la racine
npm install
npm run build            # produit dist/

# dans android/
./gradlew assembleDebug  # → app/build/outputs/apk/debug/app-debug.apk
./gradlew bundleRelease  # → app/build/outputs/bundle/release/app-release.aab
```

Le build **échoue volontairement** si `dist/` ou `public/audio/` est absent : mieux vaut une erreur
qu'un APK qui s'installe sur un écran blanc. `dist/` est copié dans `assets/web/`, les WAV et
l'Adhan CC0 dans `res/raw/`, et `*.wav`/`*.mp3` sont marqués `noCompress` (MediaPlayer a besoin d'un
descripteur non compressé).

### Signature release

Aucune clé n'est fournie. La créer vous-même (`keytool -genkeypair …` ou Android Studio → Build → Generate Signed
Bundle), puis ajouter dans `app/build.gradle.kts` :

```kotlin
signingConfigs {
    create("release") {
        storeFile = file("../keystore.jks")
        storePassword = System.getenv("AZAN_STORE_PASSWORD")
        keyAlias = System.getenv("AZAN_KEY_ALIAS")
        keyPassword = System.getenv("AZAN_KEY_PASSWORD")
    }
}
buildTypes { release { signingConfig = signingConfigs.getByName("release") } }
```

puis `./gradlew bundleRelease`. Ne jamais commiter le keystore.

## 3. Permissions

| Permission | API | Pourquoi | Si refusée |
| --- | --- | --- | --- |
| `SCHEDULE_EXACT_ALARM` | 31–32 (et 33+ si `USE` absent) | alarmes exactes, révocable ; refusée par défaut aux nouvelles installations sur Android 14+ | aucun armement, résultat `deferred`, bouton vers « Alarmes et rappels » |
| `USE_EXACT_ALARM` | 33+ | accordée automatiquement ; réservée par Play aux apps d'alarme/agenda | — (mais voir §4) |
| `RECEIVE_BOOT_COMPLETED` | 26+ | réarmer après redémarrage | les alarmes sont perdues au reboot |
| `POST_NOTIFICATIONS` | 33+ | afficher l'Adhan et les rappels | l'audio peut sonner, rien ne s'affiche ; état signalé |
| `FOREGROUND_SERVICE` + `_MEDIA_PLAYBACK` | 26+/34+ | lire l'Adhan écran éteint | notification seule |
| `WAKE_LOCK` | 26+ | garder le CPU pendant la lecture | coupures selon l'appareil |
| `VIBRATE` | 26+ | vibration par prière | pas de vibration |
| `INTERNET` | — | **non déclarée, volontairement** | — |

Les deux permissions d'alarme exacte sont déclarées ensemble, volontairement. Sur Android 13+,
`USE_EXACT_ALARM` l'emporte et est accordée à l'installation ; sur Android 12, seule
`SCHEDULE_EXACT_ALARM` existe et l'utilisateur peut la révoquer. Le code interroge toujours
`canScheduleExactAlarms()` avant d'armer ; aucun repli approximatif n'est utilisé. Si Play refuse
`USE_EXACT_ALARM`, retirer cette ligne : l'application continue avec `SCHEDULE_EXACT_ALARM` et la
demande utilisateur (voir §4).

`allowBackup="false"` et `fullBackupContent="false"` : les réglages et le registre de livraison ne
doivent pas être restaurés sur un autre appareil avec des horaires d'un autre lieu.

`targetSdk = 36` : exigé pour les nouvelles soumissions à partir d'août 2026. Le comportement des
alarmes exactes, des services de premier plan et des notifications suit donc les règles Android 16,
pas celles d'Android 13.

## 4. Politique Google Play pour les alarmes exactes

`USE_EXACT_ALARM` est une permission restreinte. Play l'accepte pour une application **dont la
fonction principale est une alarme ou un calendrier**. Un calculateur d'horaires de prière entre
dans cette catégorie lorsque l'Adhan est la fonction annoncée, ce qui est le cas ici.

Justification à fournir dans la Play Console (à adapter) :

> Azan Global est une application d'alarme religieuse. Sa fonction principale est de faire sonner
> l'Adhan à l'heure exacte des cinq prières, y compris lorsque l'écran est verrouillé et que
> l'application est fermée. Chaque alarme est programmée avec `AlarmManager.setAlarmClock()`, à
> l'instant calculé localement pour la position de l'utilisateur. Aucune alarme n'est utilisée à des
> fins publicitaires ou analytiques, et l'application ne demande pas la permission `INTERNET`.

Points à ne pas manquer lors de la soumission :

- la fiche Play doit décrire l'application comme une application d'horaires/adhan, pas comme un
  « utilitaire » générique ;
- la politique de confidentialité doit confirmer qu'aucune donnée de localisation n'est transmise ;
- un court texte/vidéo de démonstration de l'alarme écran verrouillé aide à la revue ;
- si `USE_EXACT_ALARM` est refusée, retirer la ligne du manifeste : le code retombe proprement sur
  `SCHEDULE_EXACT_ALARM` + demande utilisateur.

## 5. Contrat du pont

`window.AzanNative` est injecté avant le chargement de la page. Le contrat complet et sa
correspondance Kotlin sont décrits dans
[`docs/ARCHITECTURE.md`](ARCHITECTURE.md#7-contrat-web--natif). En résumé :

- `schedule(json)` : reçoit des **instants UTC** et un fuseau d'affichage ; **persiste d'abord**,
  annule les alarmes obsolètes de l'ancien plan, arme, puis renvoie
  `{armed, skipped, deferred, reason, stored}`. Un seul appel remplace l'ancien couple
  `cancelAll()` + `schedule()` ;
- `lastSyncResult()` : dernier résultat natif, source et horodatage ;
- `cancelAll()` : réservé à l'absence de plan ;
- `importSound(id, name)` / `deleteImportedSound(id)` / `listImportedSounds()` : copie privée des
  sons importés et diagnostic ;
- `canScheduleExactAlarms()` / `requestExactAlarmPermission()` ;
- `notificationPermission()` / `requestNotificationPermission()` (indispensable : la WebView
  rapporte toujours `denied` pour l'API web) ;
- `isIgnoringBatteryOptimizations()`, `openNotificationSettings()`, `platform()`,
  `openNativeDiagnostics()`.

Après un retour des réglages système, `MainActivity.onResume()` et
`onRequestPermissionsResult()` exécutent :

```js
window.dispatchEvent(new Event('azan:permissions-changed'))
```

ce qui force l'écran de diagnostic web à relire l'état réel.

## 6. Données et stockage

- `SharedPreferences` (`azan.schedule`), écritures **synchrones** (`commit()`), parce qu'elles ont
  lieu dans `BroadcastReceiver.onReceive` et qu'une écriture perdue rejouerait une prière.
- Clés : `payload` (JSON brut), `locale`, `fired` (registre anti-doublon), `lastResult`, `lastSync`,
  `lastSyncSource`, `notificationAsked`.
- Le registre `fired` est élagué aux clés du payload courant : il ne grandit pas indéfiniment.
- Les événements dont l'heure est passée de plus de 120 s sans livraison sont enregistrés une fois
  par `auditMissed()` (agrégat), puis marqués consommés : ni rejoués, ni signalés deux fois.
- Aucune donnée ne sort de l'appareil, aucune permission réseau.

## 7. Audio

- Un seul `AdhanService` de premier plan, un seul `MediaPlayer`, `USAGE_ALARM`, focus transitoire.
- Perte de focus (appel, autre alarme) → **arrêt**, jamais de ducking : la notification reste.
- `setWakeMode(PARTIAL_WAKE_LOCK)` pour survivre à l'extinction de l'écran.
- **Un Adhan CC0 vérifié est fourni** (`res/raw/adhan_cc0.mp3`, « Beautiful adhan », Wikimedia
  Commons, CC0 1.0) et trois carillons synthétisés (`chime_calm`, `chime_dawn`, `chime_alert`).
  `Sounds.resFor("adhan-cc0")` renvoie `R.raw.adhan_cc0` : c'est le son par défaut d'une nouvelle
  installation. La piste est marquée `noCompress` et copiée dans `res/raw/` par `syncRawAudio`.
- **Aucun enregistrement fourni n'est livré dans l'APK.** Les huit MP3 fournis sont nettoyés dans
  `audio-cleaned/` (hors `public/` et hors `res/raw/`) et catalogués avec `bundled: false` ; l'écran
  Sons les affiche comme « non inclus », sans aperçu. `scripts/check-release-assets.mjs` fait échouer
  le build si un audio autre que la piste CC0 vérifiée (taille + SHA-256) apparaît dans `res/raw/`
  ou dans `public/`. Voir [`AUDIO.md`](AUDIO.md).
- Une préférence enregistrée qui pointait vers un ancien `adhan-*` non livré est migrée vers un
  carillon au chargement de l'application web, donc le payload envoyé au natif ne contient plus ces
  ids. Une sélection `adhan-cc0` valide est conservée. Si un id inconnu arrive quand même,
  `Sounds.resFor()` renvoie `null` et le service affiche une notification sans audio (état
  `notify-no-audio`) au lieu de jouer un autre son.
- Un son importé est copié par `CustomSounds` dans `filesDir/sounds/<id>` via `importSound()`, puis
  lu par le service avec `setDataSource(file.absolutePath)`. Le nom de fichier est l'`id` validé par
  une regex stricte (pas de traversée de chemin), la taille est plafonnée à 30 Mio et les extensions
  à mp3/m4a/aac/wav/ogg/opus/flac/mp4. Le blob IndexedDB reste la copie web : même `id` des deux
  côtés, suppression propagée.
- Si le fichier est absent ou si la copie a échoué, l'alarme affiche une notification **sans audio**,
  avec la mention explicite et l'état `notify-no-audio`. Aucun son de substitution.
- Le receiver distingue « service démarré » de « son audible » : il enregistre
  `foreground service started; audible playback is not observable from the receiver`, jamais
  « l'utilisateur a entendu ».
- La piste Fajr garde son réglage indépendant (`fajrSoundOverride`), y compris lorsqu'un son importé
  est choisi : elle n'est jamais fusionnée avec les préférences des autres prières.

## 8. Diagnostic natif

Écran Compose (`NativeDiagnosticsActivity`), accessible depuis le diagnostic web ou par une action de
notification. Il affiche l'état **lu dans le système** :

- alarmes exactes autorisées ou non, avec bouton vers le réglage ;
- notifications autorisées ou non ;
- exemption d'optimisation de batterie, avec bouton ;
- nombre d'alarmes stockées / à venir, et les 10 prochaines avec leur heure locale ;
- dernier résultat de synchronisation natif (`armed`, `skipped`, `deferred`, raison) ;
- sons importés réellement présents dans le stockage privé (nom, taille) ;
- dernier résultat réel (`audio`, `notified`, `notify-no-audio`, `missed`) ;
- bouton « Tester une alarme dans 20 secondes » : programme une vraie alarme via `AlarmManager`,
  sans toucher au planning réel ;
- bouton « Arrêter le son » affiché **uniquement** si un son est en cours.

## 9. Ce qu'il faut vérifier à la première compilation

Aucun de ces points n'a pu être exécuté ici. Ils sont classés par probabilité de problème.

1. **Outils** : générer `gradlew` (Gradle 8.13), télécharger AGP 8.11.1 / Kotlin 2.1.20 / Compose BOM 2025.06.00, vérifier que le SDK 36 est installé.
2. **Compose** : `TopAppBar` requiert `@OptIn(ExperimentalMaterial3Api::class)` (présent) ;
   vérifier les signatures Material3 de la BOM 2025.06.00 (`CardDefaults.cardColors`,
   `TopAppBarDefaults.topAppBarColors`).
3. **Ressources** : `R.raw.chime_calm|dawn|alert` et `R.raw.adhan_cc0` doivent exister (fichiers
   commités dans `res/raw/`). `noCompress` doit accepter `wav` et `mp3` avec l'AGP ciblé.
4. **WebViewAssetLoader** : le `PathHandler` maison doit servir `/`, `/assets/...`, `/icons/...`,
   `/audio/...` ; vérifier l'ouverture de `assets/web/index.html` et le MIME des `.js`.
5. **Manifest** : `android:exported` sur l'activité de lancement ; receivers non exportés recevant
   bien `BOOT_COMPLETED` (les diffusions système sont permises).
6. **Alarmes** : sur Android 13+, vérifier que `canScheduleExactAlarms()` est vrai avec
   `USE_EXACT_ALARM` ; sur Android 12, tester le refus puis l'octroi.
7. **Audio** : `startForeground` avec type `mediaPlayback` depuis un `BroadcastReceiver` sur
   Android 14+ ; vérifier l'exemption d'alarme exacte et le comportement si le constructeur bloque
   le démarrage en arrière-plan (le code retombe sur une notification).
8. **Import audio** : le sélecteur `GetContent` de la WebView remet bien un `content://` lisible,
   `allowContentAccess` est actif, la copie arrive dans `filesDir/sounds/<id>`, et le service la
   joue après un redémarrage. Vérifier aussi le refus d'un fichier > 30 Mio et d'une extension
   inconnue.
9. **Langue** : `attachBaseContext` doit appliquer le français/arabe aux chaînes natives et à la
   direction (`supportsRtl`).
10. **Cycle de vie** : rotation (déclarée dans `configChanges`), retour depuis les réglages système,
    mort du processus WebView (`onRenderProcessGone` recrée l'activité).

## 10. Pièges constructeurs (OEM)

Les surcouches Xiaomi/MIUI, Huawei/EMUI, Samsung One UI, Oppo/ColorOS et Vivo limitent agressivement
les alarmes et les services de premier plan. L'écran de diagnostic natif affiche l'état
d'optimisation de batterie et propose « Sans restriction ». À documenter côté utilisateur :

- MIUI : Autorisations → Autorisation automatique + « Afficher les fenêtres pop-up » ;
- Huawei : Applications → Lancer l'application → Gérer manuellement → toutes les options ;
- Samsung : Batterie → Limites d'utilisation en arrière-plan → « Applications jamais en veille ».

Rien de tout cela ne peut être automatisé : l'application se contente de **signaler** l'état réel.

## 11. Checklist de recette sur appareil (non exécutée)

À faire avant toute publication :

- [ ] installer l'APK, choisir une ville, vérifier l'heure affichée contre une horloge ;
- [ ] **écouter l'Adhan CC0 par défaut** : `R.raw.adhan_cc0` doit se lancer depuis le service, sans
  import préalable, et la piste doit être audible jusqu'au bout (non vérifié ici) ;
- [ ] **vérifier que le MP3 CC0 est bien dans l'APK** (`unzip -l app-debug.apk | grep adhan_cc0`) et
  non recompressé ;
- [ ] programmer une alarme de test, verrouiller l'écran, attendre 20 s ;
- [ ] tuer l'application (`adb shell am force-stop`), vérifier qu'une alarme ultérieure sonne ;
- [ ] redémarrer l'appareil, vérifier le réarmement (`BOOT_COMPLETED`) ;
- [ ] changer le fuseau système, vérifier la notification « fuseau modifié » ;
- [ ] refuser les notifications, vérifier l'absence de faux « OK » ;
- [ ] révoquer les alarmes exactes, vérifier `deferred` puis l'octroi et le réarmement ;
- [ ] importer un son dans le web, vérifier la copie native (diagnostic natif : nom + taille) ;
- [ ] **choisir un son importé, fermer l'application, vérifier que l'alarme le joue** (non vérifiable ici) ;
- [ ] **redémarrer l'appareil puis vérifier que le même son importé est toujours joué** (lecteur natif, pas WebView) ;
- [ ] **vérifier qu'un id `adhan-*` stocké par une version antérieure est bien remplacé par un carillon** (migration web) ;
- [ ] **choisir un son différent pour Fajr et vérifier que les quatre autres prières gardent le leur** ;
- [ ] supprimer ce son, vérifier qu'il disparaît du diagnostic natif et qu'aucune alarme ne le joue ;
- [ ] importer un fichier > 30 Mio ou d'extension inconnue, vérifier le refus explicite ;
- [ ] passer en arabe, vérifier les notifications natives et la direction ;
- [ ] vérifier qu'aucune requête réseau n'est émise (`adb shell dumpsys netstats` ou proxy).
