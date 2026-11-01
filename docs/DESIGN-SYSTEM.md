# Design system — Azan Global (« AZAN GLOBAL — SERENITY & CLARITY »)

## 1. Intention

L'interface doit ressembler à un **objet calme et précis**, pas à une application de contenu. Trois
règles ont guidé chaque écran :

1. **Une seule information forte par écran.** L'accueil met la prochaine prière au centre ; le reste
   est secondaire et lisible d'un coup d'œil.
2. **La couleur a un sens.** Vert = action et identité. Or = repère temporel. Rouge/ambre = problème
   réel. Aucune pastille verte ne décore : elle affirme un état vérifié.
3. **Aucune donnée factice.** Pas de « Hassan Mosque », pas de température, pas de compte à rebours
   inventé. Si une valeur n'est pas connue, l'écran affiche « — » ou explique pourquoi.

## 2. Typographie

Polices **auto-hébergées** sous `public/fonts/` (licence SIL Open Font License 1.1, fichiers
`public/fonts/licenses/`). Aucun CDN obligatoire ; la PWA et le WebView Android utilisent les mêmes
ressources.

- **Tajawal** (arabe) — graisses 400 / 500 / 700, ~9 Ko chacune (arabic subset, WOFF2).
- **IBM Plex Sans** (latin, variable 100–700) — ~45,7 Ko (latin subset, WOFF2), pour le français,
  l'anglais et les chiffres tabulaires.
- Total polices : ~73 Ko.

Justification du choix : Tajawal a été comparé à IBM Plex Sans Arabic et Noto Sans Arabic. Tajawal
offre la meilleure lisibilité pour les horaires (chiffres alignés, courbes sobres) et la cohérence avec
la direction « sérénité ». IBM Plex Sans est la famille latine assortie (même hauteur d'x, mêmes
proportions) et fournit les chiffres tabulaires (`tnum`/`lnum`) pour tous les horloges. Graisses
utilisées : 400 (corps), 500 (libellés, champs), 600 (boutons, en-têtes de ligne), 700 (titres).

`font-feature-settings: "tnum" 1, "lnum" 1` et `font-variant-numeric: tabular-nums lining-nums` sur
toutes les heures et comptes à rebours, pour éviter le tremblement pendant la mise à jour de la seconde.

Échelle typographique (jetons) :

| Jeton | Valeur | Usage |
| --- | --- | --- |
| `--text-2xs` | 0,6875 rem (11 px) | eyebrow uniquement |
| `--text-xs` | 0,75 rem (12 px) | métadonnées, journal |
| `--text-sm` | 0,8125 rem (13 px) | aides, pastilles |
| `--text-md` | 0,875 rem (14 px) | corps secondaire |
| `--text-body` | 1 rem (16 px) | corps |
| `--text-lg` | 1,125 rem (18 px) | heures, `h3` |
| `--text-xl` | clamp(1,25–1,5 rem) | titre d'écran (`h1`) |
| `--text-2xl` | clamp(1,5–1,9 rem) | titres de section majeurs |
| `--text-display` | clamp(2–2,85 rem) | nom de la prochaine prière dans le héros |
| `--text-countdown` | clamp(1,5–2,15 rem) | compte à rebours |

Interlignes : `--leading-tight` 1,22 (titres), `--leading-body` 1,6 (latin), `--leading-arabic` 1,8
(arabe, via `:root[lang="ar"]`). Titres : `letter-spacing: -0,015 em`, graisse 700.

La pile latine est `IBM Plex Sans` puis repli système ; la pile arabe est `Tajawal` puis `IBM Plex
Sans` puis replis. En arabe, `--font: var(--font-arabic)` et l'interligne passe à 1,75 via
`:root[lang="ar"]`.

## 3. Palette

### Primitives

- Emerald : `#072019` … `#f1f8f4` (échelle 950→50).
- Gold : `#7a5a17` … `#f5ecd8`.
- Ink : `#17221d`, `#59665f`, `#66746c`, `#8c9a92`.
- Line : `#dce4de`, `#c7d5cc`.

### Sémantique (clair)

| Jeton | Valeur | Usage |
| --- | --- | --- |
| `--bg` | `#f7f8f4` | fond de page |
| `--surface` | `#ffffff` | cartes |
| `--surface-2` | `#f1f4ee` | survols, champs |
| `--surface-3` | `#e7f2ec` | fonds d'accent doux |
| `--text` | `#17221d` | texte principal |
| `--text-muted` | `#59665f` | texte secondaire |
| `--text-subtle` | `#66746c` | indices |
| `--primary` | `#0f5e46` | Deep Emerald |
| `--primary-hover` | `#0b4938` | |
| `--primary-active` | `#083c2e` | |
| `--primary-soft` | `#e7f2ec` | |
| `--accent` | `#c7a45d` | Imperial Gold |
| `--accent-strong` | `#7a5a17` | or pour texte sur fond clair |
| `--border` | `#dce4de` | |
| `--focus` / `--ring` | `#0f5e46` / `rgba(15,94,70,0,28)` | focus visible |
| `--ok` / `--ok-soft` | `#146b45` / `#e0f2e8` | succès vérifié |
| `--warn` / `--warn-soft` | `#7a5710` / `#fbf0d4` | avertissement |
| `--danger` / `--danger-soft` | `#a23427` / `#f9e5e1` | erreur |
| `--info` / `--info-soft` | `#1e5b76` / `#e4f0f6` | information |

### Sémantique (sombre) — palette propre, pas une inversion

| Jeton | Valeur |
| --- | --- |
| `--bg` | `#0c1512` |
| `--surface` | `#14211b` |
| `--surface-2` | `#1a2a23` |
| `--surface-3` | `#20362b` |
| `--text` | `#f3f7f3` |
| `--text-muted` | `#b7c3ba` |
| `--text-subtle` | `#93a79c` |
| `--primary` | `#5fc3a2` |
| `--primary-hover` | `#7bd5b6` |
| `--primary-active` | `#4bb392` |
| `--primary-soft` | `#16382c` |
| `--accent` | `#d9b978` |
| `--accent-strong` | `#ebd3a2` |
| `--border` | `#2a3b33` |
| `--border-strong` | `#3a5146` |
| `--focus` / `--ring` | `#7bd5b6` / `rgba(95,195,162,0,38)` |
| `--ok` / `--warn` / `--danger` / `--info` | `#7ed0a8` / `#e6c06b` / `#f09b90` / `#93cbe8` |

### Héros (îlot vert profond, identique dans les deux thèmes)

`--hero-bg` = radial doré (coin supérieur droit) + radial vert profond + dégradé linéaire
`#0b4938 → #0f5e46 → #10624a`. Texte `#f5fbf8`, muet `#c6e2d7`, accent `#e4cb93`.

### Illustrations

`--illus-line` (clair `#0f5e46`, sombre `#7bd5b6`), `--illus-gold` (`#c7a45d` / `#d9b978`),
`--illus-opacity` 0,16. Motif de fond : `--pattern-opacity` 0,055 (clair) / 0,075 (sombre) et
`--pattern-size` 156 px, appliqués à la tuile zellige utilisée comme masque CSS.

### Contrastes mesurés (WCAG 2.2)

Clair :

| Couple | Ratio |
| --- | --- |
| texte / fond | 15,35:1 |
| muet / fond | 5,64:1 |
| muet / carte | 6,02:1 |
| primaire / fond | 7,27:1 |
| primaire / carte | 7,75:1 |
| blanc / primaire | 7,75:1 |
| blanc / primaire survol | 10,37:1 |
| primaire / emerald soft | 6,76:1 |
| muet / emerald soft | 5,25:1 |
| danger / blanc | 6,35:1 |
| warn / blanc | 5,37:1 |
| ok / blanc | 5,33:1 |
| or profond / blanc | 6,36:1 |
| or clair / primaire | 4,89:1 |
| or / blanc | 2,36:1 (décoratif uniquement) |

Sombre :

| Couple | Ratio |
| --- | --- |
| texte / fond | 17,15:1 |
| muet / fond | 10,19:1 |
| muet / surface | 9,13:1 |
| primaire / fond | 8,67:1 |
| primaire / surface | 7,77:1 |
| encre sur primaire | 8,85:1 |
| danger / fond | 8,66:1 |
| warn / fond | 10,71:1 |
| ok / fond | 10,14:1 |

L'or (`#c7a45d`) ne passe pas 4,5:1 sur blanc : il est donc **accent décoratif** uniquement. Pour un
texte doré, utiliser `--accent-strong` (`#7a5a17`, 6,36:1) en clair et `--accent-strong` (`#ebd3a2`)
en sombre. Les états sont toujours exprimés par la couleur **et** un glyphe ou un libellé.

## 4. Espacement, rayons, ombres

- Échelle 4 px : 4, 8, 12, 16, 20, 24, 32, 40, 48 (`--space-1` à `--space-9`).
- Rayons : 8 (petits contrôles), 12 (boutons/champs), 16 (cartes), 22 (feuilles), 28 (modales), 999
  (pastilles).
- Cible tactile minimale : 44 × 44 px (`--touch`), y compris les boutons `.sm`.
- Trois niveaux d'élévation : `--shadow-1` (repos/survols), `--shadow-2` (héros, toasts),
  `--shadow-3` (feuilles modales). Chaque niveau a sa variante sombre.
- Largeur maximale de contenu : 760 px (`--maxw`), 1040 px (`--maxw-wide`) ≥ 900 px.
- Hauteur de navigation : 72 px (`--nav-h`).

## 5. Composants

Construction par `el()` (`src/app/ui.ts`) : `textContent` pour le texte, attributs ARIA explicites,
aucun `innerHTML` pour une valeur utilisateur. Les constantes SVG (icônes) utilisent `innerHTML` car
elles sont des constantes du projet.

| Composant | Classe | États |
| --- | --- | --- |
| Bouton | `.btn` + `.primary`, `.secondary`, `.ghost`, `.danger`, `.sm`, `.block` | repos, survol (élévation), actif, focus, désactivé |
| Pastille | `.pill` + `.ok`, `.warn`, `.bad`, `.muted`, `.on-hero`, `.accent` | glyphe optionnel |
| Carte | `.card`, `.card.tight`, `.card-head` | |
| Ligne de prière | `.prayer-row` + `.is-next`, `.is-current`, `.is-past`, `.is-sunrise` | sélectionnée (aplat + marque logique `::after`), courante, passée, lever (contexte) |
| Bandeau | `alertBox(level, title, body)` | info, warn, bad |
| Champ | `.field` (`label`, `input`, `.hint`, `.field-error`) | survol, focus (halo), erreur (texte + bordure) |
| Segmenté | `.segmented button[aria-pressed]` | sélectionné |
| Interrupteur | `.switch input[checked]` | glissement |
| Calendrier | `.cal-cell` | survol, pression (primaire), aujourd'hui (liseré or) |
| Feuille | `.sheet-backdrop`, `.sheet` | Échap, clic extérieur, piège de focus, restauration du focus |
| Dialogue | `confirmDialog(...)` | modale accessible, retourne une promesse |
| Toast | `.toast` | `role="status"`, `aria-live="polite"` |
| Navigation | `.bottom-nav` / latérale ≥ 900 px | `aria-current="page"` |
| État vide | `emptyState({ art, title, body, action })` | illustration + action optionnelle |
| Bandeau statut | `.status-strip` | icône + texte + action |
| Accès rapide | `.quick-action` | icône + libellé + chevron |
| Compteur Tasbih | `.tasbih-tap`, `.tasbih-count`, `.tasbih-target`, `.tasbih-progress` | repos, survol, pression, focus clavier, objectif atteint |
| Puce de dhikr | `.tasbih-chip[aria-pressed]` | sélectionnée, favorite (étoile) |
| Session Tasbih | `.tasbih-session-active`, `.tasbih-template`, `.tasbih-step-row` | active, terminée, éditable |
| Ligne de ville | `.city-option` | proposée (GPS), sélectionnée |

### 5.1 Tasbih : un seul grand bouton

- Le compteur est un **vrai `<button>`** (pas un `div` avec `role="button"`), donc Espace et Entrée
  fonctionnent nativement et le focus reste stable : incrémenter ne reconstruit que les nœuds
  modifiés, jamais tout l'écran.
- Cible tactile `min-height: clamp(190px, 42vw, 260px)`, chiffre `clamp(3.4rem, … 5.6rem)` en
  `--font-numeric` tabulaire : la valeur ne « danse » pas quand elle change de largeur.
- Le doré reste un accent de progression (`.tasbih-progress-fill`), jamais une couleur de texte.
- Aucun retour haptique simulé : si `navigator.vibrate` manque ou refuse, l'écran l'écrit.
- Aucun classement, aucune série, aucune flamme : l'historique est une liste locale neutre.

**Traitement du héros** (accueil) : fond `--hero-bg`, reflet interne de 1 px, ombre `--shadow-2` ;
signature dorée de 1 px en haut (`.hero::after`). Nom de la prière `--text-display`, heure
`--text-lg`, étiquette « prochaine prière » dorée avec `letter-spacing` 0,08 em.

**Illustration du héros** : `.hero-art` (zellige, opacité `--illus-opacity`), positionnée en
absolu, `aria-hidden`, jamais derrière le texte (z-index 0, contenu z-index 1).

## 6. Illustrations

Module `src/app/illustrations.ts` : `arch`, `zellige`, `night`, `mosque`, `compass`, `calendar`,
`sound`, `shield`. SVG originaux, dépendance zéro, construits par `document.createElementNS` et
`innerHTML` uniquement pour du markup constant. Couleurs via `currentColor` et classes `.illus-line` /
`.illus-gold`, donc même asset dans les deux thèmes.

Règles :
- couches décoratives `aria-hidden`, `pointer-events: none` ;
- jamais derrière les horaires ni le corps de texte ;
- **motif de fond** : `.ambient` est un div vide inséré une seule fois derrière `#app` ; la tuile
  originale `public/patterns/zellige.svg` (étoile à huit branches + losanges, 120 × 120) est utilisée
  comme `mask-image` CSS. La couleur visible vient de `--illus-line`, donc un seul fichier suit les
  deux thèmes. Toutes les routes en bénéficient, opacité `--pattern-opacity` (0,055 clair / 0,075
  sombre), taille `--pattern-size` 156 px, dérive très lente de 240 s désactivée par
  `prefers-reduced-motion` ;
- **aucune image stockée, aucun filigrane, aucune ressource distante** : le motif a été dessiné pour
  le projet, il ne dérive d'aucune banque d'images (la référence Dreamstime fournie en exemple n'est
  pas utilisée).

## 7. RTL : propriétés logiques uniquement

Aucune règle `[dir="rtl"] .something { margin-left: … }`. Le CSS n'utilise que `margin-inline`,
`padding-inline`, `inset-inline`, `border-inline`, `text-align: start/end`. Les icônes directionnelles
portent `.icon-directional` qui applique `transform: scaleX(-1)` en RTL.

Points vérifiés dans le navigateur (clair/sombre, fr/en/ar, mobile/desktop) :
- `dir="rtl"` sur `<html>`, `lang="ar"` ;
- navigation, en-tête et cartes miroir corrects ;
- heures en chiffres latins (cohérents avec les calendriers locaux) ;
- libellés ARIA traduits.

## 8. Thème

`data-theme="light|dark"` toujours résolu en JS : le mode `auto` utilise `matchMedia`. Script inline
dans `index.html` pour éviter le flash au premier rendu. `meta[name=theme-color]` mis à jour.
Écoute de `matchMedia('prefers-color-scheme: dark')` pour réagir au changement système en mode auto.

## 9. Accessibilité (WCAG 2.2 AA visée)

- Skip link trilingue en première position, visible au focus.
- Focus visible : `outline: 3px solid var(--focus); outline-offset: 2px`.
- Cibles tactiles ≥ 44 px.
- Sémantique : un seul `h1` par écran, `h2` pour les cartes, `nav` avec `aria-label`,
  `role="status"` + `aria-live="polite"` pour le toast, `role="log"` pour le journal.
- Calendrier : pas de faux `role="grid"`. Jours = `<button>` avec `aria-pressed`,
  `aria-current="date"` pour aujourd'hui, `aria-label` localisé complet.
- Contrastes : voir tableau §3 (tous les couples texte/fond ≥ 4,5:1, grands textes ≥ 3:1).
- Mouvement : `@media (prefers-reduced-motion: reduce)` neutralise les animations.
- `forced-colors: active` : bordures explicites sur les composants.
- Texte jusqu'à 200 % : unités `rem`, pas de hauteur fixe sur les conteneurs de texte.

## 10. Icônes

Jeu SVG interne (`src/app/ui.ts`, dictionnaire `PATHS`), tracé 24×24, `stroke` hérité de
`currentColor`, taille 18–22 px. Aucune bibliothèque, aucun sprite réseau. Icônes purement
décoratives : `aria-hidden="true"`.

## 11. Mouvement

Trois durées et une courbe : `--dur-1` (120 ms), `--dur-2` (180 ms), `--dur-3` (260 ms),
`--ease-out` (`cubic-bezier(0.22, 1, 0.36, 1)`), `--ease-standard`.

- Entrée d'écran : `fade var(--dur-3)`.
- Survols : élévation légère + `--shadow-1`.
- Feuilles : translation + fondu, fermables par Échap et clic sur le fond, piège de focus.
- Aucune animation en boucle, aucun parallaxe, aucun son d'interface.
- `prefers-reduced-motion: reduce` neutralise le tout.

## 12. Ce que le design refuse

- Une sixième ligne « lever du soleil » présentée comme un Adhan.
- Une coche verte sur une alarme web non système.
- Un « prochain Adhan » calculé sur une position approximative non signalée.
- Un thème « spirituel » chargé (motifs, calligraphies) au détriment de la lisibilité des heures.
- L'or comme couleur de texte (contraste insuffisant).
- Les états exprimés par la couleur seule.
- Un compteur de dhikr qui culpabilise : pas de série à ne pas briser, pas de classement public, pas
  de « vous avez manqué hier ».
- Une référence religieuse inventée ou une récompense chiffrée non sourcée : un dhikr intégré cite
  sa source, un dhikr personnel peut n'en avoir aucune et l'écran l'assume.
- Un retour haptique simulé par une animation quand le matériel ne vibre pas.

## 13. Bundle et performances

Référence avant refonte : JS 376,26 Ko / 115,58 Ko gzip ; CSS 23,83 Ko / 5,57 Ko gzip.
Après refonte (build du 2026-10-29) : JS **529,73 Ko / 158,98 Ko gzip** ; CSS **45,05 Ko /
9,18 Ko gzip** ; `sw.js` 5,28 Ko ; `index.html` 3,86 Ko / 1,66 Ko gzip. 20 entrées précachées.
Polices : 4 fichiers, 72,6 Ko. Un seul MP3 est précaché et embarqué : l'Adhan CC0
(`audio/adhan/adhan-cc0.mp3`, 1,78 Mo) ; les trois carillons WAV restent disponibles et les huit
enregistrements fournis ne sont pas livrés.

Le JS contient `cities-core.json` (311 Kio : 1 696 villes mondiales + 300 localités marocaines) et
le code applicatif. Le reste du catalogue marocain n'est plus dans le bundle : `index.json` (2,2 Mio,
~763 Kio gzip) est chargé au premier usage de la recherche et les fichiers `ma-XX.json` à la demande.
La recherche hors ligne immédiate reste garantie pour les 1 996 entrées embarquées ; les autres
deviennent disponibles hors ligne après consultation ou téléchargement explicite (voir
`LIMITES.md` §12).

## 14. Limites

- Compilation Android / APK non vérifiée (aucun JDK, Android SDK, Gradle).
- Vérification hors ligne réelle via localhost impossible dans cet environnement (502) ; testée
  via `http://192.168.1.102:4173` et inspection du `sw.js` généré.
- Aucun commit possible (`git` indisponible).
- Les captures réelles sont produites mais non lisibles par ce modèle (pas d'input image) ; à
  joindre manuellement au rapport.
