# Conception système — Azan Global

**Version** 1.0 · **Date** 27 octobre 2026 · **Périmètre** l'ensemble du dépôt
(`src/`, `tests/`, `public/`, `android/`, `docs/`).

**Nature du document.** Ce document décrit le système **tel qu'il est implémenté**, pas une cible
théorique. Chaque affirmation est rattachée à un fichier, un test ou une commande. Quand une partie
n'a pas été exécutée, c'est écrit explicitement.

**Langue.** La documentation de travail est en français ; le produit est proposé en arabe, français
et anglais.

---

## 0. Légende de statut

| Marque | Signification |
| --- | --- |
| **[V]** | **Vérifié dans cet environnement** : test automatisé exécuté, build produit, ou comportement observé dans Chromium. |
| **[É]** | **Écrit mais non exécuté** : le code existe et est relu, mais aucune compilation ni exécution n'a eu lieu ici (cas de tout le module Android). |
| **[N]** | **Non implémenté** ou hors périmètre assumé. |

Les commandes de référence sont `npx vitest run` (185 tests), `npx tsc --noEmit`,
`npm run build` (typecheck + garde-fou audio + `vite build`) et `npx vite preview`. Les résultats
détaillés sont dans [`TESTS.md`](TESTS.md) ; les limites dans [`LIMITES.md`](LIMITES.md).

---

## 1. Résumé exécutif

Azan Global calcule les cinq prières à partir de coordonnées, d'une date et d'un fuseau IANA, puis
déclenche l'Adhan. Le système repose sur **un seul moteur de calcul** (TypeScript pur) et **deux
hôtes** :

1. une **PWA** autonome, hors ligne, qui calcule et affiche, mais ne peut rappeler que tant que la
   page est vivante ;
2. une **application Android** qui embarque le même bundle dans une WebView et ajoute la seule chose
   qu'un navigateur ne sait pas faire : des alarmes `AlarmManager` qui survivent à la fermeture de
   l'application, au redémarrage et à l'écran verrouillé.

La décision structurante est de **ne jamais confondre les deux chemins**. Le mode web est étiqueté
« onglet ouvert uniquement » ; le mode natif est le seul à afficher `scheduled`. Aucun timer
JavaScript ne sert de faux repli à une alarme système refusée.

Le système n'a **aucun serveur**, **aucun compte**, **aucun appel réseau applicatif**. La version
Android ne déclare même pas la permission `INTERNET`.

### Chiffres clés

| Élément | Valeur | Statut |
| --- | ---: | --- |
| Tests automatisés | 90 dans 4 fichiers | [V] |
| Comparaisons de référence externe | 180 champs, écart max 3 min | [V] |
| Comparaisons de fuseaux contre ICU | 1 736 (434 zones × 4 instants) | [V] |
| Zones IANA embarquées | 434, de 2018 à 2045 | [V] |
| Méthodes de calcul | 23 entrées, 22 calculables | [V] |
| Profils de pays | 84, dont 0 certifié par une autorité | [V] |
| Villes du catalogue | 47 735 (46 039 au Maroc, dump `MA.txt`) ; 1 996 dans le bundle initial | [V] |
| Bundle web | 529,73 kB JS (158,98 kB gzip), 45,05 kB CSS — `cities-core.json` (311 Kio) inclus | [V] |
| Service worker | 5,28 kB, 20 entrées précachées (Adhan CC0 + 3 carillons, aucun enregistrement fourni) | [V] |
| APK / AAB | **aucun** | [É] code Android non compilé |

---

## 2. Objectifs, non-objectifs et contraintes

### 2.1 Objectifs

| Id | Objectif | Critère de réussite | Preuve |
| --- | --- | --- | --- |
| O1 | Calculer les cinq prières localement | Résultat déterministe, sans réseau | `tests/engine.test.ts` |
| O2 | Sonner à l'heure, application fermée | Alarme système réarmée après redémarrage | Code Android [É] ; non prouvé sur appareil |
| O3 | Ne jamais mentir sur une garantie | Chaque état affiché correspond à une capacité réelle | `diagnostics.ts`, `alarm-engine.ts` |
| O4 | Fonctionner hors ligne | Coquille et assets servis par le service worker | `tests/service-worker.test.ts` [V] |
| O5 | Être utilisable en AR/FR/EN, RTL compris | Aucune clé manquante, mise en page miroir | `i18n.ts` typé, vérification navigateur [V] |
| O6 | Respecter la vie privée | Aucune donnée ne quitte l'appareil | Manifest sans `INTERNET`, revue de code |
| O7 | Laisser l'utilisateur corriger la méthode | Méthode, madhhab, hautes latitudes, minutes | Écrans `methods`, `settings` [V] |
| O8 | Garder le cœur testable hors UI | Aucun import DOM dans `src/core` | Revue des imports, `tsc` |

### 2.2 Non-objectifs

| Id | Non-objectif | Raison |
| --- | --- | --- |
| N1 | Comptes, synchronisation, sauvegarde cloud | Contraires au hors ligne ; ajouteraient un serveur et des données personnelles. |
| N2 | Notifications push distantes | Imposent un serveur et l'envoi d'un identifiant. |
| N3 | Qibla, Coran, hadiths, calendrier Ramadan | Hors périmètre fonctionnel. |
| N4 | Enregistrements d'Adhan **redistribuables** | Huit fichiers fournis sont intégrés, mais leur licence est inconnue : ils ne sont pas publiables sans accord écrit. |
| N5 | Certification religieuse d'une méthode | Nécessite une validation humaine et une source locale officielle. |
| N6 | Application iOS / Flutter / desktop natif | Décision d'architecture : PWA + Android natif (voir ADR-003). |
| N7 | APK signé et publié sur le Play Store | Aucun JDK/SDK dans l'environnement, aucun keystore. |

### 2.3 Contraintes

| Id | Contrainte | Conséquence de conception |
| --- | --- | --- |
| C1 | Aucun réseau à l'heure de la prière | Tout est calculé et stocké localement ; l'absence de réseau n'est pas un mode dégradé. |
| C2 | Le navigateur ne réveille pas un appareil | Deux modes explicites ; le web ne promet jamais de sonnerie en arrière-plan. |
| C3 | Les règles de fuseau de l'hôte peuvent être fausses | Table de transitions embarquée, `Intl` seulement en secours. |
| C4 | Android 8 → 15 (API 26 → 35) | `setAlarmClock`, `setExactAndAllowWhileIdle`, canaux de notification, permissions runtime. |
| C5 | Aucun JDK/SDK Android ici | Le module Android est livré comme source à compiler, pas comme binaire validé. |
| C6 | Stockage local limité (~5 Mo pour `localStorage`) | Journal et registre plafonnés ; audio en IndexedDB, pas en base64. |
| C7 | Aucune police distante | Rendu dépendant des polices de l'appareil ; choix assumé et documenté. |

---

## 3. Exigences → décisions → preuve

| Exigence | Décision de conception | Où | Statut |
| --- | --- | --- | --- |
| Horaires exacts et reproductibles | Moteur astronomique pur, sans horloge implicite : la date et le lieu sont des entrées | `core/astro.ts`, `core/prayertimes.ts` | [V] |
| Changement d'heure sans décalage | Le moteur retourne des instants UTC ; le fuseau ne sert qu'à l'affichage | `core/timezone.ts` | [V] |
| Fuseau fiable malgré un OS obsolète | Table embarquée 2018–2045, `Intl` en secours, désaccord affiché | `core/tzdata.ts`, `data/tzdata.json` | [V] |
| Cinq prières, pas six | `PrayerKey` exclut le lever du soleil ; `sunrise` est un marqueur solaire | `core/types.ts` | [V] |
| Méthodes multiples et corrigeables | Catalogue + corrections de méthode + corrections utilisateur | `core/methods.ts` | [V] |
| Profils pays extensibles | Table par code ISO, fuseau IANA dans la ville, aucune liste figée du monde | `core/profiles.ts`, `app/cities.ts` | [V] |
| Alarme application fermée | `AlarmManager` + `BroadcastReceiver` + service de premier plan | `android/**` | [É] |
| Pas de double sonnerie | `eventKey` + registre persistant, web et natif | `app/store.ts`, `ScheduleStore.kt` | [V] web / [É] natif |
| Pas de sonnerie en retard | Fenêtre de grâce de 120 s ; au-delà, `missed` sans audio | `alarm-engine.ts`, `AdhanReceiver.kt` | [V] web / [É] natif |
| Audio sans chevauchement | Un seul lecteur web ; un seul service et un seul `MediaPlayer` natif | `app/audio.ts`, `AdhanService.kt` | [V] web / [É] natif |
| Import de son personnel | Blob en IndexedDB, vérification d'existence avant lecture | `app/audio.ts` | [V] |
| Interface RTL complète | `dir="rtl"` sur `<html>`, propriétés logiques, navigation miroir | `app/main.ts`, `styles.css` | [V] |
| Accessibilité | Un `h1` par écran, noms accessibles, focus, contraste | `screens/*`, Lighthouse | [V] |
| Diagnostic honnête | États dérivés de l'état réel ; auto-test qui refuse de conclure sur l'impossible | `screens/diagnostics.ts`, `AlarmEngine.selfTest()` | [V] |
| Hors ligne réel | Service worker généré, précache indépendant, navigation avec repli | `pwa/sw-template.ts` | [V] en `node:vm` |

---

## 4. Contexte (C4 niveau 1)

```
                         ┌──────────────────────────────┐
                         │          Utilisateur          │
                         │  choisit lieu, méthode, sons  │
                         └──────────────┬───────────────┘
                                        │
              ┌─────────────────────────┴─────────────────────────┐
              │                                                   │
              ▼                                                   ▼
   ┌───────────────────────┐                         ┌──────────────────────────┐
   │ Navigateur / PWA      │                         │ Android (téléphone)      │
   │ onglet ou app installée│                        │ application + OS         │
   └───────────┬───────────┘                         └────────────┬─────────────┘
               │                                                   │
               │ calcule, affiche,                               │ WebView + AlarmManager
               │ rappelle si l'onglet vit                         │ + notifications + audio
               │                                                   │
               └───────────────────┬───────────────────────────────┘
                                   │
                    ┌──────────────▼───────────────┐
                    │   Aucun serveur applicatif    │
                    │   aucun compte, aucun push    │
                    └──────────────────────────────┘

   Sources utilisées uniquement au build / dans les tests :
   GeoNames (dump MA.txt + cities15000) · ICU (tzdata, Umm al-Qura) · API AlAdhan (référence de test)
```

### Acteurs et systèmes externes

| Élément | Type | Interaction | Données échangées |
| --- | --- | --- | --- |
| Utilisateur | Acteur | Saisie, choix, permissions | Ville/coordonnées, méthode, son |
| Navigateur | Plateforme | Exécute le bundle, stocke localement | Aucune sortie réseau |
| Android OS | Plateforme | Réveille l'appareil, applique Doze, permissions | Instants d'alarme, notifications |
| WebView Android | Plateforme | Héberge le même bundle | Payload JSON via `window.AzanNative` |
| GeoNames | Source de build | Génère `cities-core.json`, `index.json`, `ma-XX.json` | Bundle + fichiers statiques |
| ICU | Source de build | Génère `tzdata.json`, calendrier hégirien | Statique, embarqué |
| AlAdhan | Référence de test | Compare 18 lieux / 33 dates | Hors runtime |

**Frontière de confiance.** Tout ce qui est dans l'appareil est traité comme privé. Le seul point
d'entrée natif est un pont JavaScript exposé à une WebView qui ne charge que des assets locaux.

---

## 5. Conteneurs (C4 niveau 2)

| Id | Conteneur | Technologie | Responsabilité | État local | Statut |
| --- | --- | --- | --- | --- | --- |
| C1 | Application web | TypeScript + DOM, Vite | Écrans, routage, interactions | `localStorage`, IndexedDB | [V] |
| C2 | Service worker | JS généré par Vite | Précache, navigation hors ligne | Cache API | [V] |
| C3 | Moteur de calcul | TypeScript pur | Astronomie, méthodes, planning | Aucun | [V] |
| C4 | Réglages | `localStorage['azan.settings.v1']` | Préférences, journal, registre | ~quelques dizaines de Ko | [V] |
| C5 | Sons importés | IndexedDB `azan-audio/files` + copie privée Android | Blobs audio | 30 Mo max par fichier | [V] web / [É] natif |
| C6 | Coque Android | Kotlin, Compose, WebView | Héberger C1, fournir les alarmes | `SharedPreferences` | [É] |
| C7 | Pont natif | `@JavascriptInterface` | `schedule`, permissions, diagnostic | — | [É] |
| C8 | Ordonnanceur | `AlarmManager` | Réveil à l'instant exact | Payload + registre | [É] |
| C9 | Persistance native | `SharedPreferences` (`commit()`) | Payload, ledger, dernier résultat | Petit JSON | [É] |
| C10 | Service audio | Foreground service + `MediaPlayer` | Lire l'Adhan, focus, stop | Un lecteur | [É] |
| C11 | Notifications | Canaux Android | Adhan, pré-rappel, statut | — | [É] |
| C12 | Diagnostic natif | Compose | État réel des alarmes et permissions | Lecture seule | [É] |

### Déploiement

```
┌──────────────────────────────┐        ┌─────────────────────────────────────┐
│ Hébergeur statique HTTPS     │        │ APK Android                         │
│  dist/                       │        │  assets/web/  ← copie de dist/      │
│  index.html, assets/, sw.js  │        │  res/raw/chime_*.wav                │
└──────────────┬───────────────┘        │  classes.dex (Kotlin/Compose)       │
               │                        └──────────────┬──────────────────────┘
               │ chargement                               │ WebView
               ▼                                          ▼
        Navigateur / PWA                          MainActivity + AzanBridge
        (même bundle, même moteur)                (même bundle, même moteur)
```

Un seul artefact web (`dist/`) est produit. L'APK le copie au build ; il n'existe pas de seconde
implémentation de l'interface ni du calcul.

---

## 6. Composants (C4 niveau 3)

### 6.1 Cœur pur (`src/core/`)

| Module | Rôle | API principale | Dépend de |
| --- | --- | --- | --- |
| `types.ts` | Types du domaine, clés de prière, états d'alarme | `PrayerKey`, `PrayerTimes`, `GeoLocation` | — |
| `astro.ts` | Géométrie solaire : déclinaison, équation du temps, hauteur | `sunPosition`, `hourAngleAtAltitude` | — |
| `prayertimes.ts` | Pipeline Fajr → Isha, hautes latitudes, corrections | `calculatePrayerTimes`, `labelFor` | `astro`, `methods` |
| `methods.ts` | Catalogue AlAdhan, angles, intervalles, corrections | `METHODS`, `getMethod`, `selectableMethods` | `types` |
| `profiles.ts` | Profils pays par code ISO | `getCountryProfile`, `countryName` | `methods`, `types` |
| `timezone.ts` | Offset, date locale, formatage, conversions | `offsetMinutesAt`, `dateKeyInTimeZone`, `formatInZone` | `tzdata` |
| `tzdata.ts` | Lecture binaire de la table | `bundledOffsetMinutes`, `bundledZones` | `data/tzdata.json` |
| `schedule.ts` | Fenêtres multi-jours, prochaine prière, compte à rebours | `buildSchedule`, `computeWindow`, `findNext` | `prayertimes`, `timezone` |
| `hijri.ts` | Date hégirienne | `hijriFor` | `Intl` |

**Règles de dépendance.** `core` n'importe ni DOM, ni `window`, ni `localStorage`, ni réseau. Aucun
module de `core` ne lit l'horloge implicitement : `now` est toujours un paramètre. C'est ce qui rend
les tests déterministes et le moteur réutilisable.

### 6.2 Application (`src/app/`)

| Module | Rôle | Point notable |
| --- | --- | --- |
| `main.ts` | Amorçage, routeur hash, rendu complet, cycle de vie | Rendu coalescé par `requestAnimationFrame` + secours 150 ms |
| `context.ts` | Contexte injecté aux écrans | Aucun écran ne touche à un singleton |
| `store.ts` | Réglages, journal, registre de livraison | `structuredClone` + persistance + abonnés |
| `alarm-engine.ts` | Planification, livraison, anti-doublon, auto-test | Deux modes, aucun troisième |
| `audio.ts` | Lecture et import | Un seul `HTMLAudioElement`, vérification avant succès |
| `notifications.ts` | Permission, affichage, pont natif | Le pont est la seule vérité dans la WebView |
| `location.ts` | GPS, ville, coordonnées | Jamais de fuseau déduit d'un offset |
| `cities.ts` | Catalogue découpé, recherche et tri | Core 1 996 embarqué, index 46 039 et régions à la demande, normalisation ar/fr/latin |
| `tasbih.ts` | État du compteur, sessions, historique | Persistance immédiate, undo borné, aucun classement |
| `i18n.ts` | Traductions typées | Le français est la source ; une clé manquante casse `tsc` |
| `labels.ts` | Libellés et tons des états d'alarme | « manquée » n'est jamais verte |
| `ui.ts` | Fabriques DOM, feuilles, composants | `textContent` par défaut |
| `screens/*` | 8 écrans (dont Tasbih) | Aucun calcul d'horaire |

### 6.3 PWA (`src/pwa/`, `vite.config.ts`)

| Élément | Rôle |
| --- | --- |
| `sw-template.ts` | Gabarit du worker : précache, stratégies, clic notification |
| `vite.config.ts` | Émet `sw.js` avec la liste réelle des fichiers du build |
| `public/manifest.webmanifest` | Métadonnées d'installation, icônes, couleurs |
| `public/audio/*.wav` | Trois carillons synthétisés |
| `public/audio/adhan/adhan-cc0.mp3` | Adhan CC0 vérifié, livré et sélectionné par défaut |
| `public/data/cities/` | `index.json` (46 039 entrées) + `ma-XX.json` (13 régions), chargés à la demande et mis en cache |
| `public/patterns/zellige.svg` | Tuile zellige originale utilisée comme masque CSS (aucune image stock) |

### 6.4 Android (`android/app/src/main/java/app/azan/global/`)

| Classe | Rôle |
| --- | --- |
| `AzanApplication` | Création des canaux, initialisation |
| `MainActivity` | WebView, `WebViewAssetLoader`, pont, cycle de vie |
| `AzanBridge` | Surface `window.AzanNative` |
| `NativeAlarmScheduler` | `sync`, `arm`, `cancel`, `scheduleTest` |
| `ScheduleStore` | Payload, ledger `fired`, dernier résultat, locale |
| `AdhanReceiver` | Livraison à Most-once, grâce, repli audio |
| `AdhanService` | Service de premier plan, `MediaPlayer`, focus |
| `SystemEventReceiver` | Réarmement boot / heure / fuseau / mise à jour |
| `Notifications` | Canaux et constructions de notifications |
| `LocaleHelper` | Applique la langue choisie dans l'UI |
| `Sounds` | Table `soundId` → `R.raw` |
| `AlarmPayload` | Parsing du JSON, `ArmResult` |
| `NativeDiagnosticsActivity` | Écran Compose de diagnostic réel |
| `WebAssetHandler` | Mapping `https://appassets.androidplatform.net/` → assets |

**Sens des dépendances.** `core` ne connaît personne ; `app` connaît `core` ; les écrans connaissent
`app` ; Android ne calcule rien et ne fait qu'exécuter des instants fournis par le web. Une formule
astronomique en Kotlin serait une seconde source de vérité non testée.

---

## 7. Domaine et invariants

### 7.1 Entités et objets-valeurs

| Objet | Nature | Champs essentiels |
| --- | --- | --- |
| `GeoLocation` | Valeur | latitude, longitude, altitude, `timeZone` IANA, pays, source |
| `CalculationSettings` | Valeur | `methodId`, `asrSchool`, `highLatitudeRule`, corrections |
| `PrayerPreference` | Entité | activé, audio, son, pré-rappel, vibration, notification seule |
| `PrayerTimes` | Valeur | 5 `Date` absolues + `sunrise`, `midnight`, `solarNoon` |
| `PrayerEvent` | Valeur | prière, instant, libellé local, date locale |
| `PlannedAlarm` | Entité | `eventKey`, type, instant, son, état |
| `FireRecord` | Événement | clé, instant prévu, instant réel, résultat, détail |
| `Settings` | Agrégat | toutes les préférences + journal + registres |

### 7.2 Invariants

| Id | Invariant | Application | Preuve |
| --- | --- | --- | --- |
| I1 | Il existe exactement cinq prières ; le lever du soleil n'en est pas une | `PRAYER_KEYS` | `engine.test.ts` |
| I2 | Un horaire est un instant UTC, jamais une chaîne « HH:MM » | `PrayerTimes` | `engine.test.ts`, revue |
| I3 | La date d'un événement est la date **locale du lieu**, pas la date UTC | `dateKeyInTimeZone` | `timezone.test.ts` |
| I4 | Les cinq prières d'un jour sont strictement ordonnées | Tri + tests | `engine.test.ts` |
| I5 | Une clé `date:prière[:pre]` identifie un événement unique | `eventKeyFor` | `alarm-engine.test.ts` |
| I6 | Un `eventKey` ne peut être livré qu'une fois | Registre persistant | `alarm-engine.test.ts`, `AdhanReceiver.kt` |
| I7 | Un événement de plus de 120 s de retard n'est jamais joué | `MISSED_GRACE_MS` | `alarm-engine.test.ts`, `AdhanReceiver.kt` |
| I8 | Le mode natif n'utilise aucun timer JS pour livrer | `replan()` | `alarm-engine.test.ts` |
| I9 | Aucun fuseau n'est déduit d'un offset UTC ou d'une IP | `GeoLocation.timeZone` | Revue, tests |
| I10 | Une méthode s'applique **avant** les corrections utilisateur | `totalAdjustment` | `CALCUL.md`, tests |
| I11 | Une prière non calculable vaut `null`, jamais une heure inventée | `MaybeDate` | `engine.test.ts` |
| I12 | Aucun profil pays n'est certifié sans comparaison humaine | `verifiedAgainstLocalAuthority` | `profiles.ts` |
| I13 | La langue ne modifie jamais le calcul | Store séparé | `i18n.ts` |
| I14 | Un état « programmé » n'est affiché que si le chemin existe réellement | `stateFor()` | `diagnostics.ts` |
| I15 | Le payload natif est persisté avant l'armement | `AzanBridge.schedule` | Code [É] |
| I16 | Un événement manqué n'est jamais peint en vert | `missedKeys`, `stateFor` | `alarm-engine.test.ts` |

### 7.3 Contexte métier (bounded contexts)

| Contexte | Responsabilité | Ne fait pas |
| --- | --- | --- |
| Calcul | Astronomie, méthodes, hautes latitudes | Stockage, UI, alarmes |
| Temps | Fuseaux, dates, formatage | Astronomie |
| Horaires & alarmes | Planification, livraison, anti-doublon | Calcul astronomique |
| Préférences | Réglages, journal, import de sons | Décision de livraison |
| Localisation | GPS, ville, coordonnées, zone | Conversion d'offset |
| Présentation | Rendu, i18n, accessibilité | Toute règle métier |

---

## 8. Modèle temporel

C'est la partie la plus critique : une erreur d'une heure est silencieuse et destructrice pour un
horaire de prière.

### 8.1 Définitions

| Terme | Définition | Exemple |
| --- | --- | --- |
| Instant | Point absolu sur la ligne du temps, stocké en `Date`/ISO UTC | `2026-10-27T16:19:18.367Z` |
| Date locale | Jour civil `YYYY-MM-DD` dans le fuseau du lieu | `2026-10-27` |
| Heure murale | Champs année/mois/jour/heure/minute/secondes dans un fuseau | `16:19` |
| Fuseau | Identifiant IANA | `Africa/Casablanca` |
| Offset | Décalage en minutes à un instant donné | `UTC+01:00` |
| `dateKey` | Clé de jour local, utilisée par le calendrier et les alarmes | `2026-10-27` |
| `eventKey` | Identité de livraison | `2026-10-27:asr` |

### 8.2 Pipeline de calcul

```
(dateKey, lat, lon, alt, methodId, asrSchool, rule, adjustments)
        │
        ▼
1. dateKey → midi UTC de référence (12:00 UTC), décalé par la longitude ;
   la date locale est vérifiée près de la ligne de changement de date
        │
        ▼
2. astro.ts : déclinaison, équation du temps, hauteur du soleil
        │
        ▼
3. prayertimes.ts :
   Fajr (angle) · Sunrise (0,833°) · Dhuhr (transit + correction)
   Asr (facteur d'ombre 1 ou 2) · Maghrib (coucher, +min, ou angle)
   Isha (angle, ou intervalle après coucher)
        │
        ▼
4. hautes latitudes : none / middleOfNight / seventhOfNight /
   angleBased / nearestLatitude
        │
        ▼
5. corrections : méthode (documentées/observées) + utilisateur (minutes)
        │
        ▼
6. PrayerTimes { fajr, sunrise, dhuhr, asr, maghrib, isha, midnight,
                 solarNoon } en instants UTC
        │
        ▼
7. schedule.ts : tri, prochaine prière, fenêtre de N jours
        │
        ▼
8. alarm-engine.ts : eventKey, pré-rappels, plan, livraison
```

### 8.3 Pourquoi les instants d'abord

Une prière est un **instant astronomique**. Si le moteur retournait `18:48`, il faudrait ensuite
décider dans quel fuseau cette chaîne est valide, puis la reconvertir en instant pour programmer
l'alarme. Chaque conversion serait une occasion de décaler d'une heure, en particulier aux
transitions DST.

Le système applique donc la règle inverse : l'instant est calculé une fois, puis **formaté** pour
l'affichage avec `formatInZone(instant, zone)`. Changer la langue ou le fuseau d'affichage ne
recalcule rien et ne déplace aucune alarme.

### 8.4 Le cas marocain, preuve du besoin

Sur Windows/Chromium, `Intl` applique encore la règle marocaine d'avant 2018 : le 27 octobre 2026,
`Africa/Casablanca` y est vu comme **UTC+0**, alors que le Maroc est à **UTC+1** (et UTC+0 pendant
Ramadan). Utiliser l'OS comme unique source aurait affiché toutes les prières une heure trop tôt,
sans aucune erreur visible.

La table embarquée répond **UTC+1**. Le diagnostic compare les deux et affiche :

```
OS UTC+00:00 → table UTC+01:00
```

La table est utilisée ; le désaccord est rendu visible au lieu d'être masqué. C'est un choix de
conception, pas un détail d'implémentation.

### 8.5 Table de fuseaux

| Propriété | Valeur |
| --- | --- |
| Fichier | `src/core/data/tzdata.json` |
| Taille | 34,4 Kio (35 270 octets) |
| Couverture | `2018-01-01` → `2045-01-01` |
| Zones | 434 |
| Transitions | 2 033 |
| Séries partagées | 90 |
| Source | ICU de Node 24.19.0, tz 2026b |
| Recherche | binaire sur un tableau plat `[offset, transition, offset, …]` |
| Hors plage / zone inconnue | `null` → repli sur `Intl` |

Le format plat et la recherche binaire expliquent le coût négligeable : formater un mois de prières
ne déclenche pas des milliers de créations de `Intl.DateTimeFormat`.

### 8.6 Deux horloges à ne pas confondre

| Horloge | Sert à | Risque |
| --- | --- | --- |
| Astronomie (calculée) | Déterminer l'instant de la prière | Erreur de modèle ±1 min sur 1900–2100 |
| Horloge de l'appareil | Déclencher l'alarme | Si elle est fausse, l'alarme sonne à l'heure fausse |

Aucune synchronisation NTP n'est faite : elle exigerait le réseau. Le système ne peut donc pas
corriger une horloge système erronée ; il peut seulement garantir que l'instant calculé est correct.
C'est documenté dans [`LIMITES.md`](LIMITES.md).

### 8.7 Cas limites traités

| Cas | Traitement | Preuve |
| --- | --- | --- |
| Changement d'heure (printemps/automne) | L'instant reste fixe ; seul le libellé change | `engine.test.ts` |
| Ligne de changement de date (Auckland, Honolulu) | `dateKey` calculé dans la zone, pas en UTC | `engine.test.ts` |
| Zone à 30 ou 45 minutes | Offset lu tel quel | `timezone.test.ts` |
| Lord Howe (DST de 30 min) | Offset non arrondi à l'heure | `timezone.test.ts` |
| Nuit polaire / jour polaire | Règle explicite ou `null` | `engine.test.ts` |
| 29 février | `addDaysToKey` gère le calendrier grégorien | `engine.test.ts` |
| Minuit local | La clé de date bascule à minuit local | `timezone.test.ts` |
| Entrée invalide | `EngineInputError`, pas de `NaN` | `engine.test.ts` |

---

## 9. Modèle de données

### 9.1 Web — `localStorage['azan.settings.v1']`

| Champ | Type | Rôle | Rétention |
| --- | --- | --- | --- |
| `version` | `1` | Version du schéma | — |
| `locale` | `fr \| en \| ar` | Langue de l'UI et des notifications natives | — |
| `theme` | `auto \| light \| dark` | Thème | — |
| `onboarded` | booléen | A-t-on terminé l'accueil | — |
| `location` | `GeoLocation \| null` | Position, zone IANA, source | Jusqu'à remplacement |
| `calculation` | objet | Méthode, madhhab, hautes latitudes, corrections | — |
| `prayers` | 5 objets | activation, audio, son, pré-rappel, vibration | — |
| `showHijri` | booléen | Afficher la date hégirienne | — |
| `notificationsWanted` | booléen | Intention de l'utilisateur | — |
| `sounds` | `SoundMeta[]` | Métadonnées des sons importés | — |
| `fajrSoundOverride` | `string \| null` | Son spécifique Fajr | — |
| `lastRecalculatedAt` | nombre | Dernier recalcul | — |
| `log` | `LogEntry[]` | 200 dernières entrées | Tronqué à 200 |
| `firedKeys` | `string[]` | Clés déjà livrées | Tronqué à 200 |
| `missedKeys` | `string[]` | Sous-ensemble jamais délivré | Tronqué à 200 |
| `diagnosticsWindowDays` | `1..31` | Fenêtre affichée | — |

**Hydratation.** `hydrate()` fusionne les données stockées sur les valeurs par défaut, champ par
champ. Un champ ajouté dans une version future ne casse pas les données existantes ; un champ
manquant prend sa valeur par défaut. Les tableaux sont validés (`Array.isArray`) avant usage.

**Pourquoi `localStorage` et pas IndexedDB pour les réglages.** Les réglages sont petits, lus de
façon synchrone au démarrage, et doivent être disponibles avant le premier rendu. L'audio, volumineux
et binaire, va en IndexedDB.

### 9.2 Web — IndexedDB `azan-audio` / magasin `files`

| Champ | Type | Rôle |
| --- | --- | --- |
| `id` | string | Identifiant du son (`import-<timestamp>-<random>`) |
| `name` | string | Nom du fichier |
| `mime` | string | Type MIME |
| `blob` | Blob | Contenu audio |
| `createdAt` | number | Date d'import |

Taille maximale acceptée : 30 Mo par fichier. Aucun fichier ne quitte l'appareil. La suppression
d'un son supprime le blob et la métadonnée.

### 9.3 Android — `SharedPreferences` (`azan.schedule`)

| Clé | Type | Rôle |
| --- | --- | --- |
| `payload` | string JSON | Plan complet reçu du web |
| `locale` | string | Langue à appliquer aux notifications |
| `fired` | `Set<String>` | Ledger des `eventKey` déjà livrés |
| `savedAt` | long | Date de sauvegarde du payload |
| `lastResult` | string JSON | Dernier `FireRecord` |
| `lastSync` | string JSON | Dernier `ArmResult` |
| `lastSyncSource` | string | `sync`, `boot`, etc. |
| `lastSyncAt` | long | Date du dernier sync |
| `notificationAsked` | booléen | La permission a-t-elle déjà été demandée |

**Pourquoi `commit()`.** Les écritures critiques se produisent dans `BroadcastReceiver.onReceive`,
qui doit terminer vite et ne peut pas perdre un marqueur « déjà sonné » si le processus est tué
juste après. `apply()` est asynchrone : une écriture perdue rejouerait une prière. Le payload est un
petit JSON, une base relationnelle n'apporterait rien.

**Élagage.** `save()` conserve l'intersection du ledger avec les clés du nouveau payload. Le ledger
ne grandit donc pas indéfiniment tout en garantissant une livraison par `date:prière[:pre]`.

### 9.4 Deux registres, volontairement séparés

| Registre | Où | Qui l'écrit | Qui le lit |
| --- | --- | --- | --- |
| Web `firedKeys` / `missedKeys` | `localStorage` | `AlarmEngine.fire()` / `deliverDue()` | UI web, diagnostic web |
| Android `fired` | `SharedPreferences` | `AdhanReceiver.onReceive()` | Récepteur natif, diagnostic natif |

Ils ne sont **pas synchronisés**. Ce n'est pas un oubli : le mode natif ne fait pas livrer la page,
donc le registre web n'a pas à connaître les livraisons de l'OS. Le diagnostic natif montre le
dernier résultat réel ; le diagnostic web montre l'état du plan web. Cette séparation évite qu'un
événement livré par l'OS soit rejoué par la page, et inversement.

**Limite associée :** un événement manqué côté natif n'apparaît pas comme `missed` dans l'UI web ; il
est visible dans `lastResult` de l'écran Compose. Voir §22.

### 9.5 Cycle de vie et effacement

| Action | Effet |
| --- | --- |
| Modification d'un réglage | `update()` clone, applique, persiste, notifie → `replan()` + rendu |
| Changement de lieu | Nouveau `GeoLocation`, recalcul complet, ancien plan remplacé |
| « Tout effacer » | `wipe()` : supprime `localStorage`, les sons IndexedDB, réinitialise l'UI |
| Export | JSON local non chiffré, écrit par l'utilisateur |
| Désinstallation Android | `allowBackup=false` : aucune sauvegarde cloud, tout est perdu |
| Mise à jour de l'APK | `MY_PACKAGE_REPLACED` → `sync()` sur le payload conservé |

---

## 10. Contrats d'interface

### 10.1 API du moteur

| Fonction | Entrées | Sortie | Erreurs |
| --- | --- | --- | --- |
| `calculatePrayerTimes(dateKey, loc, settings)` | jour local, lieu, réglages | `PrayerTimes` (instants ou `null`) | `EngineInputError` |
| `buildSchedule(now, loc, settings)` | instant, lieu, réglages | `DaySchedule` (aujourd'hui + demain) | idem |
| `computeWindow(startKey, days, loc, settings)` | clé, nombre de jours | `PrayerTimes[]` | idem |
| `findNext(events, now)` | événements, instant | `{ next, current, index }` | — |
| `eventKeyFor(dateKey, prayer)` | clé, prière | `string` | — |
| `offsetMinutesAt(instant, zone)` | instant, IANA | minutes | repli `Intl`, puis 0 |
| `formatInZone(instant, zone)` | instant, IANA | `"HH:MM"` | — |

### 10.2 Pont web ↔ natif

`window.AzanNative` est injecté par `MainActivity`. Toutes les méthodes sont optionnelles côté
TypeScript, car la PWA doit fonctionner sans pont.

| Méthode | Type | Comportement |
| --- | --- | --- |
| `schedule(payloadJson)` | `string` | Persiste, annule les alarmes obsolètes de l'ancien plan, arme, puis renvoie `{armed, skipped, deferred, reason, stored}` |
| `lastSyncResult()` | `string` | Dernier résultat natif avec source et horodatage |
| `cancelAll()` | `void` | Réservé à l'absence de plan : annule les `PendingIntent` du payload et l'efface ; garde le ledger |
| `importSound(id, name)` | `string` | Copie le fichier choisi dans le stockage privé ; renvoie `{ok, reason}` |
| `deleteImportedSound(id)` | `void` | Supprime la copie native |
| `listImportedSounds()` | `string` | Métadonnées des sons natifs disponibles |
| `canScheduleExactAlarms()` | `boolean` | État réel de l'OS |
| `requestExactAlarmPermission()` | `void` | Ouvre « Alarmes et rappels » |
| `isIgnoringBatteryOptimizations()` | `boolean` | Utile face aux surcouches |
| `openNotificationSettings()` | `void` | Écran de notifications de l'app |
| `platform()` | `string` | Ex. `Android 16 (API 36)` |
| `notificationPermission()` | `granted \| denied \| default` | **Indispensable** : la WebView rapporte toujours `denied` pour l'API web |
| `requestNotificationPermission()` | `void` | Demande `POST_NOTIFICATIONS` (API 33+) |
| `openNativeDiagnostics()` | `void` | Ouvre l'écran Compose |

Le pont émet aussi `window.dispatchEvent(new Event('azan:permissions-changed'))` depuis `onResume`
et `onRequestPermissionsResult`, ce qui force le diagnostic web à relire l'état réel.

### 10.3 Payload d'alarmes

```json
{
  "timeZone": "Africa/Casablanca",
  "latitude": 33.5731,
  "longitude": -7.5898,
  "scheduledAt": "2026-10-27T08:12:44.120Z",
  "locale": "fr",
  "alarms": [
    {
      "eventKey": "2026-10-27:asr",
      "prayer": "asr",
      "kind": "adhan",
      "atIso": "2026-10-27T15:19:18.367Z",
      "soundId": "chime-calm"
    },
    {
      "eventKey": "2026-10-27:asr:pre",
      "prayer": "asr",
      "kind": "pre-reminder",
      "atIso": "2026-10-27T15:09:18.367Z",
      "soundId": null
    }
  ]
}
```

Règles de parsing :

- `timeZone` et `alarms` sont obligatoires ; une alarme sans `eventKey` ou `atIso` valide est ignorée ;
- les instants sont triés par `atMillis` ;
- `locale` est optionnel côté Kotlin (repli `fr`), mais toujours envoyé par le web depuis la
  correction du 27/10/2026 ;
- aucun champ calculable (heure murale, offset) n'est transporté : le natif ne doit pas recalculer.

### 10.4 Résultats de livraison

`FireRecord` (web et natif) :

| `outcome` | Signification | Audio |
| --- | --- | --- |
| `notified` | Notification affichée, pas d'audio demandé | — |
| `audio` (natif) | Service audio démarré | oui |
| `audio-failed` (web) | Le son n'a pas pu être joué | non |
| `notification-failed` | Permission absente ou affichage refusé | — |
| `skipped-disabled` | Prière désactivée ou doublon | non |
| `missed` | Plus de 120 s de retard | non |
| `notify-no-audio` (natif) | Son importé introuvable ou service refusé | non |
| `bridge-error` | Le pont a rejeté un appel | — |

`ArmResult` (natif) :

| Champ | Sens |
| --- | --- |
| `armed` | Nombre d'alarmes réellement confiées à `AlarmManager` |
| `skipped` | Événements passés ou refusés à l'armement |
| `deferred` | Permission d'alarmes exactes absente ; le payload est conservé |
| `reason` | `no-schedule`, `exact-alarms-denied`, `arm-failed`… |

### 10.5 Compatibilité

| Interface | Stratégie |
| --- | --- |
| Réglages | `version: 1` + hydratation champ par champ |
| Payload natif | Champs inconnus ignorés ; champs manquants → valeurs de repli |
| Pont natif | Méthodes optionnelles ; l'UI teste leur présence avant appel |
| Méthode inconnue | Repli sur MWL (`DEFAULT_METHOD_ID = 3`) |
| Zone inconnue | `null` de la table → `Intl` → `UTC` en dernier recours |
| Cache SW | `CACHE_VERSION` manuel ; nouveau worker sans `skipWaiting` automatique |

---

## 11. Flux principaux

### 11.1 Démarrage et onboarding

```
main.ts
  ├─ SettingsStore() : lit localStorage, hydrate
  ├─ AlarmEngine(store, player)
  ├─ registerServiceWorker()
  ├─ start() : replan('start')
  └─ route : onboarded ? #/home : onboarding
        │
        ├─ choix langue → store.locale → <html lang dir>
        ├─ choix lieu (GPS / ville / coordonnées)
        ├─ choix méthode (profil pays appliqué une seule fois)
        └─ notifications → permission → replan
```

L'application est utilisable sans lieu : les écrans affichent alors une invitation, et aucune alarme
n'est planifiée. Elle ne fabrique jamais de coordonnées par défaut.

### 11.2 Replanification web

```
SettingsStore.update()
   → subscribers (main.ts)
       → engine.replan('settings')
            ├─ clearTimer()
            ├─ buildPlan(now, days)
            │    └─ computeWindow(todayKey, days+1)
            ├─ deliverDue(now, hadPlan)   (web uniquement)
            ├─ armNext()                  (un seul setTimeout)
            └─ emit() → snapshot immuable
       → scheduleRender() (rAF)
```

`buildPlan` est aussi utilisé pour le mode natif, avec `days = 31`, afin que le diagnostic et
l'ordonnanceur partagent exactement la même logique.

### 11.3 Programmation native

```
Web (mode natif)
  └─ bridge.schedule(payload)    ← un seul appel atomique
        │
        ▼
AzanBridge.schedule
  ├─ SchedulePayload.parse
  ├─ auditMissed(previous)              (événements jamais délivrés)
  ├─ ScheduleStore.save(payload, raw)   (commit, plan durable)
  ├─ Notifications.createChannels(locale)
  ├─ cancelObsolete(previous, parsed)   (seulement ce qui a disparu/bougé)
  └─ NativeAlarmScheduler.sync(context)
        ├─ auditMissed(payload)
        ├─ cancel(payload)             (idempotent)
        ├─ canScheduleExactAlarms ?    sinon → deferred
        └─ pour chaque alarme future :
             setAlarmClock(adhan) | setExactAndAllowWhileIdle(pre)
```

Le web n'appelle plus `cancelAll()` avant `schedule()` : cette paire laissait une fenêtre où le plan
était effacé et plus rien ne pouvait le réarmer. Le Kotlin réconcilie lui-même l'ancien plan, après
avoir persisté le nouveau.

**Choix d'API.** Un Adhan est une alarme utilisateur : `setAlarmClock()` réveille l'écran, n'est pas
décalé par Doze et affiche l'icône d'alarme. Un pré-rappel est un rappel discret :
`setExactAndAllowWhileIdle()` ne réveille pas l'écran.

### 11.4 Déclenchement natif

```
AlarmManager
  └─ PendingIntent (azan://alarm/<eventKey>)
       └─ AdhanReceiver.onReceive
            ├─ specFrom(intent)            sinon return
            ├─ store.markFired(eventKey)   sinon return (doublon)
            ├─ lateBy > 120 s ?            → notification "manquée", return
            ├─ son connu ?
            │    ├─ oui → AdhanService.start (foreground, MediaPlayer)
            │    └─ non → notification seule + notify-no-audio
            └─ recordResult(FireRecord)
```

Le receiver tourne dans un processus neuf si nécessaire : il ne dépend pas de la WebView.

### 11.5 Redémarrage et changement de fuseau

```
BOOT_COMPLETED / TIME_SET / MY_PACKAGE_REPLACED / permission accordée
  └─ SystemEventReceiver
       └─ NativeAlarmScheduler.sync()
            ├─ payload conservé ? sinon no-schedule
            ├─ auditMissed(payload)      (événements passés non délivrés)
            ├─ cancel(payload)
            └─ réarme chaque événement futur

TIMEZONE_CHANGED
  ├─ si zone système ≠ zone du payload → notification "zone changée"
  └─ sync() (les instants restent corrects)
```

Un changement de fuseau ne peut pas être réparé entièrement en natif : les instants restent valides,
mais l'utilisateur attend les horaires de son **nouveau** lieu. Le récepteur notifie et invite à
ouvrir l'application, où le moteur recalcule. Il ne garde jamais silencieusement l'ancienne ville.

### 11.6 Changement de lieu, de méthode ou d'heure

| Changement | Effet sur le plan | Effet sur les alarmes déjà armées |
| --- | --- | --- |
| Ville / coordonnées | Recalcul complet | Web : `clearTimer` + nouveau plan ; natif : `schedule` atomique (réconciliation) |
| Méthode / madhhab / correction | Recalcul complet | idem |
| Langue / thème | Aucun | Aucun |
| Fuseau système | Recalcul au prochain `replan` | Natif : notification + `sync` |
| Heure système | Les instants restent absolus | `TIME_SET` → `sync` |
| Permission notification | Replan | Web : état `permission-missing` ; natif : inchangé |

### 11.7 Test d'alarme

| Contexte | Comportement | Ce que cela prouve |
| --- | --- | --- |
| Web | Lecture immédiate du son choisi | Le fichier existe et se décode |
| Android | `scheduleTest(20 s)` puis verrouillage de l'écran | Le chemin `AlarmManager` → receiver → service fonctionne |
| Android sans permission exacte | Toast « bloqué », aucun timer de substitution | L'état réel est respecté |

Le test natif ne touche pas au plan réel : il crée une alarme `test:<timestamp>`.

### 11.8 Changement de permission

```
Utilisateur revient des réglages système
  → MainActivity.onResume()
      → createChannels(locale)
      → webView.evaluateJavascript("dispatchEvent('azan:permissions-changed')")
          → engine.replan('permissions')
          → rendu du diagnostic avec l'état relu
```

Sans cet événement, le diagnostic garderait l'état lu au premier rendu et pourrait afficher une
permission encore refusée.

---

## 12. Machines à états

### 12.1 Cycle de vie d'un événement (web)

```
                 ┌─────────────┐
                 │ calculated  │  (planifié, pas encore armé)
                 └──────┬──────┘
        permission ok   │   permission absente
        ┌───────────────┴────────────────┐
        ▼                                ▼
┌──────────────────┐             ┌────────────────────┐
│ foreground-timer │             │ permission-missing │
└────────┬─────────┘             └────────────────────┘
         │ dû dans la grâce
         ▼
   ┌──────────────────────────────────────────────┐
   │ fired — avec un résultat de livraison :      │
   │ notified · audio · audio-failed ·            │
   │ notification-failed · skipped-disabled       │
   └──────────────────────────────────────────────┘
         │
         │ plus de 120 s de retard
         ▼
   ┌──────────┐
   │  missed  │  (jamais joué, jamais vert)
   └──────────┘
```

En mode natif, l'état exposé est `scheduled` : c'est l'OS qui possède la livraison, la page ne peut
pas prouver qu'une alarme existe.

### 12.2 Table des transitions

| État | Déclencheur d'entrée | Déclencheur de sortie | Source de vérité |
| --- | --- | --- | --- |
| `calculated` | Plan construit, pas encore armé | `armNext` / `pushToNative` | Plan en mémoire |
| `foreground-timer` | Un `setTimeout` est armé sur cet événement | Tir ou replan | `armedKey` |
| `scheduled` | Mode natif, payload poussé | Livraison OS ou replan | Pont natif |
| `permission-missing` | Permission notification absente | Octroi + replan | API navigateur/pont |
| `fired` | `markFired` a réussi | — | Registre |
| `missed` | `markMissed` a réussi | — | Registre + `missedKeys` |
| `canceled` | Plan remplacé | — | Plan en mémoire |
| `audio-failed` | Résultat de livraison enregistré dans `FireRecord` (l'événement reste `fired`) | — | Journal |

### 12.3 Décision de livraison

```
fire(alarm):
  if (!store.markFired(alarm.eventKey)) return skipped-disabled   // doublon
  if (!pref.enabled) return skipped-disabled                      // désactivée
  if (notificationPermission() === 'granted') showNotification()
  if (adhan && soundId) play() sinon audio-failed
  record(outcome)
```

Le point important est l'ordre : **le registre décide avant l'audio**. Si le son échoue, l'événement
reste marqué comme traité ; il ne sera pas rejoué en boucle. L'échec est visible dans le journal, pas
masqué.

### 12.4 Décision native

```
onReceive:
  if (!store.markFired(eventKey)) return          // at-most-once
  if (lateBy > GRACE_MS) { showMissed(); record("missed"); return }
  if (adhan) {
     if (soundAvailable) startService() else showNotification("notify-no-audio")
  } else {
     showPreReminder()
  }
```

Le `commit()` du ledger précède la lecture audio : un crash après le marquage ne rejoue pas, un crash
avant le marquage peut rejouer — c'est le compromis assumé pour ne jamais sonner deux fois.

---

## 13. Concurrence, idempotence et courses

| Course | Scénario | Protection | Résidu |
| --- | --- | --- | --- |
| Deux timers | `replan` pendant qu'un timer est armé | `clearTimer()` avant tout armement ; un seul `timer` | Aucun identifié |
| Deux livraisons web | `visibilitychange` + timer au même instant | `markFired` atomique sur le registre | Aucun |
| Web + natif | Prière due pendant que l'app est ouverte | En natif, `deliverDue()` n'est pas appelé | Aucun |
| Redémarrage pendant la livraison | Process tué après `markFired`, avant audio | Ledger `commit()` avant audio → pas de rejeu | Audio potentiellement manqué, mais pas doublé |
| Deux `PendingIntent` | Collision de `requestCode` | URI de données unique `azan://alarm/<key>` + requestCode | Aucun |
| `sync` concurrent | Boot + retour d'écran | `cancel` puis armement idempotent ; un `PendingIntent` par clé | Fenêtre courte, pas de doublon |
| Changement de fuseau | OS change de zone pendant l'armement | Instants absolus ; notification + `sync` | Horaires de l'ancienne ville jusqu'à réouverture |
| Changement d'heure | Saut d'horloge pendant un `setTimeout` | `tick()` vérifie `now < target - 250 ms` et réarme | Aucun |
| DST | Passage été/hiver | Instants fixes ; `dateKey` local | Aucun |
| Permission révoquée | Exact alarms retirées après coup | `sync` détecte et retourne `deferred` | Les alarmes déjà annulées par l'OS ne sonnent pas |
| Mise à jour APK | `MY_PACKAGE_REPLACED` | `sync` sur payload conservé | Non testé sur appareil |
| Mise à jour SW | Nouveau worker pendant qu'un onglet vit | Pas de `skipWaiting` automatique | L'utilisateur doit fermer les onglets |
| Effacement pendant un tir | `wipe()` pendant `fire()` | `fire()` a déjà capturé ses réglages ; le registre est recréé | Un son peut se terminer après l'effacement |

### 13.1 Idempotence

| Opération | Idempotente ? | Mécanisme |
| --- | --- | --- |
| `schedule(payload)` | Oui, pour un même payload | `cancel` + un `PendingIntent` par clé |
| `cancelAll()` | Oui | Payload absent → no-op |
| `sync()` | Oui | Annule puis réarme le même ensemble |
| `fire(event)` | Oui | `markFired` |
| `markMissed(event)` | Oui | Refuse si déjà dans `firedKeys` |
| `store.update()` | Non (mutation) | Chaque appel est une intention explicite |

---

## 14. Modèle de défaillance

### 14.1 Principe

**Aucun succès n'est déclaré sans preuve.** Le système distingue trois choses :

1. ce qui est **calculé** (une heure, un plan) ;
2. ce qui est **armé** (un timer web ou une alarme système) ;
3. ce qui est **livré** (un son, une notification).

L'UI n'affiche un état vert que pour le niveau réellement atteint.

### 14.2 Matrice de défaillance

| Panne | Détection | Ce que voit l'utilisateur | Reprise |
| --- | --- | --- | --- |
| Coordonnées invalides | Validation à la saisie | Message d'erreur, aucune valeur par défaut | Corriger |
| Fuseau invalide | `isValidTimeZone` | Erreur explicite | Choisir une zone |
| Méthode inconnue | `getMethod` | Repli MWL, journal | Choisir une méthode |
| Angle jamais atteint | `null` + `highLatitudeFallback` | « — » + explication | Changer de règle |
| Permission notification refusée | API / pont | `permission-missing`, pas de faux OK | Ouvrir les réglages |
| Alarmes exactes refusées | `canScheduleExactAlarms` | `deferred`, bouton de réglage | Accorder |
| Service audio refusé | Exception `startForeground` | Notification seule + mention | — |
| Son importé introuvable | `getAudioFile` | `notify-no-audio`, mention | Réimporter |
| Audio web bloqué | `NotAllowedError` | `audio-failed`, journal | Interagir avec la page |
| Événement manqué > 120 s | Comparaison d'instants | `missed`, notification « manquée » | Aucune (pas de rejeu) |
| Coquille absente + réseau coupé | Cache vide | HTTP 503 explicite | Recharger en ligne |
| Proxy / portail captif | Réponse non-ok | Coquille en cache | — |
| WebView sans bundle | `onReceivedError` | Page « bundle absent » | Rebuild |
| Renderer crash | `onRenderProcessGone` | Activité recréée | — |
| Horloge système fausse | Non détectable | Alarme à l'heure de l'horloge fausse | Corriger l'heure |
| OEM tue l'app | Non détectable | Alarme potentiellement absente | Réglage batterie |

### 14.3 Échelle de dégradation

| Niveau | Situation | Comportement |
| --- | --- | --- |
| 1 | Natif, permissions complètes | Alarmes système, audio, notifications |
| 2 | Natif, notifications refusées | Audio si le service démarre, pas de notification |
| 3 | Natif, alarmes exactes refusées | Payload conservé, `deferred`, aucun timer de substitution |
| 4 | Web, onglet visible | Timer, audio, notification |
| 5 | Web, onglet en arrière-plan | Timer possiblement suspendu ; état affiché |
| 6 | Web, onglet fermé | Aucun rappel ; c'est écrit |
| 7 | Cache absent + réseau coupé | 503 explicite, pas de fausse app |

---

## 15. Sécurité et vie privée

### 15.1 Données traitées

| Donnée | Sensibilité | Stockage | Sort de l'appareil |
| --- | --- | --- | --- |
| Position | Élevée | `localStorage` | Jamais |
| Réglages religieux | Moyenne | `localStorage` | Jamais |
| Journal | Moyenne | `localStorage` | Jamais |
| Sons importés | Variable | IndexedDB + stockage privé Android | Jamais |
| Plan d'alarmes | Faible | `SharedPreferences` | Jamais |
| Notifications | Visible sur l'écran verrouillé | OS | — |

### 15.2 Modèle de menaces

| Menace | Vecteur | Contrôle | Résidu |
| --- | --- | --- | --- |
| Exfiltration réseau | Application compromise ou SDK tiers | Aucun appel réseau, aucun SDK, pas d'`INTERNET` Android | Aucun identifié |
| Fuite par sauvegarde cloud | `adb backup` / Google Backup | `allowBackup=false`, `fullBackupContent=false` | — |
| Injection via un fichier audio | Fichier malformé | Décodage par le navigateur/`MediaPlayer`, erreur affichée | Décodeur natif non audité |
| XSS via un nom de ville | Donnée utilisateur | `textContent`, pas d'`innerHTML` pour les valeurs | — |
| Navigation hors du bundle | Lien externe | `shouldOverrideUrlLoading` bloque tout autre host | — |
| Débogage WebView en release | `setWebContentsDebuggingEnabled` | Activé seulement si `FLAG_DEBUGGABLE` | — |
| Accès fichiers locaux | `file://` | `allowFileAccess=false`, `allowContentAccess=false` | — |
| Contenu mixte | Ressource HTTP | `MIXED_CONTENT_NEVER_ALLOW` | — |
| Écoute d'un receiver | Autre app | `exported=false` partout | — |
| Lecture du payload | Appareil rooté | Non chiffré | Inhérent au stockage local |
| Notification sur écran verrouillé | Regard d'un tiers | `VISIBILITY_PUBLIC` (choix produit) | Affichage du nom de la prière |

### 15.3 Contrôles concrets

- **Aucune permission `INTERNET`** dans le manifeste Android.
- `android:allowBackup="false"`, `fullBackupContent="false"`.
- `exported="false"` pour `AdhanReceiver`, `SystemEventReceiver`, `AdhanService`,
  `NativeDiagnosticsActivity` ; seule `MainActivity` est exportée (lanceur).
- `WebSettings` : `allowFileAccess=false`, `allowContentAccess=false`,
  `mixedContentMode=NEVER_ALLOW`, zoom désactivé.
- `setWebContentsDebuggingEnabled(true)` uniquement en build debug.
- Aucun `eval`, aucun script distant, aucune police distante, aucun iframe.
- Les valeurs utilisateur sont insérées avec `textContent` ; `innerHTML` est réservé aux tracés SVG
  internes.
- Les erreurs du pont sont enregistrées (`bridge-error`), pas avalées.

### 15.4 Limites de sécurité assumées

| Limite | Conséquence |
| --- | --- |
| Pas de CSP | Des styles inline existent ; une CSP stricte exigerait `unsafe-inline` pour les styles. Compensé par l'absence de contenu distant. |
| Stockage non chiffré | Un appareil déverrouillé ou rooté peut lire les réglages et la position. |
| Notifications publiques | Le nom de la prière est visible sur l'écran verrouillé. |
| Export non chiffré | L'utilisateur choisit d'écrire un JSON contenant sa position. |
| Aucun audit externe | Le code n'a pas été revu par un tiers. |

### 15.5 Vie privée produit

- Aucun compte, aucun identifiant, aucun analytics, aucun rapport de crash.
- Le GPS n'est lu qu'après un clic ; un refus laisse la ville et les coordonnées manuelles.
- Aucune coordonnée n'est journalisée dans un service distant ; le journal local peut contenir des
  messages d'erreur, pas la position.
- « Tout effacer » supprime réglages, journal, registre et sons importés.
- L'export est un fichier local, non chiffré, dont l'utilisateur est responsable.

---

## 16. Performance et budgets

### 16.1 Budgets de build

| Élément | Mesure | Budget |
| --- | ---: | --- |
| JS | 529,73 kB (158,98 kB gzip) | < 600 kB brut |
| CSS | 45,05 kB (9,18 kB gzip) | < 50 kB |
| `sw.js` | 5,28 kB | < 10 kB |
| Table de fuseaux | 34,4 Kio | < 50 Kio |
| Villes embarquées | `cities-core.json` 311 Kio | < 350 Kio |
| Catalogue à la demande | index 2,2 Mio / régions 9,23 Mio | hors chemin critique |
| Précache | 20 entrées | — |

### 16.2 Coût du calcul

| Opération | Complexité | Remarque |
| --- | --- | --- |
| Une prière | O(1) | Formules trigonométriques |
| Un jour | O(1) | 5 appels + geometry |
| Fenêtre de 31 jours | O(31) | ~160 calculs, quelques ms |
| Offset de fuseau | O(log n) | Recherche binaire sur les transitions |
| Formatage d'un instant | O(1) | `Intl` en UTC après décalage |
| Rendu d'un écran | O(taille du DOM) | Remplacement complet, coalescé |

Aucun benchmark de latence n'a été enregistré : les chiffres ci-dessus sont des bornes
algorithmiques, pas des mesures de temps de chargement. Les seules mesures réellement exécutées sont
les tailles de build et les scores Lighthouse.

### 16.3 Mémoire et stockage

| Élément | Borne |
| --- | --- |
| Journal | 200 entrées |
| `firedKeys` | 200 clés |
| `missedKeys` | 200 clés |
| Sons importés | 30 Mo par fichier, quota navigateur + stockage privé Android |
| Plan natif | 31 jours × 5 prières + pré-rappels |
| Payload JSON | Quelques dizaines de Ko |

### 16.4 Démarrage

Le chemin critique est : lecture `localStorage` → hydratation → calcul du jour → rendu. Le service
worker n'est pas nécessaire au premier rendu ; il est enregistré après l'amorçage. Les icônes et le
manifeste ne bloquent pas l'affichage.

---

## 17. Internationalisation, RTL et accessibilité

### 17.1 Langues

| Langue | Code | Sens | Rôle |
| --- | --- | --- | --- |
| Français | `fr` | LTR | Source des traductions |
| Anglais | `en` | LTR | Traduction |
| Arabe | `ar` | RTL | Traduction |

`Dict` est dérivé du dictionnaire français : une clé manquante en anglais ou en arabe est une erreur
TypeScript, pas un repli silencieux au runtime. La langue est stockée dans les réglages et appliquée
à `<html lang dir>`, aux dates `Intl`, aux noms de pays et aux notifications natives.

### 17.2 RTL

- `dir="rtl"` sur `<html>` ;
- propriétés CSS logiques (`margin-inline`, `padding-inline`, `inset-inline`) ;
- navigation, icônes directionnelles et feuilles miroir ;
- aucune capture d'écran « retournée » à la main : le sens vient du document.

### 17.3 Chiffres et dates

- Les heures restent en **chiffres latins** dans les trois langues, choix de lisibilité assumé.
- Les noms de pays viennent de `Intl.DisplayNames`.
- La date hégirienne vient d'`islamic-umalqura` (ICU), avec repli arithmétique.
- Les noms de villes du catalogue sont en caractères latins (GeoNames), sans translittération.

### 17.4 Accessibilité

| Contrôle | Résultat |
| --- | --- |
| Un `h1` par écran | Oui (accueil en `sr-only`) |
| Lien d'évitement | Oui |
| Navigation avec `aria-current` | Oui |
| Boutons sans nom accessible | 0 |
| Boutons désactivés | 0 |
| Contraste | Vérifié par Lighthouse, pas par mesure terrain |
| Lecteur d'écran réel | **Non testé** |
| Navigation clavier complète | Non testée formellement |
| `prefers-reduced-motion` | Non implémenté |

Les scores Lighthouse sont de 100 en accessibilité, bonnes pratiques et SEO sur les six écrans
principaux. Ce n'est pas une preuve d'utilisabilité réelle.

---

## 18. Observabilité et diagnostic

### 18.1 Journal web

`Settings.log` conserve 200 entrées `{at, level, event, detail}`. Les événements notables :

| Événement | Niveau | Sens |
| --- | --- | --- |
| `alarms.planned` | info | Nombre d'alarmes dans la fenêtre |
| `alarms.history` | info | Événements déjà passés au premier plan |
| `alarms.native` | info | Plan remis au pont |
| `alarms.native.error` | error | Le pont a rejeté le payload |
| `alarm.notified` | info | Notification affichée |
| `alarm.audio-failed` | error | Audio impossible |
| `alarm.notification-failed` | error | Notification impossible |
| `alarm.missed` | warn | Événement hors grâce |
| `alarm.skipped-disabled` | info | Doublon ou prière désactivée |

### 18.2 Écran de diagnostic web

Il montre :

- le mode de livraison (`native` ou `web-foreground`) ;
- la permission de notification et, si le pont existe, celle des alarmes exactes ;
- le fuseau, la source de la table et le désaccord OS/table ;
- la méthode, la règle de hautes latitudes ;
- les 10 prochaines alarmes et leur état ;
- le dernier plan, la dernière livraison, le dernier recalcul ;
- un auto-test (lieu, fuseau, ordre, instants, audio, méthode) ;
- le journal.

L'auto-test **refuse** de certifier une alarme système depuis le web : il affiche
« non vérifiable depuis une page web ».

### 18.3 Écran de diagnostic natif

Compose, accessible depuis le diagnostic web via `openNativeDiagnostics()` :

- permission d'alarmes exactes (état réel) ;
- permission de notifications ;
- exemption d'optimisation de batterie ;
- nombre d'alarmes à venir et prochaines 10 ;
- dernier `FireRecord` et dernier `ArmResult` ;
- bouton de test à 20 s ;
- bouton d'arrêt audio ;
- note sur la fenêtre de 31 jours.

### 18.4 Ce qui n'est pas observable

| Question | Réponse |
| --- | --- |
| Une alarme `AlarmManager` existe-t-elle ? | Non depuis le web ; oui depuis l'écran natif. |
| L'OS a-t-il livré ? | Seulement via `lastResult` natif, pas en temps réel. |
| Le son a-t-il été entendu ? | Non ; seulement « le lecteur a démarré ». |
| L'horloge système est-elle juste ? | Non. |
| Un OEM a-t-il tué l'app ? | Non. |

---

## 19. Stratégie de test et preuves

### 19.1 Pyramide

| Niveau | Suite | Ce qui est réel | Ce qui est simulé |
| --- | --- | --- | --- |
| Domaine | `engine.test.ts` (59) | Moteur, méthodes, fuseaux | Rien |
| Temps | `timezone.test.ts` (15) | Table, formatage, conversions | Rien |
| Alarmes | `alarm-engine.test.ts` (5) | `AlarmEngine`, `SettingsStore` | Horloge, DOM, audio, pont |
| Worker | `service-worker.test.ts` (7) | Worker généré | Cache, réseau (`node:vm`) |
| Navigateur | Vérification manuelle | Bundle de production | — |
| Android | Aucun | — | — |

### 19.2 Traçabilité des risques

| Risque | Test(s) | Résultat |
| --- | --- | --- |
| Ordre des prières | `engine.test.ts` | 5 prières ordonnées, lever exclu |
| Minuit / date locale | `timezone.test.ts` | Clé locale correcte |
| DST | `engine.test.ts` | Pas d'erreur d'une heure |
| Fuseau exotique | `timezone.test.ts` | 30/45 min, Lord Howe |
| Maroc | `timezone.test.ts`, navigateur | UTC+1 hors Ramadan |
| Hégirien | `engine.test.ts` | Umm al-Qura, repli |
| Année bissextile | `engine.test.ts` | 29 février |
| Asr hanafite | `engine.test.ts` | Plus tard que standard |
| Méthodes | `engine.test.ts` | Écarts attendus |
| Corrections | `engine.test.ts` | Minutes exactes |
| Hautes latitudes | `engine.test.ts` | `null` ou règle explicite |
| Entrées invalides | `engine.test.ts` | Exception, pas de `NaN` |
| Livraison unique | `alarm-engine.test.ts` | Un seul son |
| Anti-rejeu après restart | `alarm-engine.test.ts` | Registre persistant |
| Événement manqué | `alarm-engine.test.ts` | Aucun son |
| Grâce 120 s | `alarm-engine.test.ts` | Borne exacte |
| Mode natif sans timer | `alarm-engine.test.ts` | Aucun appel audio |
| Hors ligne | `service-worker.test.ts` | Coquille 200 |
| Portail captif | `service-worker.test.ts` | Coquille, pas 502 |
| Cache vide | `service-worker.test.ts` | 503 explicite |

### 19.3 Validation externe

18 lieux, 33 dates, 6 champs. Après deux exclusions documentées, **180 comparaisons**, écart maximal
**3 minutes** (`dubai 2026-06-21`, Asr : 15:46 vs 15:43). Le test vérifie aussi que toute exclusion
est justifiée : on ne peut pas supprimer un écart sans raison.

### 19.4 Ce qui n'est pas testé

| Élément | Statut |
| --- | --- |
| Compilation Kotlin/Gradle | Jamais exécutée |
| `AlarmManager`, receiver, boot | Jamais exécutés |
| Service audio natif, focus, écran verrouillé | Jamais exécuté |
| WebView + `WebViewAssetLoader` | Jamais exécuté |
| Rechargement hors ligne réel | Non réalisable dans le harnais |
| Audio audible | Non vérifié |
| Lecteurs d'écran | Non testés |
| Safari / Firefox / iOS | Non testés |
| Notifications système web | Non vérifiées visuellement |
| PWA installée sur appareil | Non testée |
| Charge / gros fichiers | Non testée |

Voir [`LIMITES.md`](LIMITES.md) pour la liste exhaustive.

---

## 20. Déploiement et exploitation

### 20.1 Web

```bash
npm install
npm test          # 185 tests
npm run build     # tsc + garde-fou audio + vite → dist/
npm run preview   # http://localhost:4173
```

`dist/` est un site statique : `index.html`, assets hachés, `sw.js`, manifeste, icônes, carillons,
Adhan CC0, motif zellige et catalogue géographique découpé. Il doit être servi en **HTTPS** (ou
`localhost`) pour que le service worker s'enregistre.

| Aspect | Choix |
| --- | --- |
| Hébergement | N'importe quel hébergeur statique |
| Cache | `sw.js` précache 20 entrées ; noms hachés ; `/data/cities/` en cache-first à la demande |
| Mise à jour | Nouveau worker installé, pas de `skipWaiting` automatique |
| Retour arrière | Redéployer l'ancien `dist/`; cache `azan-v2` |
| En-têtes | Aucun en-tête serveur spécifique fourni |
| Monitoring | Aucun (pas de télémétrie) |

### 20.2 Android

Prérequis absents de cet environnement : **JDK 17**, **SDK Android 35**, **Gradle** (wrapper non
commité). Procédure cible :

```bash
npm run build
cd android
gradlew assembleDebug      # ou bundleRelease après signature
```

Le build Gradle exécute `syncWebAssets` et `syncRawAudio` :

- `dist/` → `app/src/main/assets/web/` ;
- `public/audio/*.wav` → `app/src/main/res/raw/` (noms avec `_`).

Les tâches `merge*Assets` et `merge*Resources` dépendent explicitement de ces copies pour éviter une
course avec le packaging. `noCompress += "wav"` est nécessaire pour que `MediaPlayer` puisse lire le
descripteur.

| Aspect | Choix |
| --- | --- |
| `minSdk` / `targetSdk` | 26 / 36 |
| Permissions | Exact alarms, boot, wake lock, vibrate, notifications, FGS media |
| `INTERNET` | **Absente** |
| Backup | Désactivé |
| Signature | Aucun keystore fourni |
| Play | `USE_EXACT_ALARM` à justifier ; voir [`ANDROID.md`](ANDROID.md) |

### 20.3 Checklist de release (non exécutée)

1. `npm test`, `npm run build` (le build échoue si un MP3 non autorisé est présent).
2. Vérifier `dist/sw.js` et les 20 entrées ; vérifier que le seul MP3 est `adhan-cc0.mp3`.
3. **Obtenir une autorisation écrite pour les huit enregistrements fournis**, ou confirmer leur
   absence définitive du paquet.
4. Compiler l'APK, installer sur un appareil réel.
5. Recetter : alarme écran verrouillé, redémarrage, changement de fuseau, mode avion, permissions
   refusées, son importé, test à 20 s.
6. Vérifier les notifications dans les trois langues.
7. Vérifier `allowBackup=false` et l'absence d'`INTERNET`.
8. Signer, publier, surveiller les rapports Play.

---

## 21. Décisions d'architecture (ADR)

### ADR-001 — Instants UTC d'abord, heure murale ensuite

**Contexte.** Une heure murale seule ne permet pas de programmer une alarme sans ambiguïté,
surtout aux transitions DST.

**Décision.** Le moteur retourne des `Date` absolus ; le formatage est une opération de présentation.

**Conséquences.** (+) Aucun décalage DST, aucun recalcul au changement de fuseau d'affichage.
(−) Toute sérialisation doit être en ISO UTC ; un développeur ne peut pas « juste » stocker `18:42`.

### ADR-002 — Table de fuseaux embarquée

**Contexte.** Windows/Chromium applique une règle marocaine obsolète.

**Décision.** Embarquer 434 zones, 2018–2045, et n'utiliser `Intl` qu'en dehors.

**Conséquences.** (+) Exactitude pour le public principal. (−) 34,4 Kio, mise à jour manuelle,
dépendance à `Intl` après 2045.

### ADR-003 — PWA + coque Android, pas Flutter

**Contexte.** Il faut du web installable et des alarmes système fiables.

**Décision.** Un seul bundle web ; Android l'héberge et ajoute `AlarmManager`.

**Conséquences.** (+) Une seule UI, un seul moteur, deux chemins honnêtes. (−) Deux runtimes,
WebView à recetter, pas d'iOS natif.

### ADR-004 — Un seul moteur, Kotlin ne calcule pas

**Contexte.** Dupliquer l'astronomie en Kotlin créerait deux vérités.

**Décision.** Le natif reçoit des instants et ne fait que réveiller/jouer.

**Conséquences.** (+) Le moteur testé est le seul. (−) Le payload doit être correct ; un bug web
propage des alarmes fausses.

### ADR-005 — Deux modes d'alarme, aucun troisième

**Contexte.** Les navigateurs ne réveillent pas un appareil ; les substituts (Web Push, Periodic
Sync) ne sont pas garantis.

**Décision.** `native` ou `web-foreground`, jamais de faux `scheduled` en web.

**Conséquences.** (+) Diagnostic honnête. (−) La PWA seule ne sonne pas onglet fermé.

### ADR-006 — `eventKey` + registre + grâce

**Contexte.** Un redémarrage, un changement de lieu ou une replanification peut livrer deux fois.

**Décision.** Clé `date:prière[:pre]`, registre persistant, grâce de 120 s.

**Conséquences.** (+) At-most-once et pas de sonnerie tardive. (−) Un événement manqué est perdu,
pas rejoué.

### ADR-007 — `SharedPreferences` avec `commit()`

**Contexte.** Les écritures critiques ont lieu dans un receiver.

**Décision.** Écritures synchrones, petit JSON.

**Conséquences.** (+) Pas de perte de marqueur après crash. (−) Bloque brièvement le thread du pont.

### ADR-008 — `setAlarmClock` vs `setExactAndAllowWhileIdle`

**Contexte.** Un Adhan doit réveiller ; un pré-rappel ne doit pas allumer l'écran.

**Décision.** API différente selon le type.

**Conséquences.** (+) Comportement attendu par l'OS. (−) L'Adhan est traité comme une alarme
utilisateur (icône, priorité).

### ADR-009 — Enregistrements d'Adhan fournis, exclus du paquet

**Contexte.** Le propriétaire du projet a fourni huit fichiers MP3. Aucun ne porte de licence ni
d'autorisation écrite ; les métadonnées citent `www.islamcan.com`.

**Décision.** Les nettoyer dans `audio-cleaned/`, **hors de `public/` et hors de `res/raw/`**, et les
cataloguer avec `bundled: false`, `license: "unknown"` et `redistributionAuthorized: false`. L'écran
Sons les liste (durée, poids) marqués « non inclus », sans aperçu ni affectation possible à une
prière. Un script de garde-fou (`scripts/check-release-assets.mjs`, appelé par `npm run build`) fait
échouer la construction si un MP3 réapparaît dans un dossier livré. Trois carillons synthétisés
restent disponibles ; l'import d'un fichier personnel reste possible. Les préférences existantes qui
pointaient vers `adhan-*` sont migrées vers un carillon au chargement.

**Conséquences.** (+) Aucun risque de distribuer un enregistrement non licencié par accident ; le
propriétaire conserve les fichiers pour évaluation locale. (−) Les huit enregistrements fournis ne
sont pas joués ; il faut une autorisation écrite puis repasser `bundled` à `true`, recopier les
fichiers et reconstruire.

### ADR-009c — Adhan CC0 livré par défaut

**Contexte.** L'application doit contenir au moins un Adhan complet utilisable sans import, tout en
respectant les licences. « Beautiful adhan » d'Adam-synagda est publié sur Wikimedia Commons sous
CC0 1.0, avec une version MP3 transcodée par Wikimedia.

**Décision.** Livrer le MP3 Wikimedia **tel quel** (aucun débruitage, aucun réencodage avec perte),
en conservant l'OGG source dans `audio-cc0/` avec les preuves de provenance. Le fichier est copié à
l'identique dans `public/audio/adhan/adhan-cc0.mp3` et `res/raw/adhan_cc0.mp3`, précaché, et
sélectionné par défaut pour les cinq prières. Ses métadonnées vivent dans
`src/core/data/adhan-cc0.json`, séparées du catalogue généré, pour ne pas être écrasées par
`scripts/process-audio.mjs`. Le garde-fou de release n'autorise que cette piste, vérifiée par taille
et SHA-256. L'attribution est affichée dans l'écran « Sons et licences » bien que la CC0 ne l'exige
pas.

**Conséquences.** (+) Première installation réellement fonctionnelle hors ligne, sans import.
(−) Le paquet augmente d'environ 1,78 Mo ; la qualité de la récitation n'a pas été validée par une
écoute humaine dans cet environnement, et la licence reste celle déclarée par l'auteur sur Commons.

### ADR-009b — Catalogue de lieux découpé par région

**Contexte.** Le catalogue marocain complet (46 039 entrées) pèse 9,45 Mio et alourdissait le bundle
initial à 9 054 Ko de JS (1 448 Ko gzip), pour un premier affichage qui n'en utilise que quelques
centaines d'entrées.

**Décision.** Séparer les données en trois niveaux : `cities-core.json` embarqué (311 Kio : 1 696
villes mondiales + les 300 plus grandes localités marocaines), `public/data/cities/index.json`
(46 039 entrées, 2,2 Mio, ~763 Kio gzip) chargé au premier usage de la recherche, et treize fichiers
`ma-XX.json` par région chargés à la demande. Un bouton « Télécharger tout le Maroc hors ligne »
précharge l'ensemble. Le service worker sert `/data/cities/` en cache-first. `cities.json` reste le
dataset complet, réservé aux tests, rapports et à la génération — l'application ne l'importe jamais.

**Conséquences.** (+) Bundle initial ramené à 525 Ko de JS (157 Ko gzip) ; le premier affichage ne
dépend plus du catalogue. (−) Sans réseau, seules les 1 996 entrées embarquées sont cherchables tant
que l'index et la région n'ont pas été téléchargés ; l'interface le signale.

### ADR-010 — Aucun serveur, aucune permission réseau

**Contexte.** Vie privée et hors ligne.

**Décision.** Calcul local, stockage local, pas d'`INTERNET` Android.

**Conséquences.** (+) Aucune fuite possible par l'app. (−) Pas de push, pas de sync, pas de
sauvegarde.

### ADR-011 — Rendu complet plutôt qu'un diff

**Contexte.** Les écrans sont petits ; une heure périmée est un bug grave.

**Décision.** Reconstruire `#app` à chaque changement, coalescé par rAF.

**Conséquences.** (+) Aucun état périmé, code simple. (−) Coût de rendu plus élevé, perte de focus à
gérer.

### ADR-012 — Service worker généré

**Contexte.** Les noms d'assets sont hachés.

**Décision.** Le plugin Vite émet `sw.js` avec la liste réelle.

**Conséquences.** (+) Pas de désynchronisation. (−) Le worker n'est pas éditable à la main.

### ADR-013 — Catalogue de lieux GeoNames

**Contexte.** Il faut des localités réelles avec fuseau IANA, y compris de petites communes
marocaines.

**Décision.** Générer `cities-core.json` (bundle), `public/data/cities/index.json` et les fichiers
régionaux `ma-XX.json` depuis le dump `MA.txt` (toutes les localités habitées) et `cities15000` pour
les autres pays, avec régions, provinces et variantes de noms. `cities.json` conserve le dataset
complet pour les tests et les rapports.

**Conséquences.** (+) 47 735 localités consultables, recherche arabe/latine normalisée ; bundle
initial limité à 1 996 entrées. (−) Tous les douars ne sont pas garantis ; 45 638 entrées marocaines
n'ont pas de population GeoNames ; une région non téléchargée exige le réseau.

### ADR-014 — Profils pays non certifiés

**Contexte.** Une méthode locale peut différer d'une autorité.

**Décision.** Profils = point de départ ; `verifiedAgainstLocalAuthority=false` partout.

**Conséquences.** (+) Pas de fausse autorité. (−) L'utilisateur doit vérifier localement.

### ADR-015 — La langue fait partie du payload natif

**Contexte.** La WebView ne peut pas localiser les notifications natives ; le système peut être dans
une autre langue que l'UI.

**Décision.** Envoyer `locale` dans le payload ; `LocaleHelper.wrap()` l'applique aux ressources.

**Conséquences.** (+) Notifications AR/FR/EN cohérentes. (−) Un champ de plus à maintenir ; le repli
`fr` masque un oubli (corrigé et testé le 27/10/2026).

---

## 22. Risques et feuille de route

### 22.1 Registre des risques

| Risque | Probabilité | Impact | Mitigation | État |
| --- | --- | --- | --- | --- |
| Android non compilé | Certaine | Élevé | Compiler et recetter sur appareil | Ouvert |
| OEM tue le service | Moyenne | Élevé | `setAlarmClock`, diagnostic batterie | Partiel |
| Alarmes exactes révoquées | Moyenne | Moyen | `deferred`, bouton réglage | Couvert |
| Horloge système fausse | Faible | Élevé | Non corrigeable sans réseau | Assumé |
| Écart avec l'autorité locale | Élevée | Moyen | Corrections, mentions | Assumé |
| Copie native d'un son importé échouée | Faible | Moyen | Notification sans audio, `notify-no-audio`, diagnostic | Couvert, non testé appareil |
| Table de fuseaux figée en 2045 | Certaine à terme | Moyen | Régénération, version | Assumé |
| Pas de CSP | Moyenne | Moyen | Contenu local uniquement | Assumé |
| Accessibilité non testée | Moyenne | Moyen | Audit lecteur d'écran | Ouvert |
| Traductions non relues | Moyenne | Faible | Relecture native | Ouvert |
| Un seul navigateur testé | Moyenne | Moyen | Tests Safari/Firefox | Ouvert |
| Fenêtre entre `cancelAll` et `schedule` | Éliminée côté source | Moyen | `schedule` persiste, réconcilie puis arme | Corrigé, non compilé |
| Résultat natif non remonté au web | Faible | Faible | `schedule` renvoie `ArmResult`, `lastSyncResult()` alimente le diagnostic | Corrigé |
| Grandes villes absentes | Faible | Faible | Saisie manuelle | Assumé |

### 22.2 Feuille de route

**P0 — avant toute publication**

1. Compiler l'APK avec JDK 17 + SDK 36.
2. Recetter sur un appareil réel : alarme écran verrouillé, reboot, changement de fuseau, mode avion,
   permissions refusées, test 20 s, son importé.
3. Vérifier les notifications dans les trois langues.
4. Rendre `schedule` atomique (annuler l'ancien payload dans la même transaction native).
5. Publier une politique de confidentialité hébergée.

**P1 — qualité**

6. Remonter `lastResult` et `ArmResult` au diagnostic web.
7. Audit lecteur d'écran (TalkBack, NVDA).
8. Tests Safari/Firefox, vérification du repli `Intl.supportedValuesOf`.
9. CSP compatible avec les styles actuels, ou migration des styles inline.
10. Relecture des traductions par des locuteurs natifs.

**P2 — produit**

11. Widget d'écran d'accueil Android.
12. Ajustement manuel du début de Ramadan / calendrier local.
13. Vérification documentée de quelques profils pays avec des sources officielles.
14. Éventuel iOS natif, si le besoin est confirmé.

---

## 23. Annexes

### 23.1 Carte des fichiers

| Chemin | Contenu |
| --- | --- |
| `src/core/` | Moteur pur, méthodes, profils, fuseaux, planning |
| `src/core/data/cities.json` | Dataset complet (47 735 localités), réservé aux tests et rapports |
| `src/core/data/cities-core.json` | 1 996 localités embarquées dans le bundle |
| `src/core/data/audio-catalog.json` | 8 pistes fournies, `bundled: false`, licence inconnue |
| `src/core/data/adhan-cc0.json` | Adhan CC0 vérifié : provenance, licence, hash, durée |
| `src/core/data/tzdata.json` | 434 zones, 2018–2045 |
| `src/app/` | Shell, store, alarmes, audio, tasbih, notifications, i18n |
| `src/app/screens/` | 8 écrans |
| `src/pwa/` | Gabarit du service worker |
| `public/` | Manifeste, icônes, carillons WAV, Adhan CC0, motif zellige |
| `public/data/cities/` | `index.json` + 13 fichiers `ma-XX.json` (hors bundle) |
| `audio-cc0/` | OGG/MP3 sources et preuves de provenance CC0, hors paquet |
| `audio-originals/`, `audio-cleaned/` | MP3 fournis, hors paquet, non redistribuables |
| `tests/` | 185 tests |
| `android/` | Projet Kotlin/Compose non compilé |
| `docs/` | Étude, architecture, design, calcul, tests, Android, limites |
| `scripts/` | Génération villes/fuseaux/audio + garde-fou `check-release-assets.mjs` |

### 23.2 Glossaire

| Terme | Sens |
| --- | --- |
| Adhan | Appel à la prière ; ici, le son déclenché à l'heure |
| `eventKey` | Identité de livraison `date:prière[:pre]` |
| `dateKey` | Jour civil local `YYYY-MM-DD` |
| Fenêtre de grâce | 120 s après l'instant prévu où la livraison reste acceptable |
| Ledger | Registre persistant des clés déjà livrées |
| Mode natif | Livraison par `AlarmManager` |
| Mode web | Livraison par un timer de page |
| `deferred` | Payload conservé mais non armé faute de permission |
| `missed` | Événement jamais délivré, clos sans audio |
| Madhhab Asr | École de calcul de l'ombre (standard 1, hanafite 2) |
| Haute latitude | Zone où le soleil n'atteint pas l'angle requis |
| Umm al-Qura | Calendrier et méthode saoudiens |

### 23.3 Matrice de statut des fonctionnalités

| Fonctionnalité | Web | Android | Preuve |
| --- | --- | --- | --- |
| Calcul des 5 prières | [V] | [V] (même moteur) | Tests |
| Méthodes / madhhab / corrections | [V] | [V] | Tests + UI |
| Hautes latitudes | [V] | [V] | Tests |
| Calendrier / hégirien | [V] | [V] | UI |
| GPS / ville / coordonnées | [V] | [V] | UI |
| Alarme application fermée | [N] | [É] | Code |
| Pré-rappel | [V] (timer) | [É] | Code |
| Audio | [V] | [É] | Code |
| Son importé | [V] | [É] copie privée + lecture native | Code |
| Vibration | [V] | [É] | Code |
| Notifications | [V] | [É] | Code |
| Diagnostic | [V] | [É] | Écrans |
| RTL / 3 langues | [V] | [É] | Build + navigateur |
| Hors ligne | [V] (worker testé) | [V] (assets locaux) | Tests |
| Confidentialité | [V] | [É] | Manifest + revue |
| APK/AAB | — | [N] | — |

### 23.4 Renvois

- Étude de faisabilité et choix de plateforme : [`ETUDE-TECHNIQUE.md`](ETUDE-TECHNIQUE.md)
- Architecture synthétique et flux : [`ARCHITECTURE.md`](ARCHITECTURE.md)
- Jetons, composants et RTL : [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md)
- Astronomie, méthodes et validation : [`CALCUL.md`](CALCUL.md)
- Résultats de tests : [`TESTS.md`](TESTS.md)
- Compilation, permissions et Play : [`ANDROID.md`](ANDROID.md)
- Installation et dépannage : [`DEMARRAGE.md`](DEMARRAGE.md)
- Limites exhaustives : [`LIMITES.md`](LIMITES.md)

---

**Fin du document.** Toute modification du modèle temporel, du ledger ou du contrat natif doit être
répercutée ici et dans [`ARCHITECTURE.md`](ARCHITECTURE.md).
