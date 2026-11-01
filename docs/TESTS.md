# Rapport de tests

Tout ce qui suit a été **exécuté** dans cet environnement (Windows, Node 24.19, npm 11, Chromium via
le harnais de navigateur). Les commandes sont reproductibles telles quelles.

```
npx vitest run        → 10 fichiers, 185 tests, 0 échec
npx tsc --noEmit      → 0 erreur
npm run build         → garde-fou CSP OK, garde-fou audio OK, dist/ généré
```

## 1. Répartition

| Fichier | Tests | Ce qu'il prouve |
| --- | ---: | --- |
| `tests/engine.test.ts` | 59 | calcul, ordre, fuseaux, méthodes, hautes latitudes, entrées invalides, référence externe |
| `tests/timezone.test.ts` | 16 | table embarquée contre ICU, transitions, zones exotiques, provenance du fuseau, arithmétique de dates |
| `tests/alarm-engine.test.ts` | 8 | livraison unique, anti-rejeu, événement manqué, fenêtre de grâce, mode natif atomique, résultat natif honnête |
| `tests/service-worker.test.ts` | 9 | précache, purge des anciens bundles, navigation hors ligne, portail captif, cache des régions, requêtes exclues |
| `tests/csp.test.ts` | 9 | hash du script inline, absence de `'unsafe-inline'`/`'unsafe-eval'`, `media-src blob:`, détection d'un affaiblissement |
| `tests/cities.test.ts` | 26 | intégrité du catalogue, doublons, variantes, recherche arabe/latine, proximité, découpage régional |
| `tests/cities-loading.test.ts` | 6 | index chargé une fois, région à la demande, repli hors ligne sur le bundle |
| `tests/tasbih.test.ts` | 24 | persistance immédiate, undo borné, objectifs, sessions, historique, données corrompues |
| `tests/location-change.test.ts` | 3 | recalcul des horaires et réarmement des alarmes après changement de ville |
| `tests/audio-catalog.test.ts` | 25 | piste CC0 livrée, hashée et décodable, absence des 8 fournis, `SOUND_URL`, précache, mapping Kotlin, défaut, migration |
| **Total** | **185** | |

Durée d'exécution : ~6 s sur la machine de référence (build 2026-10-29) ; la validation des fuseaux
et la lecture du dataset complet dominent.

## 2. Moteur de calcul (59 tests)

### Référence externe

18 lieux, 33 dates, 6 champs. Après exclusion de deux cas documentés (voir
[`CALCUL.md`](CALCUL.md#5-validation-contre-une-référence-externe)) :

```
[engine] 180 field comparisons, worst |diff| = 3 min
         (dubai 2026-06-21 asr: 15:46 vs 15:43)
```

Le test vérifie aussi que **chaque exclusion est justifiée** : une date exclue sans raison déclarée
fait échouer la suite. C'est ce qui empêche de « faire passer » un écart en le supprimant.

### Invariants chronologiques

- Fajr < lever < Dhuhr < Asr < Maghrib < Isha pour chaque jour testé ;
- le passage de minuit ne fait pas reculer un horaire ;
- les années bissextiles (29 février) et les fins de mois sont gérées ;
- une correction utilisateur décale exactement la prière visée, en minutes entières ;
- le lever du soleil n'est jamais compté comme une sixième prière.

### Fuseaux et changements d'heure

- même résultat que l'offset soit lu par la table ou par ICU ;
- traversée du passage à l'heure d'été américain (8 mars 2026) sans erreur d'une heure ;
- traversée du retour à l'heure d'hiver (1er novembre 2026) ;
- date locale correcte près de la ligne de changement de date (Auckland, Honolulu) ;
- aller-retour heure murale → instant → heure murale ;
- Asr hanafite toujours postérieur à l'Asr standard ;
- Umm al-Qura : Isha exactement 90 minutes après le coucher ;
- méthode inconnue → repli sur le défaut, sans exception.

### Hautes latitudes

- règle `none` : `null` plutôt qu'une heure inventée ;
- nuit polaire : un angle atteignable est conservé (pas de « correction » inutile) ;
- jour polaire : `unresolvable` quand aucune nuit n'existe ;
- `nearestLatitude` produit une heure exploitable en jour polaire ;
- `seventhOfNight` reste plus proche de minuit que `middleOfNight`.

### Entrées invalides

- latitude hors [−90, 90] et longitude hors [−180, 180] → `EngineInputError` ;
- date malformée → exception ;
- aux pôles, aucun `NaN` ne sort du moteur.

### Géométrie solaire

- à l'équateur, journée proche de 12 h toute l'année ;
- midi solaire toujours entre lever et coucher ;
- les dates de référence sont interprétées correctement.

## 3. Table de fuseaux (16 tests)

- **434 zones** couvertes, soit toutes les zones IANA connues de la plateforme ;
- couverture 2018 → 2045 ;
- transitions strictement croissantes ;
- **1 736 comparaisons** (434 zones × 4 instants) contre l'ICU de la plateforme : toutes
  concordantes ;
- le Maroc bascule bien à UTC+1 et suspend l'heure d'été pendant Ramadan ;
- zones à 30 min (Kolkata) et 45 min (Kathmandu) correctes ;
- Lord Howe, seul décalage DST de 30 minutes, correct ;
- hors plage ou zone inconnue → `null`, pas de valeur inventée ;
- bascule à la minute exacte de la transition parisienne ;
- `formatInZone()` n'appelle pas le fuseau de l'hôte pour réinterpréter l'instant ;
- la clé de date change à minuit **local**, pas à minuit UTC ;
- les offsets s'affichent sous la forme stable `UTC+HH:MM` ;
- `osOffsetMinutesAt()` reste disponible séparément pour le diagnostic ;
- `zoneSourceAt()` nomme la provenance (`bundled-table`, `platform`, `unknown`) et une zone inconnue
  n'est jamais présentée comme résolue en UTC.

## 4. Moteur d'alarmes (8 tests)

Le vrai `AlarmEngine` et le vrai `SettingsStore` sont utilisés ; seules les API navigateur et le
lecteur audio sont remplacés. Horloge simulée avec `vi.useFakeTimers()`.

1. **Livraison unique** : une prière due est jouée une fois, marquée `fired`, et un second plan ne
   la rejoue pas. Un **nouvel** moteur sur le même store (redémarrage simulé) reste muet : c'est le
   registre persistant, pas le timer, qui garantit l'unicité.
2. **Événement manqué** : 5 minutes de retard → `missed`, **aucun son**, état `missed` dans l'UI.
3. **Pas de rétro-remplissage** : le premier plan d'une session ne fabrique pas de « manqués »
   artificiels ; il journalise `alarms.history`.
4. **Borne de grâce** : à `120 s − 1 s` la prière est jouée ; à `120 s + 1 s` elle est manquée.
5. **Mode natif atomique** : un payload de 31 jours est poussé au pont par **un seul** appel
   `schedule()`, sans `cancelAll()` préalable ; une prière qui devient due pendant que l'application
   est ouverte **n'est pas** jouée par la page (l'OS possède la livraison).
6. **Résultat différé** : `deferred: true` est journalisé en `warn`, jamais en succès.
7. **Rejet total** : un résultat `stored: 0` indique explicitement qu'aucun plan n'a été persisté,
   au lieu de prétendre que des alarmes sont stockées.
8. **Résultat absent** : un pont ancien qui ne renvoie rien produit `result-unknown`, pas un faux OK.

## 5. Service worker (9 tests)

Le worker généré est exécuté dans un contexte `node:vm` avec un cache mémoire et un réseau simulé.

- installation : toutes les entrées sont précachées ;
- une entrée cassée (404) n'annule pas l'installation des autres ;
- activation : les bundles hachés d'une build précédente sont supprimés, les assets courants et les
  régions téléchargées sont conservés ;
- navigation réseau coupé → coquille en cache, HTTP 200 ;
- navigation avec réponse **502** (proxy/portail captif) → coquille en cache, pas la page d'erreur ;
- cache vide + réseau coupé → **503 explicite**, jamais un faux succès ;
- asset hors ligne → servi depuis le cache ;
- requêtes `Range`, cross-origin, `/sw.js` et non-GET → laissées au réseau.

## 5 bis. Content-Security-Policy (9 tests)

`scripts/check-csp.mjs` recalcule le SHA-256 du script inline de `index.html` et vérifie la politique
avant chaque build ; `tests/csp.test.ts` exécute le même contrôle et prouve qu'il échoue si :

- le script inline change sans mise à jour du hash ;
- `script-src` réintroduit `'unsafe-inline'` (ou `'unsafe-eval'`) ;
- un attribut `on*=` ou une URL `javascript:` apparaît dans le document ;
- la balise meta CSP disparaît.

La politique livrée épingle le seul script inline par hash, autorise `media-src blob:` (nécessaire aux
enregistrements importés) et interdit `object-src`, `frame-src`, `form-action` et `base-uri`.

## 6. Lieux et recherche (26 tests + 6 tests de chargement)

Le dataset complet réel est chargé pour les tests (pas une fixture) : 47 735 entrées. Les tests de
chargement lisent les vrais fichiers générés (`index.json`, `ma-07.json`) avec un `fetch` simulé.

- **Couverture** : 46 039 localités marocaines (> 40 000 exigé), 1 696 entrées hors Maroc
  préservées, 244 pays, statistiques cohérentes avec les données.
- **Aucun doublon** d'`id` ni de couple `nom + coordonnées`.
- **Coordonnées et fuseaux** : chaque latitude/longitude est finie et dans les bornes ; chaque
  fuseau distinct est un identifiant IANA valide (validation mise en cache pour rester rapide).
- **Enveloppe** : toutes les localités marocaines sont dans 20,7–36,0 °N / −17,2–−0,8 °E et dans un
  fuseau marocain ; les trois entrées GeoNames incohérentes sont absentes.
- **Petites localités** : 45 638 entrées marocaines sans population et des noms contenant « Douar »
  — le catalogue n'est pas limité aux grandes villes.
- **Régions/provinces** : Casablanca porte `Casablanca-Settat` / `Casablanca`, et le libellé arabe
  de la région est correct.
- **Noms arabes vérifiés** : `Fes` → `فاس`, `Casablanca` → `الدار البيضاء` en affichage arabe ;
  l'affichage latin reste `Fes`.
- **Normalisation** : accents (`Fès` → `fes`), casse, article et ponctuation (`Dar-el-Beida`),
  variantes arabes (`أ/إ/آ` → `ا`, `ى/ي`, `ة/ه`), espaces multiples.
- **Recherche** : `Tetouan` trouve `Tétouan`, `فاس` trouve `Fes`, `الدار البيضاء` trouve
  `Casablanca`, `dar el beida` aussi ; le préfixe passe avant la sous-chaîne ; une requête d'une
  lettre ou inconnue ne renvoie rien ; le filtre pays restreint bien à `MA`.
- **Découpage** : le bundle ne contient que 1 996 entrées (1 696 hors Maroc + 300 marocaines) ;
  `index.json` contient exactement 46 039 entrées ; les 13 fichiers régionaux couvrent chaque
  localité une seule fois, sans trou, et leurs coordonnées coïncident avec l'index.
- **Chargement** : l'index n'est récupéré qu'une fois, une région est mise en cache mémoire, et un
  réseau coupé laisse le bundle utilisable (`cityDataState() === 'failed'`).
- **Proximité** : un point à Casablanca renvoie une entrée du bundle à moins de 15 km, et deux
  appels au même point donnent la même distance.

## 7. Tasbih (24 tests)

Le vrai `TasbihStore` est utilisé avec un stockage mémoire injecté (pas de DOM).

- 33 objectif par défaut, historique vide, références intégrées conformes
  (`Sahih Muslim 597a`, `2691`, `Q 71:10`, `Q 18:39`, `Q 33:56`) ;
- **aucun champ** `score`, `streak` ou `ranking` dans l'état ;
- chaque incrément écrit immédiatement ; un nouveau store relit le compte ;
- l'objectif n'est signalé atteint qu'au seuil ; les comptes restent séparés par dhikr ;
- undo restaure le compte et dépile ; reset ne touche qu'au dhikr visé et reste annulable ;
- objectif libre (`null`) : compte sans seuil ;
- favoris sans doublon ; dhikr personnalisé ajouté, nettoyé, sans référence inventée ;
- suppression d'un dhikr personnalisé : comptes, favoris et sessions associés disparaissent ;
- persistance d'un dhikr personnalisé après rechargement ;
- session 33/33/33/1 : avance automatique, une seule entrée d'historique, total 100 ;
- undo d'une session terminée restaure l'étape à 99 et retire l'entrée d'historique ;
- reprise d'une session active après rechargement (étape et compte) ;
- abandon sans historique ; session vide refusée ; session personnalisée créée et persistée ;
- JSON corrompu → état par défaut ; comptes/favoris orphelins purgés ; étapes inconnues retirées ;
- fonctionnement sans stockage (mémoire seule).

## 8. Changement de lieu (3 tests)

- changer Casablanca → Paris recalcule les horaires (écart Fajr > 30 min et < 10 h) ;
- le plan d'alarmes est reconstruit (l'heure ISO de Fajr change) ;
- une alarme déjà partie n'est pas rejouée après le changement de ville.

## 9. Catalogue audio (25 tests)

**Piste CC0 livrée**

- une seule piste intégrée : `adhan-cc0`, marquée `bundled: true`,
  `redistributionAuthorized: true`, licence `CC0-1.0` ;
- titre `Beautiful adhan`, auteur `Adam-synagda`, page source Wikimedia Commons, licence CC0,
  attribution non vide ;
- le fichier livré existe, pèse exactement 1 781 329 octets, son SHA-256 correspond aux métadonnées,
  sa durée mesurée est comprise entre 150 et 160 s, format MP3, 44 100 Hz ;
- la copie Android `res/raw/adhan_cc0.mp3` est **octet pour octet** identique ;
- l'OGG source et `audio-cc0/PROVENANCE.md` existent hors du paquet ;
- `SOUND_URL` contient `adhan-cc0` et les trois carillons, aucun `adhan-1..14` ;
- `BUILTIN_SOUNDS` place `adhan-cc0` en premier (`source: 'cc0'`), puis les trois carillons, puis
  `none` ; aucun son intégré n'est marqué `supplied` ;
- `defaultPreferences()` sélectionne `adhan-cc0` pour les cinq prières, audio activé ;
- aucun son fantôme : tout id intégré (sauf `none`) a un fichier existant.

**Rien d'autre n'est livré**

- sous `public/`, le seul fichier audio non-WAV est `audio/adhan/adhan-cc0.mp3` ;
- sous `android/.../res/raw/`, le seul MP3 est `adhan_cc0.mp3` ;
- `STATIC_ASSETS` précache exactement `/audio/adhan/adhan-cc0.mp3` et le motif zellige ;
- `Sounds.kt` mappe `"adhan-cc0" -> R.raw.adhan_cc0` et les trois carillons, aucun `adhan_<n>` ;
- `build.gradle.kts` copie `adhan-cc0.mp3` depuis `public/audio/adhan/` vers la racine `res/raw/`
  (pas de sous-dossier) et marque `wav`/`mp3` `noCompress` ;
- le garde-fou `scripts/check-release-assets.mjs` réussit sur cet état.

**Enregistrements fournis**

- 8 pistes exactement, numéros `1/2/5/6/7/9/13/14`, ids et noms de ressources stables ;
- **aucune piste marquée `bundled`** tant que `redistributionAuthorized` est faux ;
- chaque copie nettoyée existe dans `audio-cleaned/`, sa taille sur disque égale celle du catalogue,
  durée > 60 s ;
- les 8 originaux sont archivés dans `audio-originals/` avec leur README ;
- licence `unknown`, `redistributionAuthorized: false`, artiste source documenté ;
- la licence CC0 est enregistrée comme licence publiée, **pas** comme garantie juridique.

**Migration**

- une préférence stockée vers `adhan-*` revient à un carillon ;
- une sélection `adhan-cc0` valide est **conservée**, y compris `fajrSoundOverride` ;
- un import encore enregistré est conservé ; un import supprimé revient à un carillon.

## 10. Vérifications navigateur

Serveur de développement Vite (`http://192.168.1.102:4174`) piloté dans Chromium, après un
onboarding complet. Aucune capture d'écran n'a pu être produite (le harnais exige un onglet
visible) : les constats portent sur le DOM, les attributs ARIA, `localStorage` et les événements
clavier réels.

| Vérification | Résultat |
| --- | --- |
| Onboarding complet (langue → position → méthode → notifications) | OK, Tétouan sélectionnée |
| Recherche « Tetouan » | trouve `Tétouan` avec région `Tanger-Tetouan-Al Hoceima`, province `Tetouan`, fuseau `Africa/Casablanca`, coordonnées |
| 8 écrans rendus, navigation à 6 entrées | OK |
| Erreurs console | **0** après correction CSP (`style-src 'self' 'unsafe-inline'`, retrait de `frame-ancestors` du `<meta>`) |
| Tasbih — rendu | 7 dhikr, référence `Sahih Muslim 597a`, 3 objectifs, switch vibration |
| Tasbih — clavier | Espace puis Entrée : 0 → 2 ; focus conservé sur le bouton ; `aria-label` « Compteur de Subhan Allah — 2 / 33 » ; `aria-live` « 2 / 33 » |
| Tasbih — persistance | rechargement : compte 2 conservé (`azan.tasbih.v1`) |
| Tasbih — objectifs | 33 → 100 → Libre → 33, libellé mis à jour à chaque fois |
| Tasbih — session 33 · 33 · 33 · 1 | 100 pressions : avance automatique des 4 étapes, session terminée, `activeSession = null`, 1 entrée d'historique de total 100 |
| Tasbih — historique | entrée visible avec date et détail des 4 étapes |
| Thème sombre | `data-theme="dark"`, fond `#0C1512` (12, 21, 18) |
| Arabe | `dir="rtl"`, `lang="ar"`, puces de dhikr en arabe, traduction redondante masquée |
| Sons (build antérieure) | 11 entrées (8 fournies + 3 carillons), mention « enregistrement fourni », avertissement de licence |
| Fichiers audio servis (build antérieure) | `GET Range` → **206**, `audio/mpeg`, pour les 8 pistes |
| Lecture d'une piste (build antérieure) | le lecteur émet son événement `playing` et l'écran affiche « lecture réussie » ; **aucune écoute réelle** dans cet environnement |
| Diagnostic fuseau | `OS UTC+00:00 → table UTC+00:00` après le correctif marocain de 2026 |
| Permissions refusées | état « autorisation requise », aucun faux OK |

**Rejeu sur la build de production (2026-10-29).** `npm run preview` puis chargement de
`index-DkrPtZfD.js` dans Chromium, `localStorage` vidé, onboarding complet jusqu'à Tétouan :

| Vérification | Résultat |
| --- | --- |
| Erreurs console | **0** sur l'onboarding et l'écran Adhan |
| `GET /audio/adhan/adhan-cc0.mp3` | **200**, `audio/mpeg`, **1 781 329 octets** |
| Décodage / métadonnées navigateur | `loadedmetadata` → **154,03 s** |
| Lecture via le lecteur web | événement `playing` émis, message « Lecture réussie du fichier sélectionné. » |
| Cache hors ligne | `caches.open('azan-v2')` → `match('/audio/adhan/adhan-cc0.mp3')` = 200, même taille ; 4 entrées audio (CC0 + 3 carillons) |
| Préférences par défaut | les 5 prières ont `soundId: "adhan-cc0"` dans `azan.settings.v1` après onboarding |
| Sélecteurs de l'écran Sons | 5 × `Adhan audio` = `adhan-cc0` ; options : Beautiful adhan, 3 carillons, « Aucun son » |
| Bibliothèque | « Adhan — Beautiful adhan · 2:34 · enregistrement CC0 » + 3 carillons ; **aucune** option `Adhan N` |
| Crédits | titre, auteur, projet, licence CC0, URL source, URL licence, format/durée/taille affichés |
| Catalogue fourni | 8 lignes « non inclus », sans aperçu, avec l'avertissement de licence |

Aucune écoute humaine n'a eu lieu : l'environnement n'a pas de sortie audio. Le chargement réel de
l'index et d'une région n'a pas été rejoué (le pilotage du dialogue de ville a échoué dans le
harnais) ; il reste couvert par `tests/cities-loading.test.ts`, qui lit les vrais fichiers générés.

### Lighthouse

Mesures effectuées sur une build antérieure ; **non rejouées** après l'ajout du catalogue complet,
du Tasbih et le retrait des pistes audio.

| Écran | Accessibilité | Best practices | SEO |
| --- | ---: | ---: | ---: |
| Accueil | 100 | 100 | 100 |
| Calendrier | 100 | 100 | 100 |
| Méthodes | 100 | 100 | 100 |
| Adhan / sons | 100 | 100 | 100 |
| Réglages | 100 | 100 | 100 |
| Diagnostic | 100 | 100 | 100 |

Le calendrier était à 90 en accessibilité avant retrait de rôles `grid` incorrects (des `<button>`
ne peuvent pas être des `gridcell`).

## 11. Ce qui n'est PAS testé (et pourquoi)

| Élément | Statut | Raison |
| --- | --- | --- |
| Compilation de l'application Android | **non testée** | aucun JDK, SDK Android ni Gradle dans l'environnement |
| Alarmes système réelles (`AlarmManager`) | **non testées** | nécessite un appareil ou un émulateur Android |
| Service audio natif, focus, verrouillage d'écran | **non testé** | idem |
| Import audio WebView → stockage privé, lecture d'un fichier importé | **non testé** | idem |
| Événements manqués après redémarrage (audit natif) | **non testé** | idem ; la logique source est présente, aucune exécution Kotlin possible ici |
| WebView + `WebViewAssetLoader` | **non testé** | idem |
| Rechargement hors ligne réel | non réalisable ici | le harnais proxyfie `localhost` (502 quand le serveur tombe) et l'origine `http://192.168.1.102` n'est pas un contexte sécurisé ; le worker est donc testé en `vm` |
| Audio réellement audible | non vérifié | environnement headless ; fichiers, décodage et événement `playing` testés |
| Écoute humaine de l'Adhan CC0 (complétude et qualité de la récitation) | non vérifiée | seuls durée, décodage intégral, niveaux et absence de silence long sont mesurés |
| Lecteurs d'écran (NVDA, VoiceOver, TalkBack) | non testé | aucune session d'accessibilité réelle |
| Safari / Firefox / iOS | non testé | seul Chromium est disponible |
| Traductions par des locuteurs natifs | non relu | textes écrits pour ce projet |

Ces lignes sont répétées dans [`LIMITES.md`](LIMITES.md). Aucune d'elles n'est présentée comme
validée ailleurs dans la documentation.
