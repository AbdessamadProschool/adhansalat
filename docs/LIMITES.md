# Limites connues

Liste exhaustive de ce que le projet **ne fait pas**, **ne garantit pas** ou **n'a pas pu vérifier**.
Elle est volontairement plus longue que la liste des fonctionnalités : une limite tue est une limite
qui ne surprend personne en production.

Chaque section dit aussi **ce qu'il faut faire** à la place, quand une solution existe.

---

## 1. Artefact Android : aucun APK / AAB fourni

L'environnement de développement ne contient **ni JDK, ni SDK Android, ni Gradle**. En conséquence :

- le projet `android/` est **complet mais n'a jamais été compilé** ;
- **aucun APK ni AAB n'est livré** ;
- aucune alarme `AlarmManager` n'a été déclenchée sur un appareil ;
- aucune ligne de Kotlin n'a été exécutée, pas même un test unitaire ;
- aucun wrapper Gradle n'est commité (il aurait été généré par Gradle lui-même).

**Conséquence pratique :** il faut lire `android/` comme du code à compiler et à recetter, pas comme
un binaire validé. La liste des points à vérifier à la première compilation est dans
[`ANDROID.md`](ANDROID.md#9-ce-quil-faut-vérifier-à-la-première-compilation), et la checklist de
recette sur appareil dans
[`ANDROID.md`](ANDROID.md#11-checklist-de-recette-sur-appareil-non-exécutée).

**Ce qui est réellement livré et exécutable :** la PWA (`dist/`), testée dans Chromium.

---

## 2. Rappels : le web ne peut pas réveiller un appareil

C'est la limite la plus importante du produit.

| Situation | Résultat |
| --- | --- |
| Onglet ouvert, machine éveillée | le rappel part à l'heure |
| Onglet en arrière-plan | le navigateur peut suspendre le timer : rappel tardif ou absent |
| Onglet fermé | **aucun rappel** |
| PWA installée, application fermée | **aucun rappel** |
| Écran verrouillé / machine en veille | **aucun rappel garanti** |

L'application ne compense pas cela par un artifice. Elle :

- n'utilise **pas** de Web Push (il faudrait un serveur, donc envoyer des données, et le projet est
  hors ligne par choix) ;
- n'utilise **pas** `Notification Triggers` ni Periodic Background Sync (non garantis, imprécis à la
  minute, absents sur plusieurs plateformes) ;
- affiche « Onglet ouvert uniquement » et une bannière d'avertissement dans le diagnostic ;
- n'affiche **jamais** de coche verte de type « alarme programmée » en mode web.

**À faire :** utiliser la version Android pour une garantie de sonnerie. C'est la seule raison
d'être du module natif.

---

## 3. Mode natif : ce qui reste incertain même après compilation

Ces limites ne disparaîtront pas avec une compilation réussie ; elles sont inhérentes à Android.

1. **Doze et surcouches constructeurs.** `setAlarmClock()` est la meilleure API disponible, mais
   Xiaomi/MIUI, Huawei/EMUI, Samsung One UI, Oppo/ColorOS et Vivo peuvent tuer l'application ou
   retarder un service. L'écran natif affiche l'état d'optimisation de batterie et propose un
   réglage ; il ne peut pas forcer la décision du constructeur.
2. **Alarmes exactes révoquées.** Sur Android 12, `SCHEDULE_EXACT_ALARM` peut être retirée après
   coup. L'application enregistre alors `deferred` et propose le réglage ; elle ne bascule **pas**
   sur un timer JS silencieux.
3. **Démarrage d'un service de premier plan depuis un receiver.** Android 14+ restreint ce cas. Le
   code prévoit un repli sur une notification seule, mais ce chemin n'a pas été exécuté.
4. **Audio** : dépend du volume média, du mode silencieux/Ne pas déranger, du focus audio et de la
   politique du constructeur. Aucun contournement du mode silencieux n'est tenté.
5. **Heure de l'appareil fausse.** Toutes les alarmes sont des instants absolus : si l'horloge du
   téléphone est fausse, l'alarme sonnera à l'heure de cette horloge fausse. Aucune vérification NTP
   n'est faite (elle exigerait le réseau).
6. **Réarmement après mise à jour de l'application** : `MY_PACKAGE_REPLACED` est déclaré, mais non
   testé sur appareil.

---

## 4. Audio : un Adhan CC0 livré, huit enregistrements fournis exclus du paquet

- **Un Adhan complet est livré** : « Beautiful adhan » par Adam-synagda, Wikimedia Commons, licence
  **CC0 1.0**. MP3 de 1 781 329 octets, 154 s, SHA-256 épinglé, présent dans
  `public/audio/adhan/adhan-cc0.mp3` et `res/raw/adhan_cc0.mp3`, précaché par le Service Worker et
  sélectionné par défaut pour les cinq prières. Sa provenance et son attribution volontaire sont
  affichées dans l'écran « Sons et licences ».
- **La licence CC0 est celle publiée par l'auteur sur Commons**, pas une vérification indépendante
  des droits. Le projet conserve les preuves datées dans `audio-cc0/evidence/` : page source,
  réponse API `imageinfo`, résumé et texte juridique CC0, empreintes SHA-256 et SHA-1. Voir
  [`audio-cc0/PROVENANCE.md`](../audio-cc0/PROVENANCE.md).
- **La piste n'a pas été écoutée par un humain** dans cet environnement (aucune sortie audio). Le
  décodage intégral, la durée, les niveaux et l'absence de silence ≥ 1 s sont vérifiés ; la
  complétude et la qualité de la récitation restent à confirmer à l'écoute.
- Le dépôt contient **huit autres enregistrements d'Adhan** (`adhan-1/2/5/6/7/9/13/14`) issus des
  fichiers MP3 fournis par le propriétaire du projet. Ils ont été nettoyés (voir
  [`AUDIO.md`](AUDIO.md)) et conservés dans `audio-cleaned/`. **Ils ne sont ni dans la PWA ni dans
  l'APK** : `public/` et `android/app/src/main/res/raw/` n'en contiennent aucun, et
  `scripts/check-release-assets.mjs` fait échouer `npm run build` si un MP3 non autorisé y réapparaît.
- **Leur licence de redistribution n'est pas établie.** Les métadonnées des sources citent
  `www.islamcan.com` ; aucun fichier de licence ni autorisation écrite n'accompagne les MP3. Le
  catalogue généré porte donc `license: "unknown"`, `redistributionAuthorized: false` et
  `bundled: false` pour chaque piste. L'écran Sons liste les huit fichiers avec leur durée et leur
  poids, marqués « non inclus », sans bouton d'aperçu. **Ne pas les publier** avant accord écrit du
  détenteur des droits. Les originaux sont archivés dans `audio-originals/` et les copies nettoyées
  dans `audio-cleaned/`, tous deux hors du paquet.
- Les trois carillons (`chime-calm`, `chime-dawn`, `chime-alert`) restent des **sons synthétisés**,
  étiquetés comme tels. Avec l'Adhan CC0 et les imports de l'utilisateur, ils constituent l'audio
  embarqué. Les préférences enregistrées qui pointaient vers un ancien `adhan-*` non livré sont
  migrées vers un carillon au chargement ; une sélection `adhan-cc0` valide est conservée.
- L'utilisateur peut toujours importer **son propre** fichier (WAV, MP3, OGG, M4A, AAC, OPUS, FLAC ;
  30 Mo maximum). Le blob reste en IndexedDB pour le lecteur web et une copie est demandée au pont
  natif.
- **Dans la version Android, le fichier choisi est copié dans le stockage privé** via
  `importSound()` (`filesDir/sounds/<id>`), donc le service peut le lire même après un redémarrage.
  Si la copie échoue (URI illisible, quota, format refusé), l'alarme affiche une notification
  **sans audio**, avec la mention explicite, et enregistre `notify-no-audio`. Aucun son de
  substitution n'est joué. Cette copie et cette lecture n'ont **pas** été exécutées sur appareil.
- Le nettoyage audio est **conservateur** : coupe-rumble à 70 Hz, réduction de bruit douce (6 dB),
  suppression des silences en début/fin, normalisation à −18 LUFS / −2 dBTP, mono 22,05 kHz 32 kbps.
  Il ne « restaure » pas les sources 8 kHz et ne prétend pas à une qualité studio.
- **Aucune lecture réelle n'a été entendue** dans cet environnement (pas de sortie audio, pas
  d'Android compilé). Le MP3 CC0 est servi en HTTP 200, décodé (154,03 s) et le lecteur web émet son
  événement `playing` ; « le son sort du haut-parleur », en web comme sur Android, reste à vérifier
  sur appareil.
- En web, la lecture est soumise à la politique d'autoplay : sans interaction préalable avec la
  page, le navigateur peut bloquer le son. L'application signale l'échec au lieu de prétendre avoir
  sonné (`audio-failed`).
- Aucun fondu, aucune montée progressive du volume, aucune lecture en boucle.

---

## 5. Exactitude religieuse et méthodes

### 5.1 Aucun profil de pays n'est « certifié »

`verifiedAgainstLocalAuthority` vaut **`false` pour les ~80 profils de pays**, y compris le Maroc.
Cela signifie : un point de départ raisonnable, pas une validation par l'autorité locale.

### 5.2 Maroc

- `MOROCCO` = id 21, angles **19° / 17°**, corrections `dhuhr +5`, `maghrib +5`.
- Les corrections sont marquées **`observed`** : mesurées contre l'API de référence, parce que la
  bibliothèque source ne publie pas ces valeurs. Ce n'est pas une source officielle.
- Aucune comparaison avec le calendrier du ministère des Habous n'a pu être faite
  (`habous.gov.ma` injoignable depuis cet environnement).
- Attendre des écarts de quelques minutes avec le calendrier officiel, variables selon la ville et
  la saison.

### 5.3 Méthodes

- 23 entrées de catalogue, **22 calculables**. `MOONSIGHTING` (id 15) repose sur un modèle de
  visibilité du croissant, pas sur des angles : il est listé mais **désactivé**. Le sélectionner
  affiche une explication, pas une heure inventée.
- Les méthodes `TURKEY` (Diyanet) et `DUBAI` sont marquées **expérimentales** : leurs corrections
  proviennent de l'implémentation de référence, pas d'une publication officielle vérifiée.
- Les corrections « documentées » (MWL/ISNA/Égypte/Karachi/Qatar `dhuhr +1`, Turquie, Dubaï)
  proviennent de la bibliothèque `batoulapps/adhan`. Elles expliquent une partie des écarts avec
  d'autres applications.
- Une méthode n'est pas seulement un couple d'angles : intervalles (Umm al-Qura 90 min, Portugal
  77 min), angles de Maghrib (Jafari 4°, Téhéran 4,5°), corrections de minutes. Changer d'application
  change donc légitimement les minutes.

### 5.4 Hautes latitudes

- Cinq règles disponibles ; le défaut est `angleBased`.
- Si l'angle est inatteignable et que la règle choisie ne peut pas produire de valeur, la prière
  vaut **`null`** et l'interface affiche « — » avec une explication. Aucune heure n'est inventée.
- En jour polaire, Fajr et Isha peuvent être **inexistantes** (`unresolvable`). `nearestLatitude`
  produit une valeur, mais c'est une convention, pas une observation.
- Deux applications peuvent donc afficher des heures très différentes à Tromsø, Mourmansk ou
  Reykjavik sans qu'aucune ne « mente » : elles appliquent des conventions différentes.

### 5.5 Calendrier hégirien

- Calculé avec `islamic-umalqura` d'ICU, avec repli arithmétique si l'environnement ne le fournit
  pas.
- Le calendrier d'Umm al-Qura peut différer de **un jour** du calendrier observé localement (Maroc,
  Algérie, Tunisie, Inde, Pakistan…). L'application l'indique ; elle ne prétend pas donner la date
  locale officielle.
- Le réglage permet de masquer la date hégirienne si elle ne correspond pas à l'usage local.

### 5.6 Précision astronomique

| Source d'écart | Ordre de grandeur |
| --- | --- |
| Algorithme solaire basse précision | ±1 min sur 1900–2100 |
| Réfraction atmosphérique | constante standard (0,833°), pas la pression/température réelle |
| Relief et horizon local | plusieurs minutes en montagne ou vallée ; seule l'altitude du point est prise en compte |
| Arrondi d'affichage | ≤ 30 s (arrondi à la minute supérieure ; l'instant stocké reste exact) |
| Méthode vs calendrier officiel | 1–5 min, parfois plus |

L'écart maximal mesuré contre la référence externe est de **3 minutes** (`dubai 2026-06-21`, Asr),
sur 180 comparaisons. Ce n'est pas une garantie pour tous les lieux ni toutes les dates.

---

## 6. Temps et fuseaux

- La table embarquée couvre **2018-01-01 → 2045-01-01**, 434 zones, 2 033 transitions
  (34,4 Kio). Au-delà, le code retombe sur `Intl` de la plateforme.
- **Avant 2018**, la table ne couvre pas l'historique : le calcul d'une date ancienne dépend du
  `Intl` de l'hôte, qui peut contenir des règles erronées (c'est le cas de Windows/Chromium pour le
  Maroc).
- **Après 2045**, même dépendance à `Intl` ; une modification législative future ne sera pas connue
  de cette version.
- Aucune mise à jour automatique de la table n'est prévue : elle est régénérée par
  `scripts/build-tzdata.*` et exige une nouvelle version de l'application.
- Le diagnostic compare l'offset de l'OS et celui de la table. En cas de désaccord, **la table est
  utilisée** et le désaccord est affiché. Cela corrige un système faux, mais ne corrige pas une
  table obsolète.
- Un décalage UTC saisi à la main n'est **jamais** accepté comme fuseau : il faut une ville ou un
  identifiant IANA valide. C'est volontaire (un offset ne connaît pas l'heure d'été).

---

## 7. Lieux et recherche

- **47 735 localités** au total : **46 039 au Maroc** (toutes les localités habitées du dump GeoNames
  `MA.txt` : `PPL`, `PPLA*`, `PPLC`, `PPLF`, `PPLL`, `PPLS`) et **1 696** villes des autres pays
  (GeoNames `cities15000`, seuil de population). Le catalogue couvre les 12 régions marocaines et
  leurs provinces ; 113 localités marocaines ont un nom arabe vérifié et 11 921 disposent de
  variantes latines/arabes/tifinagh utilisables par la recherche.
- **Tous les douars ne sont pas garantis.** GeoNames contient ce que ses contributeurs ont saisi :
  une localité très récente, un hameau sans nom stable ou un toponyme local peut manquer. L'écran
  permet alors la saisie manuelle de coordonnées. Le catalogue ne remplace pas un référentiel
  territorial officiel.
- 45 638 entrées marocaines n'ont **aucune population renseignée** dans GeoNames (`pop = 0`) : elles
  sont listées pour leur nom et leurs coordonnées, pas classées par taille. Les 401 entrées qui ont
  une population servent au classement des résultats.
- Le catalogue est **découpé** pour ne pas bloquer le premier affichage : le bundle ne contient que
  `cities-core.json` (311 Kio : 1 696 villes mondiales + les 300 plus grandes localités marocaines).
  Le premier clic dans la recherche charge `public/data/cities/index.json` (2,2 Mio, ~763 Kio gzip),
  puis chaque région marocaine est chargée à la demande depuis `ma-XX.json` (13 fichiers, 9,23 Mio au
  total). Le service worker met ces fichiers en cache : une région consultée ou téléchargée reste
  disponible hors ligne. En cas d'échec réseau, les 1 996 entrées embarquées restent utilisables et
  l'interface le signale.
- La recherche est **hors ligne et normalisée** : accents (`Fès` → `fes`), casse, formes arabes
  (`أ/إ/آ` → `ا`, `ى/ي`, `ة/ه`), chiffres arabes, ponctuation (`Dar-el-Beida` = `Dar el Beida`).
  Elle classe exact, préfixe, mots puis sous-chaîne, et accepte un filtre pays. L'index léger couvre
  les 46 039 noms marocains et leurs noms arabes ; les variantes détaillées (provinces, graphies
  alternatives) deviennent cherchables une fois la région chargée.
- Les noms de **pays** sont localisés via `Intl.DisplayNames` ; les noms de localités s'affichent
  dans la forme arabe vérifiée quand elle existe, sinon en caractères latins GeoNames. Il n'y a pas
  de translittération automatique : une graphie latine non répertoriée peut ne rien trouver.
- Aucun géocodage inverse : le GPS ne donne pas de nom de rue. Il propose la localité la plus proche
  du catalogue avec sa distance, **sans écraser un choix manuel** ; l'utilisateur peut accepter ou
  conserver sa ville. Au-delà de 250 km, le libellé reste « Position actuelle ».
- Le GPS n'est lu qu'après un clic explicite. Un refus laisse la ville et les coordonnées
  manuelles disponibles ; l'application ne redemande pas en boucle.
- Pour un point GPS, le fuseau vient de `Intl.DateTimeFormat().resolvedOptions().timeZone` (donc du
  système). Si le système est mal configuré, le fuseau l'est aussi ; le diagnostic le montre.
- L'altitude n'est utilisée que si elle est fournie : altitude GPS, altitude de la ville du
  catalogue, ou champ « altitude » (optionnel) de la saisie manuelle. Laissée vide, elle vaut 0 et
  l'horizon est calculé au niveau de la mer.
- **Source et licence** : GeoNames, licence **CC BY 4.0**, attribution affichée dans l'application.
  Les fichiers sont régénérables par
  `node scripts/build-cities.mjs --ma … --admin1 … --admin2 … --cities …` ; la vérification complète
  est dans [`GEONAMES.md`](GEONAMES.md). `src/core/data/cities.json` (9,45 Mio) reste le dataset
  complet réservé aux tests et rapports : l'application ne l'importe jamais.

---

## 8. Fonctionnalités absentes

| Absent | Détail |
| --- | --- |
| **Qibla** | aucune boussole, aucun calcul de direction. Non implémenté. |
| **Coran, hadiths, invocations** | hors périmètre. |
| **Imsak / Iftar / calendrier Ramadan** | pas d'écran dédié. Seule une note dans la description de la méthode Umm al-Qura mentionne l'usage de 120 min pendant Ramadan. |
| **Comptes, synchronisation, sauvegarde cloud** | aucun compte, aucun serveur. L'export est un fichier JSON local. |
| **Notifications push distantes** | impossibles sans serveur, et contraires au choix hors ligne. |
| **Publicité, analytics, rapports de crash** | aucun. Aucun SDK tiers dans le bundle. |
| **Widget d'écran d'accueil Android** | non écrit. |
| **Montre, Wear OS, iOS natif, desktop natif** | non écrits. |
| **Lecture d'un Adhan en streaming** | impossible : pas de permission `INTERNET` côté Android. |
| **Thème sombre natif Android** | l'écran Compose de diagnostic est en clair uniquement ; le thème sombre existe côté web. |
| **Mise à jour de l'application depuis l'interface** | le service worker attend la fermeture de tous les onglets ; aucun bouton « Mettre à jour ». |

---

## 9. Interface, langues, accessibilité

- **Traductions non relues par des locuteurs natifs.** Les textes français, anglais et arabes ont
  été écrits pour ce projet. Des maladresses de formulation sont possibles, en particulier en arabe
  pour les termes techniques (fuseau, alarme exacte, haute latitude).
- **Accessibilité non testée avec un lecteur d'écran réel** (NVDA, VoiceOver, TalkBack). Le code
  utilise une sémantique correcte et Lighthouse donne 100 en accessibilité sur six écrans, mais
  aucun parcours assisté n'a été enregistré.
- **Pas de test utilisateur**, pas de test de contraste sur appareil réel, pas de test en plein
  soleil, pas de test de pouce sur grand écran.
- **Un seul navigateur testé : Chromium.** Safari, Firefox et iOS n'ont pas été exécutés. Risques
  connus : `Intl.supportedValuesOf` absent sur les moteurs anciens (un repli existe mais n'a pas été
  exercé), vibration non supportée sur iOS, `Notification` indisponible sur certaines versions.
- **Aucune politique de sécurité du contenu (CSP).** Le code utilise des attributs `style="…"`
  en ligne dans plusieurs écrans, ce qui obligerait à autoriser `'unsafe-inline'` pour les styles et
  viderait une partie de l'intérêt. Mitigations réelles : aucun contenu distant, aucun script tiers,
  aucune injection HTML à partir d'une valeur utilisateur (`textContent` partout, `innerHTML`
  réservé aux tracés SVG internes), et aucune permission `INTERNET` côté Android.
- Le rendu arabe dépend des polices installées sur l'appareil (aucune police téléchargée) : le
  rendu peut varier entre Windows, Android et macOS.
- Les heures restent en **chiffres latins** quel que soit la langue. C'est un choix de lisibilité,
  pas un oubli ; il ne convient pas à tous les usages.

---

## 10. Données et confidentialité

- Réglages, journal, registre de livraison : `localStorage` (limite habituelle ~5 Mo par origine).
  Le journal est plafonné à 200 entrées, le registre à 200 clés.
- Sons importés : IndexedDB (web) et copie dans le stockage privé Android (natif), 30 Mo maximum par
  fichier, sans quota explicite. Un quota dépassé provoque une erreur affichée ; aucun son n'est
  tronqué silencieusement.
- **Aucune donnée ne quitte l'appareil** : aucun appel applicatif, aucune permission réseau côté
  Android. Cela signifie aussi **aucune sauvegarde** : désinstaller ou « Tout effacer » perd tout.
- L'export JSON contient les réglages et la position ; c'est un fichier local que l'utilisateur
  choisit d'écrire. Il n'est pas chiffré.
- Aucune gestion multi-utilisateur : les réglages sont ceux du profil du navigateur.

---

## 11. Tests : ce qui n'a pas été exécuté

| Élément | Statut |
| --- | --- |
| Compilation Android (Kotlin, Gradle, ressources) | **jamais exécutée** |
| Alarmes `AlarmManager`, `BroadcastReceiver`, redémarrage | **jamais exécutées** |
| Service audio natif, focus, écran verrouillé | **jamais exécuté** |
| Import audio WebView → stockage privé, lecture d'un fichier importé | **jamais exécuté** |
| Audit des événements manqués après redémarrage | **jamais exécuté** |
| WebView + `WebViewAssetLoader` | **jamais exécuté** |
| Rechargement réellement hors ligne | non réalisable dans le harnais : le proxy local renvoie 502 et l'origine LAN en HTTP n'est pas un contexte sécurisé, donc aucun Service Worker ne s'y enregistre ; logique testée en `node:vm` |
| Audio réellement audible | **non vérifié** (environnement sans sortie audio) ; fichiers, décodage, durée et événement `playing` testés |
| Écoute humaine de l'Adhan CC0 (complétude et qualité de la récitation) | **non vérifiée** ; contrôles techniques seulement |
| Vibration Tasbih | dépend du matériel ; l'API est appelée et son refus affiché, jamais simulé |
| Lecteurs d'écran | non testés |
| Safari, Firefox, iOS | non testés |
| Notifications système réelles (web) | non vérifiées visuellement (permission refusée dans le harnais) |
| PWA installée sur un appareil physique | non testée |
| Montée en charge (10 000 utilisateurs, gros fichiers) | non testée |

Le détail de ce qui **est** testé se trouve dans [`TESTS.md`](TESTS.md).

---

## 12. Poids du bundle et démarrage

- La build de production pèse **529,73 Ko de JS (158,98 Ko gzip)** et **45,05 Ko de CSS
  (9,18 Ko gzip)**. Le JS contient `cities-core.json` (311 Kio : 1 696 villes mondiales + les 300
  plus grandes localités marocaines) ; le reste du catalogue n'est plus dans le bundle.
- Le premier affichage ne dépend donc plus des 46 039 localités marocaines. Le premier clic dans la
  recherche charge `data/cities/index.json` (2,2 Mio, ~763 Kio gzip) ; les régions (`ma-XX.json`,
  13 fichiers, 9,23 Mio au total) sont chargées à la demande. Une fois consultées ou téléchargées
  via « Télécharger tout le Maroc hors ligne », elles restent disponibles hors ligne (cache du
  Service Worker). Si le réseau échoue, les 1 996 entrées embarquées restent utilisables et
  l'interface le dit.
- Le Service Worker précache **20 entrées** (bundle, polices, trois carillons, l'Adhan CC0, motif
  zellige, manifeste/icônes). Le déploiement complet représente **15 372 545 octets (35 fichiers,
  ~14,7 Mio)**, dont 1,78 Mo pour l'Adhan CC0 et l'essentiel du reste pour le catalogue régional
  téléchargé à la demande et non au premier chargement.
- Le découpage a été mesuré après build, pas extrapolé : l'ancien bundle de 9 054 Ko / 1 448 Ko gzip
  contenait tout `cities.json`. Aucun budget de performance n'a été mesuré sur appareil bas de gamme.

---

## 13. Politique Play et distribution

- Aucune fiche Play, aucun keystore, aucune signature release ne sont fournis.
- `USE_EXACT_ALARM` est une permission restreinte : Play peut la refuser si la fiche ne présente pas
  clairement l'application comme une application d'alarme. Le texte de justification proposé est
  dans [`ANDROID.md`](ANDROID.md#4-politique-google-play-pour-les-alarmes-exactes) ; il devra être
  adapté et défendu.
- La politique de confidentialité doit être publiée séparément (URL publique) avant toute
  soumission ; ce dépôt contient le texte de l'écran de confidentialité, pas une page hébergée.
- Aucune mention de marque, de mosquée ou d'autorité religieuse n'est utilisée pour suggérer une
  approbation.

---

## 14. Résumé en une phrase par limite

1. **Pas d'APK** : le module Android est du code non compilé.
2. **Le web ne sonne pas onglet fermé** : par construction, pas par bug.
3. **Audio** : un Adhan CC0 complet est livré et sélectionné par défaut ; les huit enregistrements fournis restent hors paquet, non publiables sans accord écrit.
4. **Le Maroc n'est pas certifié** : point de départ 19°/17° avec corrections observées.
5. **Les hautes latitudes sont une convention** : deux applications peuvent différer sans mentir.
6. **Le calendrier hégirien peut différer d'un jour** : Umm al-Qura ≠ observation locale.
7. **La table de fuseaux s'arrête en 2045** : au-delà, dépendance à `Intl`.
8. **47 735 localités, pas toutes les douars** : catalogue GeoNames, recherche normalisée hors ligne.
9. **Pas de Qibla, pas de compte, pas de sync, pas de push** : hors périmètre assumé.
10. **Accessibilité et traductions non validées par des humains** : contrôles automatiques seulement.
11. **Tasbih local et sans classement** : pas de compte, pas de série à maintenir, historique sur l'appareil.
12. **Aucun test sur appareil Android réel** : la recette reste à faire.
13. **Catalogue découpé** : bundle initial allégé, mais le premier recherche charge 2,2 Mio (763 Kio gzip) et une région non consultée nécessite le réseau.
14. **Audit de sécurité manuel** : Strix n'a pas pu être exécuté (Docker et clé LLM absents), l'APK n'a pas été compilé et aucun appareil n'a été testé ; voir [`SECURITE.md`](SECURITE.md).
