# Azan Global — أذان عالمي

Application de horaires de prière **hors ligne**, multilingue (العربية / Français / English),
avec un moteur de calcul astronomique local, une interface RTL complète, et deux chemins de
rappel honnêtement séparés :

| Chemin | Ce qu'il fait vraiment | État |
| --- | --- | --- |
| **PWA** (dossier `dist/`) | Calcule, affiche et précache tous ses assets. Rappels **uniquement tant que l'onglet est ouvert** (`setTimeout`). | Testé dans un navigateur ; rechargement hors ligne non vérifié en conditions réelles (voir [`docs/LIMITES.md`](docs/LIMITES.md) §11) |
| **Application Android** (dossier `android/`) | Programme de vraies alarmes `AlarmManager` qui sonnent application fermée, après redémarrage, écran verrouillé. | **Code écrit, non compilé ici** (aucun JDK/SDK Android dans cet environnement) |

Aucune fonctionnalité n'est annoncée comme « prête » sans avoir été exécutée. Le tableau
ci-dessus est le contrat de lecture du reste du dépôt. La conception complète (contexte,
conteneurs, invariants, flux, pannes, sécurité, ADR) est dans
[`docs/SYSTEM-DESIGN.md`](docs/SYSTEM-DESIGN.md).

---

## Démarrage en trois commandes

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 185 tests
```

Construction de l'artefact PWA :

```bash
npm run build      # → dist/ (530 Ko JS / 159 Ko gzip ; 45 Ko CSS ; catalogue à la demande)
npm run preview    # sert dist/ sur http://localhost:4173
```

`dist/` est un site statique complet : `index.html`, assets hachés, `sw.js` généré, manifeste,
icônes, motif zellige, carillons, l'Adhan CC0 (`audio/adhan/adhan-cc0.mp3`) et le catalogue
géographique découpé. Il peut être déposé sur n'importe quel hébergeur statique en HTTPS. **Aucun
enregistrement fourni n'y figure** : les huit MP3 dont la licence n'est pas établie restent dans
`audio-cleaned/`, hors du paquet (voir [`docs/AUDIO.md`](docs/AUDIO.md)). Le build échoue si un
audio autre que la piste CC0 vérifiée apparaît dans un dossier livré.

---

## Ce qui existe réellement

### Moteur de calcul (`src/core/`)

- Calcul astronomique pur TypeScript, sans DOM, sans réseau : déclinaison solaire, équation du
  temps, angles de dépression, madhhab Asr (facteur d'ombre 1 ou 2).
- **23 méthodes** (MWL, ISNA, Égypte, Umm al-Qura, Karachi, Téhéran, Jafari, Golfe, Koweït, Qatar,
  Singapour/MUIS, UOIF/France, Diyanet, Russie, Moonsighting, Dubaï, JAKIM, Tunisie, Algérie,
  Maroc, Indonésie, Jordanie, Portugal…) avec corrections de minutes documentées par méthode.
- Règles hautes latitudes : `angleBased`, `oneSeventh`, `nightMiddle`, `nearestLatitude`, `none`.
- **Le temps est manipulé en instants UTC absolus**, jamais en « heures locales ». Le fuseau IANA
  ne sert qu'à l'affichage, via une table de transitions embarquée (2018 → 2045) et un correctif
  versionné pour la réforme marocaine de 2026. Une prière ne peut donc pas se décaler d'une heure
  lors d'un changement d'heure.
- **Catalogue de lieux GeoNames** : 47 735 localités, dont **46 039 au Maroc** (toutes les localités
  habitées du dump `MA.txt`, pas seulement les grandes villes) et 1 696 villes des autres pays.
  12 régions, provinces, variantes latines/arabes/tifinagh, recherche normalisée hors ligne,
  proposition GPS non destructive. Licence CC BY 4.0, attribution affichée. Le bundle n'embarque
  que 1 996 entrées (villes mondiales + 300 localités marocaines) ; l'index marocain et les fichiers
  régionaux sont chargés à la demande puis mis en cache. Vérification détaillée :
  [`docs/GEONAMES.md`](docs/GEONAMES.md).

### Application (`src/app/`)

- 8 écrans : démarrage/onboarding, accueil, calendrier, **Tasbih**, sons, méthodes, diagnostic des
  alarmes, réglages + confidentialité. Navigation : Accueil / Calendrier / Tasbih / Adhan /
  Méthodes / Réglages.
- **Tasbih** : compteur à grande cible, dhikr prédéfinis avec référence vérifiable + dhikr
  personnalisés, objectifs 33/100/libre, favoris, annulation, confirmation de remise à zéro,
  sessions multi-étapes, historique local. Sauvegarde immédiate (`azan.tasbih.v1`) et reprise après
  redémarrage. Aucun classement, aucune série à maintenir.
- Choix de la langue et du thème, bascule RTL complète, date hégirienne, corrections par prière,
  rappels pré-prière, vibration, import de son personnel stocké en IndexedDB.
- Aucun compte, aucun traceur, aucune coordonnée envoyée : l'application n'a même pas la
  permission `INTERNET` dans sa version Android.
- Journal de diagnostic lisible : ce qui est calculé, ce qui est programmé, ce qui a échoué.

### Rappels

- **Android** : `setAlarmClock()` pour l'Adhan, `setExactAndAllowWhileIdle()` pour les
  pré-rappels, un `PendingIntent` par événement, service de premier plan pour l'audio, verrou
  anti-double-déclenchement persistant (SharedPreferences `commit()`), réarmement au démarrage.
- **Web** : un seul `setTimeout` enchaîné, étiqueté `Onglet ouvert uniquement`. Le diagnostic
  affiche explicitement que ce n'est pas une alarme système.

### Audio

- **Un Adhan complet est inclus et jouable dès la première installation.** « Beautiful adhan » par
  Adam-synagda, publié sur Wikimedia Commons sous **CC0 1.0**, est livré en MP3 dans
  `public/audio/adhan/adhan-cc0.mp3` et dans `res/raw/adhan_cc0.mp3` (copies identiques,
  1 781 329 octets, 154 s, SHA-256 épinglé). Il est sélectionné par défaut pour les cinq prières ;
  provenance, licence, format et durée sont affichés dans l'écran « Sons et licences ».
- **Huit enregistrements fournis** ont été nettoyés avec un rapport mesuré avant/après :
  [`docs/AUDIO.md`](docs/AUDIO.md). Chaîne prudente en deux passes (coupe-rumble 70 Hz, réduction de
  bruit 6 dB, silence début/fin, −18 LUFS / −2 dBTP, mono 22,05 kHz 32 kbps). Les originaux sont
  archivés dans `audio-originals/` et les copies nettoyées dans `audio-cleaned/`, **tous deux hors du
  paquet**. Leur licence n'est pas établie : `license: "unknown"`,
  `redistributionAuthorized: false`, `bundled: false`. L'écran Sons les liste avec durée et poids,
  marqués « non inclus », sans aperçu.
- `scripts/check-release-assets.mjs` n'autorise que la piste CC0 vérifiée (taille et SHA-256) et fait
  échouer `npm run build` si un autre MP3 apparaît dans `public/` ou dans les ressources Android.
- Les trois carillons synthétisés restent disponibles et clairement étiquetés ; l'import d'un fichier
  personnel reste possible et ne quitte pas l'appareil. Les préférences qui pointaient vers un ancien
  `adhan-*` non livré sont migrées vers un carillon au chargement ; une sélection `adhan-cc0` valide
  est conservée.
- La piste Fajr garde un réglage indépendant des autres prières.

### Tests

| Suite | Tests | Portée |
| --- | --- | --- |
| `tests/engine.test.ts` | 59 | ordre chronologique, minuit, changements d'heure, hégirien, années bissextiles, Asr, méthodes, corrections, pôles, entrées invalides, 18 cas de référence |
| `tests/timezone.test.ts` | 16 | 434 zones × 4 instants contre ICU, transitions, réforme marocaine 2026, zones à 30/45 min, Lord Howe |
| `tests/alarm-engine.test.ts` | 8 | livraison unique, anti-rejeu après redémarrage, événement manqué non joué en retard, fenêtre de grâce, mode natif sans timer JS |
| `tests/service-worker.test.ts` | 8 | précache, navigation hors ligne, portail captif/proxy 502, cache des régions, requêtes à ne pas intercepter |
| `tests/cities.test.ts` | 26 | intégrité du catalogue, doublons, variantes, recherche arabe/latine, proximité, découpage régional |
| `tests/cities-loading.test.ts` | 6 | chargement paresseux de l'index et des régions, repli hors ligne sur le bundle |
| `tests/tasbih.test.ts` | 24 | persistance immédiate, annulation bornée, objectifs, sessions, historique, données corrompues |
| `tests/location-change.test.ts` | 3 | recalcul des horaires et réarmement des alarmes après changement de ville |
| `tests/audio-catalog.test.ts` | 25 | piste CC0 livrée et hashée, absence des 8 fournis, `SOUND_URL`, précache, mapping `Sounds.kt`, défaut, migration |

Voir [`docs/TESTS.md`](docs/TESTS.md) pour les résultats exacts, y compris les écarts constatés
avec les données de référence.

---

## Ce qui n'existe pas (et n'est pas simulé)

- **Aucun APK/AAB n'est fourni** : cet environnement n'a ni JDK, ni SDK Android, ni Gradle. Le
  projet Android est complet mais **n'a jamais été compilé** ; c'est écrit dans
  [`android/README.md`](android/README.md) et dans [`docs/LIMITES.md`](docs/LIMITES.md).
- **Aucun des huit enregistrements fournis n'est livré.** Ils proviennent de fichiers MP3 fournis
  par le propriétaire du projet ; les métadonnées citent `www.islamcan.com`, sans autorisation
  écrite. Ils restent dans `audio-cleaned/`, **hors du paquet**, et ne sont donc pas
  publiables/distribuables tant que la licence n'est pas établie : voir
  [`docs/AUDIO.md`](docs/AUDIO.md). L'Adhan CC0, lui, est inclus et sélectionné par défaut ; les
  trois carillons synthétisés restent disponibles, et l'utilisateur peut importer son propre fichier,
  qui reste sur son appareil.
- **Le Maroc n'est pas certifié** : la méthode `MOROCCO` (id 21, 19°/17°) est un point de départ
  observé, pas une validation du calendrier officiel.
- Pas de Qibla, pas de Coran, pas de notifications push distantes, pas de synchronisation de compte.

---

## Carte du dépôt

```
src/core/          moteur pur (astro, prières, méthodes, profils, fuseaux, hégirien, planning)
src/core/data/     cities-core.json (bundle), cities.json (tests), tzdata.json, audio-catalog.json, adhan-cc0.json
src/app/           shell, routeur, store, moteur d'alarmes, audio, tasbih, notifications, i18n
src/app/screens/   home, calendar, tasbih, methods, sounds, diagnostics, settings, onboarding
src/pwa/           gabarit du service worker
public/            manifeste, icônes, carillons WAV, Adhan CC0, motif zellige, data/cities/ (index + régions)
audio-cc0/         sources OGG/MP3 CC0 et preuves de provenance datées (hors paquet)
audio-originals/   copies intactes des 8 MP3 fournis (hors paquet, non redistribuables)
audio-cleaned/     copies nettoyées des 8 MP3 (hors paquet, évaluation locale uniquement)
tests/             185 tests exécutés par Vitest
android/           projet Kotlin/Compose (non compilé) : AlarmManager, service audio, bridge WebView
docs/              étude technique, conception système, architecture, design, calcul, audio, tests, sécurité, Android, limites
scripts/           génération des villes/fuseaux/audio + garde-fous CSP et release
```

## Documentation

1. [`docs/ETUDE-TECHNIQUE.md`](docs/ETUDE-TECHNIQUE.md) — comparaison Android natif / Flutter / PWA et décision
2. [`docs/SYSTEM-DESIGN.md`](docs/SYSTEM-DESIGN.md) — conception système complète : contexte, conteneurs, invariants, flux, pannes, sécurité, ADR
3. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — couches, flux, contrat web ↔ natif
4. [`docs/DESIGN-SYSTEM.md`](docs/DESIGN-SYSTEM.md) — jetons, composants, RTL, accessibilité
5. [`docs/CALCUL.md`](docs/CALCUL.md) — astronomie, méthodes, validation, limites de précision
6. [`docs/TESTS.md`](docs/TESTS.md) — ce qui est testé, comment, et avec quels résultats
7. [`docs/SECURITE.md`](docs/SECURITE.md) — audit manuel, remédiations, risques résiduels, en-têtes de production
8. [`docs/ANDROID.md`](docs/ANDROID.md) — compilation, permissions, politique Play, pièges OEM
9. [`docs/DEMARRAGE.md`](docs/DEMARRAGE.md) — installation, développement, déploiement
10. [`docs/LIMITES.md`](docs/LIMITES.md) — liste exhaustive de ce qui manque ou reste approximatif

## Confidentialité (résumé)

Les horaires sont calculés sur l'appareil. La position GPS n'est lue qu'après une action explicite,
n'est jamais transmise, et peut être remplacée par une ville ou des coordonnées saisies à la main.
Le bouton « Tout effacer » supprime réglages, journal, sons importés et historique de livraison.
La version Android ne déclare pas la permission `INTERNET`. Voir [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#10-données-et-confidentialité).
