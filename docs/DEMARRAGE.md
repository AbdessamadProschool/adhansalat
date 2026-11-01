# Démarrage

Ce document décrit uniquement des commandes **exécutées dans cet environnement** (Windows 11,
Node 24.19.0, npm 11.17.0). Les commandes Android sont fournies mais n'ont pas pu être exécutées
faute de JDK et de SDK ; c'est signalé à chaque fois.

---

## 1. Prérequis

| Outil | Version utilisée | Nécessaire pour |
| --- | --- | --- |
| Node.js | 24.19.0 | tout le projet web |
| npm | 11.17.0 | dépendances et scripts |
| Navigateur | Chromium (testé) | vérifier la PWA |

Aucune variable d'environnement, aucune clé d'API, aucun compte, aucun serveur n'est requis. Le
projet n'envoie aucune requête réseau à l'exécution.

Pour la partie Android uniquement (non disponible ici) : JDK 17, Android SDK platform 36 et
build-tools 36.0.0, Gradle 8.13. Voir [`ANDROID.md`](ANDROID.md).

---

## 2. Installation

```bash
cd "C:\Users\arbas\Documents\Projet par défaut"
npm install
```

`npm install` installe Vite, TypeScript, Vitest et `adhan` (utilisé seulement comme **référence de
test**, jamais dans le bundle applicatif). Aucun `postinstall` necompile ni ne télécharge de ressource
externe.

---

## 3. Lancer en développement

```bash
npm run dev      # http://localhost:5173
```

- rechargement à chaud, service worker **désactivé** (il n'existe qu'au build) ;
- la première ouverture affiche l'onboarding : langue, puis lieu (GPS, ville ou coordonnées) ;
- un refus de géolocalisation n'est pas bloquant : la recherche de ville et la saisie manuelle
  restent disponibles.

### Vérifier rapidement que tout fonctionne

1. Choisir la langue — l'arabe doit basculer l'interface en RTL immédiatement.
2. Choisir « Casablanca ». L'accueil doit afficher un fuseau `UTC+01:00` et un décompte vers la
   prochaine prière.
3. Ouvrir **Réglages → Diagnostic** : la ligne « Données de fuseau » doit indiquer
   `OS UTC+00:00 → table UTC+01:00` sur Windows/Chromium (le système se trompe, la table embarquée
   corrige). C'est le comportement attendu, pas un bug.
4. Naviguer sur les six onglets : Accueil, Calendrier, Tasbih, Adhan, Méthodes, Réglages. Aucun bouton ne
   doit être grisé sans explication.

---

## 4. Tests et vérification de types

```bash
npm test          # 185 tests, ~6 s
npm run typecheck # tsc --noEmit, 0 erreur
```

Résultat attendu à la date de rédaction :

```
Test Files  9 passed (9)
     Tests  167 passed (167)
```

Les détails de ce que chaque suite prouve sont dans [`TESTS.md`](TESTS.md). Un écart de référence
s'affiche à chaque exécution : `180 field comparisons, worst |diff| = 3 min`. C'est volontaire.

---

## 5. Construire l'artefact PWA

```bash
npm run build     # tsc --noEmit && node scripts/check-release-assets.mjs && vite build
```

Sortie mesurée :

| Fichier | Taille | Gzip |
| --- | ---: | ---: |
| `assets/index-*.js` | 529,73 kB | 158,98 kB |
| `assets/index-*.css` | 45,05 kB | 9,18 kB |
| `sw.js` | 5,28 kB | — |
| `index.html` | 3,86 kB | 1,66 kB |
| audio (3 WAV + Adhan CC0 MP3) | 2,70 MB | — (déjà compressé) |
| `data/cities/` (index + 13 régions) | 11,95 MB | ~763 kB pour l'index |

`dist/` est autosuffisant : 20 entrées précachées par `sw.js` — la coquille `/`, 2 assets hachés
(JS + CSS), le manifeste, `robots.txt`, 4 icônes, le motif zellige, 3 carillons et l'Adhan CC0
(`/audio/adhan/adhan-cc0.mp3`). Les huit enregistrements fournis ne sont pas livrés : le catalogue
géographique (`data/cities/`) est téléchargé à la demande puis mis en cache par le service worker.

### Servir le build en local

```bash
npm run preview   # http://localhost:4173
```

Le service worker ne s'active **que** sur un contexte sécurisé : `localhost` ou HTTPS. Une IP de
réseau local en `http://` n'est pas un contexte sécurisé ; le worker ne s'y enregistre pas, ce qui
est un comportement du navigateur, pas un défaut de l'application.

### Déployer

Copier le contenu de `dist/` sur n'importe quel hébergeur statique en HTTPS (Netlify, Cloudflare
Pages, GitHub Pages, nginx, S3+CloudFront…). Contraintes :

- servir `index.html` pour les chemins inconnus (l'application utilise le hash, donc en pratique
  seule la racine est demandée) ;
- ne pas renommer les fichiers hachés ;
- ne pas mettre `sw.js` en cache long : il doit être revalidé pour que les mises à jour arrivent ;
- `manifest.webmanifest` doit être servi en `application/manifest+json` (le type MIME exact est
  toléré, mais c'est le bon) ;
- ajouter les en-têtes de sécurité de production (`Content-Security-Policy` avec `frame-ancestors`,
  `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS) : la liste exacte et le
  gabarit sont dans [`SECURITE.md`](SECURITE.md#45-en-têtes-de-production-s-06-s-08).

Aucune variable d'environnement, aucun back-end.

---

## 6. Installer la PWA

**Chromium / Edge (bureau)** : ouvrir l'application en HTTPS (ou `localhost`), puis icône
« Installer » dans la barre d'adresse, ou menu ⋮ → « Installer Azan Global ».

**Android (Chrome)** : menu ⋮ → « Ajouter à l'écran d'accueil ». L'application s'ouvre alors sans
barre d'adresse.

Ce que l'installation apporte : un chargement hors ligne complet et une icône. **Elle n'apporte pas
d'alarme système.** Les rappels ne partent que tant que l'application est ouverte ; c'est écrit dans
l'écran de diagnostic et dans [`LIMITES.md`](LIMITES.md).

---

## 7. Premier parcours dans l'application

1. **Langue** — arabe (RTL), français ou anglais. Modifiable ensuite dans Réglages.
2. **Lieu** :
   - **GPS** : après un clic explicite ; le fuseau IANA vient du système, jamais d'un simple
     décalage UTC, jamais d'une adresse IP ;
   - **Ville** : 47 735 localités GeoNames, dont 46 039 au Maroc, avec fuseau, région, province et
     variantes de nom ; 1 996 sont dans le bundle, le reste se charge à la demande (index puis
     région) et reste hors ligne une fois consulté ;
   - **Coordonnées** : latitude/longitude saisies, plus le fuseau choisi explicitement — l'écran
     refuse d'inventer un fuseau.
3. **Méthode** — pré-sélectionnée selon le pays, modifiable. L'écran Méthodes indique toujours la
   méthode active, les angles, les corrections et si le profil est certifié localement (aucun ne
   l'est : voir [`CALCUL.md`](CALCUL.md#6-le-cas-du-maroc)).
4. **Adhan** — activer/désactiver chaque prière, choisir un son, régler un pré-rappel, la vibration.
   Un Adhan complet sous licence CC0 (« Beautiful adhan », Wikimedia Commons) est inclus et
   sélectionné par défaut pour les cinq prières, sans aucun import. Trois carillons synthétisés
   restent jouables ; les huit enregistrements fournis (licence non établie) sont catalogués dans
   l'écran mais marqués « non inclus » et ne peuvent pas être choisis.
5. **Diagnostic** — vérifier ce qui est réellement armé avant de compter dessus.

### Importer son propre son

Écran **Adhan** → « Importer un fichier audio ». Le fichier est stocké en IndexedDB, sur l'appareil,
et n'est jamais envoyé. Il doit être au format lisible par le navigateur (WAV/MP3/OGG/M4A selon le
moteur). Un bouton de pré-écoute permet de vérifier avant de l'assigner.

Limite à connaître : dans la version Android, le son importé est copié dans le stockage privé de
l'application pour que le lecteur natif puisse le lire. Si la copie échoue (format refusé, fichier
illisible), l'alarme affiche une notification sans audio et le diagnostic l'indique. Cette copie
n'a pas été vérifiée sur appareil dans cet environnement.

---

## 8. Vérifier les alarmes

### Dans le navigateur (mode `web-foreground`)

1. Autoriser les notifications quand le navigateur le demande.
2. Écran **Adhan** → « Tester maintenant » : le son choisi est joué immédiatement.
3. Le diagnostic doit afficher « Onglet ouvert uniquement » et une bannière d'avertissement. Il ne
   doit **jamais** afficher une coche verte de type « alarme système ».

Le mode test est indépendant du planning réel : il ne consomme pas de clé d'événement et ne bloque
aucune prière.

### Sur Android (non exécuté ici)

```bash
npm run build
cd android
gradle wrapper --gradle-version 8.9   # une seule fois
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Puis dans l'application : **Diagnostic → Diagnostic Android natif**, et suivre la checklist de
recette de [`ANDROID.md`](ANDROID.md#11-checklist-de-recette-sur-appareil-non-exécutée). Aucune de
ces étapes n'a été exécutée dans cet environnement.

---

## 9. Dépannage

| Symptôme | Cause | Solution |
| --- | --- | --- |
| Le service worker ne s'active pas | origine non sécurisée (`http://` sur une IP) | utiliser `localhost` ou HTTPS |
| Une heure semble décalée d'une heure | le fuseau de l'OS est faux (Windows/Chromium, Maroc) | vérifier la ligne « Données de fuseau » du diagnostic ; la table embarquée corrige |
| Les rappels ne sonnent pas en web | onglet fermé ou arrière-plan | comportement normal et documenté ; utiliser la version Android |
| « Autorisation refusée » dans le diagnostic | notifications bloquées pour l'origine | rouvrir les réglages de site du navigateur |
| Le build échoue sur `tsc` | erreur de type réelle | `npm run typecheck` pour le détail |
| L'APK s'installe sur un écran blanc | `dist/` absent au moment du build Gradle | lancer `npm run build` d'abord ; Gradle échoue désormais explicitement |
| Une prière n'a pas sonné | événement manqué de plus de 120 s | l'état affiche « Manquée — jamais jouée » ; l'application ne rejoue jamais en retard |

---

## 10. Réinitialiser

**Réglages → Confidentialité → Tout effacer** supprime réglages, journal, registre de livraison,
sons importés (IndexedDB et copie native) et revient à l'onboarding. Le cache du service worker ne
contient que les fichiers de l'application et n'est pas une donnée personnelle ; « Clear site data »
le vide aussi.

Équivalent manuel dans le navigateur : DevTools → Application → Clear site data.

Sur Android, désinstaller l'application supprime aussi `SharedPreferences` (aucune sauvegarde :
`allowBackup="false"`).
