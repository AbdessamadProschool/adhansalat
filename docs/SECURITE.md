# Sécurité — audit du 29 octobre 2026

Ce document consigne un audit **manuel** du projet local, conduit en appliquant les catégories de
compétences de [Strix](https://github.com/usestrix/strix/blob/main/strix/skills/README.md)
(`source_aware_sast`, `dependency_cve_scanning`, `browser_security`, `npx_confusion`, revue
spécifique Android/WebView). **Strix n'a pas été exécuté** : ni Docker, ni CLI `strix`, ni clé LLM
n'étaient disponibles dans cet environnement. Aucun scan automatique n'est donc revendiqué, et ce
document ne remplace ni un pentest, ni un audit Android sur appareil.

## 1. Périmètre

| Élément | Version / état |
| --- | --- |
| Build web | `dist/` produit par Vite 7.3.7, TypeScript 5.9.3, Node 24.19 |
| Tests | Vitest 4.1.12 — 10 fichiers, 185 tests |
| Navigateur | Chromium 152 via le harnais OpenCode, `vite preview` sur `http://localhost:4173` |
| Android | sources Kotlin/XML uniquement — **aucun APK compilé** (ni JDK, ni SDK, ni Gradle) |
| Dépendances | 105 paquets, tous depuis `registry.npmjs.org` |

Hors périmètre, faute de moyens : appareil Android réel, lecture audio native, hébergeur de
production, comptes Play Console, Strix/Trivy/Semgrep.

## 2. Synthèse

| ID | Sévérité | Constat | État |
| --- | --- | --- | --- |
| S-01 | Élevée (dev) | 6 vulnérabilités connues dans `vite`/`vitest`/`esbuild`/`tinypool` | **Corrigé** — `npm audit` : 0 |
| S-02 | Moyenne | `script-src 'unsafe-inline'` annulait la protection CSP contre une injection HTML | **Corrigé** — hash du script inline + garde-fou de build |
| S-03 | Moyenne (fonctionnel) | Aucun `media-src` : les enregistrements importés (`blob:`) étaient bloqués par la CSP | **Corrigé** — `media-src 'self' blob:` vérifié en navigateur |
| S-04 | Faible | Le cache du service worker conservait indéfiniment les bundles des builds précédentes | **Corrigé** — purge à l'activation + test |
| S-05 | Faible | `SchedulePayload.parse` acceptait un tableau d'alarmes et des chaînes sans borne | **Corrigé** dans les sources (non compilé) |
| S-06 | Moyenne (déploiement) | `vite preview` n'envoie aucun en-tête de sécurité | **À faire côté hébergeur** — §6 |
| S-07 | Faible | `style-src 'unsafe-inline'` reste nécessaire aux styles dynamiques | **Accepté** — voir §7 |
| S-08 | Faible | Une meta CSP ne peut pas imposer `frame-ancestors` ni HSTS | **À faire côté hébergeur** — §6 |
| S-09 | Faible | La mise à jour du service worker attend la fermeture des onglets | **Accepté** — comportement voulu, §7 |

Aucune vulnérabilité **haute ou critique exploitable** n'est restée ouverte dans le périmètre testé.

## 3. Chaîne de dépendances (S-01)

État initial : `npm audit` signalait 6 avis (path traversal Vite, lecture de fichier via
`@vitest/mocker`, injection de code Vitest, `esbuild` sous Windows, `tinypool`, `vite-node`).

Remédiation appliquée :

```bash
npm install --save-dev vite@7.3.7 vitest@4.1.12
npm audit fix          # esbuild 0.28.2
npm audit              # found 0 vulnerabilities
```

Vérifications : `tsc --noEmit` 0 erreur, `vitest run` 185/185, `npm run build` OK avec
`vite 7.3.7` / `esbuild 0.28.2`. `package.json` et `package-lock.json` sont à jour ; le lockfile ne
référence que `registry.npmjs.org` (pas de dépendance git, pas de tarball tiers).

Point d'attention : la politique `allow-scripts` de npm n'approuve pas le `postinstall` d'esbuild.
Le build fonctionne malgré tout (le binaire est déjà présent) ; sur une machine neuve, il faut
approuver ce script explicitement ou installer avec un registre de confiance. Ne pas désactiver
`allow-scripts` globalement pour autant.

## 4. Application web

### 4.1 XSS et manipulation du stockage

- **Aucun sink HTML** avec donnée utilisateur : `innerHTML` n'existe que dans `ui.ts` et
  `illustrations.ts`, avec du balisage constant. Tous les textes (nom de ville, nom d'audio importé,
  entrées de journal, dhikr personnalisé) passent par `textContent` / `setAttribute` avec des
  valeurs contraintes.
- **Test dynamique** : injection de `<img src=x onerror=...>` dans `azan.settings.v1` (nom d'audio,
  `cityName`, entrée de journal), puis navigation sur Accueil, Sons et Diagnostics. Résultat : texte
  rendu littéralement, `document.querySelectorAll('img[src="x"]')` = 0, aucun `window.__xss*`.
- **Pollution de prototype** : `__proto__` et `constructor.prototype` injectés dans les réglages ;
  après rechargement, `({}).polluted` reste `undefined` et l'app démarre normalement.
- **CSP** : le script inline de thème est désormais autorisé **par hash**, pas par
  `'unsafe-inline'`. Test en navigateur : un `<script>` injecté à l'exécution est bloqué
  (violation `script-src`), tandis que le bootstrap de thème s'exécute sans erreur.
- **Réseau** : `connect-src 'self'` et `img-src 'self' data:` bloquent les requêtes externes
  (vérifié : `fetch` vers `example.com` refusé, image externe bloquée). Aucune requête tierce
  observée pendant le parcours.
- Seule la géolocalisation et les notifications sont demandées, à la demande, avec explication.

### 4.2 CSP livrée

```
default-src 'self';
script-src 'self' 'sha256-4b+Hz0GJYy9+1eLW6XoDXcOD1AZXNfcODnwX/bFfPcU=';
style-src 'self' 'unsafe-inline';
font-src 'self';
img-src 'self' data:;
media-src 'self' blob:;
connect-src 'self';
worker-src 'self';
manifest-src 'self';
object-src 'none';
frame-src 'none';
form-action 'none';
base-uri 'none'
```

Le hash est recalculé par `scripts/check-csp.mjs` (exécuté par `npm run build` et par
`tests/csp.test.ts`), puis **revérifié sur `dist/index.html`** après le build : si le HTML livré
diffère de la source, le build échoue. Modifier le script inline sans mettre le hash à jour fait
donc **échouer** le build au lieu de produire une page au thème figé.

### 4.3 Import audio et `blob:` (S-03)

Les enregistrements importés sont stockés en IndexedDB puis joués via `URL.createObjectURL`. Sans
`media-src`, la directive `default-src 'self'` s'appliquait aux médias et refusait `blob:`. La
politique autorise maintenant `media-src 'self' blob:` ; vérifié en navigateur : un WAV converti en
`Blob`, joué via `blob:`, émet `playing` (durée 3,64 s), sans violation CSP.

### 4.4 Service worker (S-04, S-09)

- Précache limité à la coquille, aux polices, aux icônes, au catalogue léger et aux quatre audios
  livrés (20 entrées).
- À l'activation, les caches d'anciennes versions sont supprimés **et** les bundles `/assets/`
  absents du manifeste courant sont purgés. Vérifié : cache passé de 26 à 23 entrées, seuls
  `index-DbeNbxN-.js` et `index-BbZ4wvOm.css` conservés ; les fichiers `/data/cities/` déjà
  téléchargés survivent.
- Le worker ne prend pas la main de force : il attend la fermeture des onglets
  (`SKIP_WAITING` reste honoré). C'est volontaire pour ne pas supprimer un asset encore utilisé par
  un onglet ouvert ; la contrepartie est qu'une mise à jour peut attendre. Ce comportement est
  documenté, pas un défaut de sécurité.
- Les navigations sont réseau d'abord avec repli sur la coquille ; une réponse 502 de portail captif
  ne remplace jamais l'app. Aucun `eval`, aucune donnée sensible en cache.

### 4.5 En-têtes de production (S-06, S-08)

`vite preview` ne sert que `content-type`/`etag`/`cache-control`. En production, l'hébergeur doit
ajouter (la meta CSP reste utile en défense en profondeur, mais ne peut pas tout exprimer) :

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'sha256-4b+Hz0GJYy9+1eLW6XoDXcOD1AZXNfcODnwX/bFfPcU='; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'none'; base-uri 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Permissions-Policy: geolocation=(self), notifications=(self), camera=(), microphone=(), payment=()
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

`frame-ancestors 'none'` remplace l'absence de protection anti-clickjacking de la meta. Servir le
site uniquement en HTTPS (le service worker et la géolocalisation l'exigent de toute façon).

## 5. Android / WebView

Revue statique des sources (aucune compilation possible ici).

- **Manifeste** : pas de permission `INTERNET` ; `allowBackup=false` ; seul `MainActivity` est
  exportée (launcher) ; receivers/services `exported=false` ; permissions limitées aux alarmes
  exactes, boot, notifications et foreground service.
- **WebView** : origine synthétique `https://appassets.androidplatform.net/`,
  `allowFileAccess=false`, contenu mixte bloqué, debugging WebView activé uniquement en build debug,
  navigation hors origine ouverte dans le navigateur système, `onReceivedSslError` n'est pas
  contourné (comportement par défaut : annulation).
- **Pont JS** : `AzanNative` n'expose que des méthodes typées (planification, permissions,
  diagnostics, import audio) ; aucune réflexion, aucun chargement d'URL arbitraire.
- **Assets** : `WebAssetHandler` mappe `assets/web/<path>` et refuse les chemins contenant `..` ;
  un chemin sans extension ne tombe sur `index.html` que s'il n'existe pas comme asset.
- **Alarmes** : `PendingIntent` tous `FLAG_IMMUTABLE`, un par `eventKey`, data URI propre à l'app ;
  livraison au plus une fois via un registre persistant ; un événement en retard de plus de deux
  minutes est marqué manqué, jamais joué tard.
- **S-05 (corrigé)** : `SchedulePayload.parse` borne désormais le payload (400 alarmes maximum,
  champs à 64 caractères, locale à 16) et ignore un `soundId` surdimensionné au lieu de le tronquer.
  Objectif : empêcher un document malformé de bloquer un `BroadcastReceiver` sur un `commit()`
  synchrone. **Ce correctif n'a pas été compilé** — à vérifier au premier build Android.
- **Signature** : mots de passe de keystore attendus par variables d'environnement
  (`AZAN_STORE_PASSWORD`, `AZAN_KEY_PASSWORD`), aucun secret dans le dépôt. Aucun `.jks`, `.env`,
  `local.properties` ni `google-services.json` présent.

## 6. Ce qui n'a pas été testé

- Exécution réelle de Strix (Docker/CLI/clé LLM absents) ; aucun rapport d'outil à l'appui.
- Compilation APK/AAB, installation, permissions à l'exécution, alarmes réelles, redémarrage,
  changement de fuseau sur appareil.
- Lecture native de `R.raw.adhan_cc0` et qualité audio perçue (aucune sortie audio ici).
- En-têtes de l'hébergeur de production (aucun hébergeur configuré dans ce dépôt).
- Tests de charge, de robustesse réseau longue durée, et compatibilité multi-navigateurs.

## 7. Risques résiduels acceptés

1. **`style-src 'unsafe-inline'`** : l'interface pose des attributs `style` dynamiques. Une injection
   CSS reste possible si un sink apparaissait, mais elle n'exécute pas de script ; la supprimer
   demanderait de convertir tous les styles inline en classes. Risque faible, à réévaluer si un
   rendu HTML dynamique est ajouté.
2. **CSP en meta** : elle protège la page, mais pas contre l'inclusion dans une iframe ni le
   transport ; d'où les en-têtes du §4.5.
3. **Mise à jour du service worker** : pas d'invite « nouvelle version disponible » ; un onglet
   laissé ouvert peut continuer à exécuter l'ancienne build. Sans impact de sécurité démontré
   (aucune faille connue dans les builds précédentes), mais à traiter si une version doit être
   retirée d'urgence.
4. **Pas de SRI** : les bundles sont auto-hébergés et servis par le même origin ; l'intégrité repose
   sur HTTPS et le cache du worker, pas sur `integrity=`.
5. **Android non compilé** : tous les constats Kotlin sont statiques ; le correctif S-05 et les
   chemins d'alarme doivent être revalidés sur appareil.

## 8. Reproductibilité

```bash
npm ci
npm audit                 # attendu : 0 vulnérabilité
npx tsc --noEmit          # attendu : 0 erreur
npx vitest run            # attendu : 10 fichiers, 185 tests
node scripts/check-csp.mjs
npm run build
node scripts/check-csp.mjs dist/index.html
npm run preview           # puis vérifier la console, la CSP et le cache
```

Contrôles navigateur effectués le 2026-10-29 : aucune erreur console au chargement, script inline
injecté bloqué, `blob:` audio joué, aucune requête externe, 23 entrées de cache après activation,
`document.documentElement.dataset.azanReady === "true"`.

## 9. Priorités avant publication

1. Compiler l'APK, l'installer et vérifier alarmes, redémarrage, changement de fuseau et lecture
   native (bloquant).
2. Configurer les en-têtes du §4.5 sur l'hébergeur HTTPS (bloquant pour le web public).
3. Rejouer `npm audit` et les 185 tests sur la machine de release (bloquant).
4. Revalider le correctif S-05 et le mapping `adhan-cc0` au premier build Android (bloquant).
5. Facultatif : invite de mise à jour du service worker, suppression progressive des styles inline.
