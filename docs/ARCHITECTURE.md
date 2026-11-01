# Architecture

> **Vue complète.** Ce document est la vue synthétique. La conception système détaillée — contexte,
> conteneurs, composants, invariants, machines à états, courses, modèle de panne, sécurité,
> performance, ADR et feuille de route — se trouve dans
> [`SYSTEM-DESIGN.md`](SYSTEM-DESIGN.md).

## 1. Vue d'ensemble

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Hôte A : navigateur / PWA installée                                      │
│  index.html → src/app/main.ts → écrans DOM → Engine → timers d'onglet    │
└───────────────────────────────┬──────────────────────────────────────────┘
                                │ même bundle `dist/`
┌───────────────────────────────▼──────────────────────────────────────────┐
│ Hôte B : Android (Kotlin)                                                 │
│  MainActivity (WebView) ← WebAssetLoader ← assets/web/                    │
│      ↕ window.AzanNative                                                  │
│  AzanBridge → NativeAlarmScheduler → AlarmManager                         │
│             → ScheduleStore (SharedPreferences)                           │
│  AdhanReceiver → AdhanService (foreground, MediaPlayer) → notification    │
│  SystemEventReceiver → réarmement (boot, heure, fuseau, permission)       │
└──────────────────────────────────────────────────────────────────────────┘
```

Deux hôtes, **un seul moteur de calcul** et **un seul jeu d'instants UTC**. Aucune formule
astronomique n'existe en Kotlin : la version native ne sait faire que « réveiller l'appareil à
l'instant T et jouer un fichier ».

## 2. Couches

| Couche | Modules | Interdits |
| --- | --- | --- |
| Domaine pur | `src/core/astro.ts`, `prayertimes.ts`, `methods.ts`, `profiles.ts`, `schedule.ts`, `hijri.ts` | DOM, `window`, réseau, `Date.now()` implicite |
| Temps | `src/core/timezone.ts`, `tzdata.ts`, `data/tzdata.json` | faire confiance au fuseau de l'hôte |
| Application | `src/app/store.ts`, `alarm-engine.ts`, `audio.ts`, `notifications.ts`, `location.ts`, `cities.ts` | injecter du HTML utilisateur |
| Présentation | `src/app/ui.ts`, `screens/*`, `styles.css`, `i18n.ts` | calculer des horaires |
| Plateforme | `src/pwa/sw-template.ts`, `vite.config.ts`, `android/**` | inventer un état système |

Le sens des dépendances est strictement descendant : `core` ne connaît personne, l'UI ne calcule
rien, le natif ne décide de rien.

## 3. Le temps : instants d'abord, affichage ensuite

Règle fondatrice : **le moteur ne retourne jamais « 18:42 »**. Il retourne un `Date` (instant UTC
absolu). Le libellé `18:42` est produit au dernier moment, pour un fuseau IANA donné.

Conséquences :

- un changement d'heure (DST) ne peut pas décaler une prière : l'instant est déjà fixé ;
- changer de fuseau d'affichage ne recalcule rien ;
- le pont Android transporte `atIso` (`2026-10-27T12:19:18.367Z`), jamais une heure murale.

### Pourquoi une table de fuseaux embarquée

Le fuseau de l'hôte n'est pas fiable. Sur Windows/Chromium, `Africa/Casablanca` est encore calculé
avec la règle marocaine d'avant 2018 : au 27 octobre 2026, l'OS répond **UTC+0** alors que le
Maroc est à **UTC+1**. Toutes les prières auraient été affichées une heure trop tôt, sans aucun
message d'erreur.

`src/core/data/tzdata.json` (34,4 Kio) contient les transitions 2018 → 2045 pour **434 zones**
(2 033 transitions, 90 séries partagées), générées depuis ICU. `offsetMinutesAt()` lit d'abord cette
table, et n'utilise `Intl` qu'en dehors de la plage couverte. Le diagnostic compare les deux et
affiche `OS UTC+00:00 → table UTC+01:00` quand ils divergent.

Tout affichage passe par `formatInZone()` : l'instant est décalé de l'offset de la table puis rendu
en UTC, ce qui empêche le système de réinterpréter le fuseau. `osOffsetMinutesAt()` n'existe que
pour la ligne de comparaison du diagnostic.

## 4. Flux de données

```
onboarding ──► SettingsStore (localStorage 'azan.settings.v1')
                    │  subscribe()
                    ▼
              AlarmEngine.replan(reason)
                    ├─ buildPlan(now, days)  ← schedule.computeWindow()
                    │      └─ prayertimes.computeDay() ← astro
                    ├─ mode() = native ? pushToNative() : armNext()
                    └─ emit() → écrans (snapshot immuable)
```

`SettingsStore.update()` clone l'état (`structuredClone`), applique la mutation, persiste, puis
notifie. Un seul abonnement dans `main.ts` déclenche `engine.replan()` et un rendu complet coalescé
par `requestAnimationFrame` (avec un `setTimeout(150)` de secours si la frame est suspendue).

Le rendu remplace `#app` en entier. À cette taille, c'est plus sûr qu'un diff : aucun écran ne peut
afficher une heure périmée après un changement de méthode ou de lieu.

## 5. Modèle persistant

`localStorage['azan.settings.v1']` :

| Champ | Rôle |
| --- | --- |
| `version` | 1 ; `hydrate()` fusionne les nouveaux champs sur les valeurs par défaut |
| `locale`, `theme`, `onboarded` | préférences d'interface |
| `location` | `{latitude, longitude, elevation?, timeZone, countryCode, cityName?, source, determinedAt}` |
| `calculation` | `methodId` (id AlAdhan), `asrSchool`, `highLatitudeRule`, `adjustments` (minutes par prière) |
| `prayers` | par prière : `enabled`, `audioEnabled`, `soundId`, `preReminderMinutes`, `vibration`, `notificationOnly` |
| `sounds` | métadonnées des sons importés (le blob est en IndexedDB) |
| `fajrSoundOverride` | surcharge Fajr |
| `log` | 200 dernières entrées `{at, level, event, detail}` |
| `firedKeys` | 200 derniers `eventKey` livrés — **verrou anti-doublon** |
| `missedKeys` | sous-ensemble des précédents jamais délivrés (affiché « manquée ») |
| `diagnosticsWindowDays` | 1–31 jours affichés dans le diagnostic |

Sons importés : IndexedDB `azan-audio` / magasin `files`, clé `id`, valeur `{id, name, blob, ...}`.
Dans la coque Android, le pont copie aussi le fichier dans `filesDir/sounds/<id>` sous le même `id`.
Aucun fichier ne quitte l'appareil.

## 6. Moteur d'alarmes

### Clé d'événement

`eventKey = "YYYY-MM-DD:prière"` pour l'Adhan, suffixe `:pre` pour un pré-rappel. C'est l'identité
de livraison : une seule par jour et par prière, même après un redémarrage, un changement de lieu ou
une reprogrammation.

### Deux modes, aucun troisième

| Mode | Déclencheur | État rapporté |
| --- | --- | --- |
| `native` | `window.AzanNative` présent → `schedule(payload)` | `scheduled` (l'OS possède la livraison) |
| `web-foreground` | un seul `setTimeout` enchaîné vers le prochain événement | `foreground-timer` / `calculated` |

Le mode web ne prétend **jamais** être une alarme système : le diagnostic affiche
« Onglet ouvert uniquement » et une bannière d'avertissement.

### Anti-doublon et anti-retard

1. `deliverDue()` ne retient que les événements dus dans la fenêtre de grâce (`120 s`).
2. `markFired()` renvoie `false` si la clé existe déjà → aucun second son.
3. Un événement plus ancien que la grâce est `markMissed()` : ajouté au registre (donc jamais joué
   plus tard) **et** marqué comme manqué pour que l'UI ne l'affiche pas en vert.
4. Le tout premier plan d'une session ne fabrique pas de « manqués » rétroactifs : il journalise une
   ligne `alarms.history` et s'arrête là.

### Portée native

En mode natif, `pushToNative()` construit **31 jours** d'alarmes (`NATIVE_WINDOW_DAYS`) à chaque
replanification, indépendamment de la fenêtre d'affichage du diagnostic. L'OS garde donc un mois
d'avance même application fermée. `SystemEventReceiver` réarme après redémarrage, changement
d'heure, changement de fuseau, mise à jour de l'APK ou octroi de la permission.

`deliverDue()` est volontairement **ignoré** en mode natif : sinon une prière qui tombe pendant que
l'application est ouverte serait annoncée deux fois (une fois par l'OS, une fois par la page).

## 7. Contrat web ↔ natif

`window.AzanNative` (injecté par `MainActivity`) :

| Méthode | Réponse | Notes |
| --- | --- | --- |
| `schedule(payloadJson)` | JSON `{armed, skipped, deferred, reason, stored}` | **un seul appel** : persiste le plan, annule les alarmes obsolètes de l'ancien plan, arme, puis renvoie ce que l'OS a réellement fait |
| `lastSyncResult()` | JSON + `source`, `atMillis` | dernier résultat enregistré, affiché par le diagnostic web |
| `cancelAll()` | — | réservé à l'absence de plan : annule les `PendingIntent` connus et efface le payload ; le registre `fired` est conservé |
| `importSound(id, name)` | JSON `{ok, id, bytes, mime, reason}` | copie le fichier choisi dans le stockage privé natif |
| `deleteImportedSound(id)` | — | supprime la copie native |
| `listImportedSounds()` | JSON | métadonnées des sons natifs disponibles |
| `canScheduleExactAlarms()` | boolean | état réel du système |
| `requestExactAlarmPermission()` | — | ouvre « Alarmes et rappels » |
| `isIgnoringBatteryOptimizations()` | boolean | utile face aux surcouches constructeur |
| `openNotificationSettings()` | — | écran de notifications de l'app |
| `platform()` | string | ex. `Android 16 (API 36)` |
| `notificationPermission()` | `granted\|denied\|default` | **indispensable** : WebView rapporte toujours `denied` pour l'API web |
| `requestNotificationPermission()` | — | demande `POST_NOTIFICATIONS` (API 33+) |
| `openNativeDiagnostics()` | — | ouvre l'écran Compose de diagnostic |

Le pont expose aussi `window.dispatchEvent(new Event('azan:permissions-changed'))` depuis
`onResume` et `onRequestPermissionsResult`, ce qui force le diagnostic web à relire l'état réel
après un retour des réglages système.

## 8. Service worker

Généré par le plugin `azan-service-worker` de `vite.config.ts` : la liste de précache est construite
à partir des fichiers réellement émis, donc les noms hachés ne peuvent pas se désynchroniser.

| Requête | Stratégie |
| --- | --- |
| Navigation | réseau d'abord (abandon à 4 s) ; en cas d'échec **ou de réponse non-ok** (portail captif, proxy 502), coquille en cache |
| `/audio/*` | cache d'abord |
| `/data/cities/*` | cache d'abord (index et régions téléchargées restent hors ligne) |
| Autres assets same-origin | stale-while-revalidate |
| `Range`, cross-origin, `/sw.js`, non-GET | laissés au réseau |

Le worker ne fait **pas** `skipWaiting()` automatiquement : un nouveau worker ne doit pas supprimer
les assets hachés d'un onglet encore ouvert. `SKIP_WAITING` est honoré si une future UI de mise à
jour le demande. Il ne déclenche pas l'Adhan : il sert des fichiers (y compris la piste CC0
précachée) et focalise une fenêtre au clic sur une notification.

## 9. Mode natif : décisions de stockage et d'audio

- **SharedPreferences avec `commit()`**, pas DataStore ni Room. Les écritures critiques ont lieu
  dans `BroadcastReceiver.onReceive` et doivent être synchrones : une écriture asynchrone perdue
  après un crash rejouerait une prière déjà sonnée.
- **Un `PendingIntent` par `eventKey`**, avec un URI de données unique `azan://alarm/<key>`, pour
  qu'une reprogrammation ne puisse pas écraser une autre alarme même en cas de collision de
  `requestCode`.
- **`setAlarmClock()` pour l'Adhan** (réveille l'écran, jamais décalé par Doze) et
  **`setExactAndAllowWhileIdle()` pour les pré-rappels** (ne réveille pas l'écran).
- **Un seul `MediaPlayer` par service**, `USAGE_ALARM`, focus transitoire. Perte de focus = arrêt,
  jamais de ducking : un Adhan à moitié volume est pire que pas d'Adhan, et la notification reste.
- **Sons importés** : le blob reste dans IndexedDB pour le lecteur web, et le pont copie le même
  fichier dans le stockage privé Android (`filesDir/sounds/<id>`) via `importSound()`. Une alarme
  native peut donc lire le son réellement choisi. Si la copie a échoué ou si le fichier a disparu,
  l'alarme affiche une notification **sans audio**, enregistre `notify-no-audio` et le diagnostic
  web signale l'échec. Aucun son de substitution n'est joué.
- **Événements manqués** : Android annule les alarmes au redémarrage et ne rejoue pas celles dont
  l'heure est passée. `auditMissed()` enregistre une fois l'agrégat des Adhans non délivrés (jamais
  ceux antérieurs à la création du plan), puis les marque comme consommés : ils ne sont ni rejoués
  ni signalés deux fois.

## 10. Données et confidentialité

| Donnée | Où | Sort de l'appareil |
| --- | --- | --- |
| Position | `localStorage`, jamais journalisée en clair dans les logs distants | jamais |
| Réglages, journal, registre | `localStorage` | jamais |
| Sons importés | IndexedDB (web) + stockage privé Android (natif) | jamais |
| Payload d'alarmes | SharedPreferences (Android) | jamais |
| Réseau | aucun appel applicatif ; le pont natif n'a pas `INTERNET` | — |

Le GPS n'est demandé qu'après un clic ; un refus laisse l'utilisateur choisir une ville ou saisir
des coordonnées. Le fuseau IANA vient de `Intl.DateTimeFormat().resolvedOptions().timeZone` pour un
fix GPS, et de la ville pour une sélection manuelle — jamais d'un simple décalage UTC, jamais d'une
adresse IP.

« Tout effacer » vide `localStorage`, supprime les sons importés d'IndexedDB et du stockage natif,
et réinitialise l'application. Le cache du service worker ne contient que les fichiers livrés avec
l'application.

## 11. Modes de défaillance assumés

| Panne | Comportement |
| --- | --- |
| Permission de notification refusée | l'Adhan audio peut sonner (web) ; l'état est affiché « autorisation manquante », pas de faux OK |
| Alarmes exactes refusées | payload conservé, résultat `deferred`, aucun timer de substitution |
| Processus tué avant l'armement | le payload est déjà persisté → réarmement au prochain événement système |
| Ville inconnue / fuseau invalide | erreur explicite à la saisie, jamais de valeur par défaut silencieuse |
| Événement manqué > 120 s | `missed`, notification « alarme manquée », jamais joué en retard |
| Audio natif indisponible | notification seule + mention explicite |
| Coquille absente du cache et réseau coupé | réponse 503 texte, pas de fausse page d'application |
