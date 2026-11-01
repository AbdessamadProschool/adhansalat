# Étude technique — Android natif, Flutter ou PWA

## 1. Le besoin réel, ramené à ses contraintes

Un calculateur de prières affiche des heures ; ce n'est pas le problème difficile. Le problème
difficile est **de faire sonner l'Adhan à l'heure, même quand l'application est fermée**, avec :

1. une alarme qui réveille l'appareil (écran verrouillé, mode Doze, application tuée) ;
2. aucun doublon (une prière = un son, même après redémarrage ou changement de lieu) ;
3. aucun son périmé (un Fajr joué à 09:00 est un bug, pas un rattrapage) ;
4. un calcul astronomique exact et vérifiable, indépendant réseau ;
5. une interface arabe RTL, française et anglaise, sans dépendance à un service en ligne ;
6. un coût de maintenance compatible avec un projet tenu par une seule personne.

Toute la comparaison qui suit se fait sur ces six points, pas sur des préférences de framework.

---

## 2. Les trois candidats

### A. Android natif (Kotlin + Compose)

**Points forts**

- `AlarmManager.setAlarmClock()` est la seule API qui garantit une livraison à l'heure exacte,
  exempte de Doze, avec réveil de l'écran et icône d'alarme. C'est exactement le besoin.
- Service de premier plan `mediaPlayback` pour un Adhan de plusieurs minutes, contrôlable depuis la
  notification, avec focus audio.
- `BOOT_COMPLETED`, `TIME_SET`, `TIMEZONE_CHANGED` permettent de réarmer après redémarrage.
- Zéro coût d'exécution : pas de WebView, pas de bundle à parser, démarrage rapide.
- Écosystème de test mature (JUnit, Robolectric) — mais rien de tout cela n'est disponible dans
  l'environnement de ce dépôt.

**Points faibles**

- Trois langues × une interface riche = beaucoup de code d'UI à écrire et à maintenir.
- Chaque écran doit être réimplémenté, y compris le calendrier et la recherche de villes.
- Impossible de publier une version web réutilisant le même travail.
- L'environnement de développement exige JDK + SDK Android + Gradle (absents ici).

### B. Flutter

**Points forts**

- Un seul code source pour Android et iOS, RTL correct, `intl` pour les dates.
- `flutter_local_notifications` + plugins d'alarmes donnent accès à `AlarmManager`.
- Bonne densité de composants pour une UI custom.

**Points faibles**

- Le plugin d'alarme exacte le plus courant (`android_alarm_manager_plus`) ne fournit **pas** la
  sémantique `setAlarmClock` : il faut un canal de plateforme vers du Kotlin. Une partie du travail
  natif reste donc inévitable.
- La couche Dart ajoute un runtime et un pont de plateforme à déboguer en plus d'Android.
- Aucun SDK Flutter dans cet environnement : le livrable n'aurait pas pu être testé du tout.
- La version web de Flutter (CanvasKit) produit un rendu lourd, pauvre en accessibilité native
  (pas de vrai DOM sémantique), et ne résout pas la contrainte d'onglet fermé.

### C. PWA (HTML/CSS/TypeScript + service worker)

**Points forts**

- Un seul artefact, installable, hors ligne, testable dans un navigateur — donc **testable ici**.
- DOM natif : accessibilité, RTL, sélection de texte, zoom, lecteurs d'écran fonctionnent sans travail
  supplémentaire.
- Poids maîtrisé : le build mesuré fait 372 kB de JS (114 kB gzip) et 19 kB de CSS.
- Aucune permission `INTERNET` n'est nécessaire dans l'emballage Android : tout est local.
- Mise à jour atomique via le service worker généré au build.

**Points faibles, non négociables**

- **Une page web ne peut pas réveiller un appareil.** Les timers sont suspendus en arrière-plan, et
  un onglet fermé est mort. `Notification Triggers` / Periodic Background Sync ne sont ni garantis
  ni disponibles sur toutes les plateformes, et ne permettent pas une alarme à la seconde.
- Le son en arrière-plan n'est pas garanti (autoplay, focus audio, écran verrouillé).
- Une PWA installée reste soumise au gestionnaire de batterie du navigateur.

Conclusion partielle : la PWA est excellente pour **calculer, afficher, expliquer et fonctionner hors
ligne**, et structurellement incapable de garantir l'Adhan. L'application native est l'inverse.

---

## 3. Matrice de décision

Notation de 1 (inadapté) à 5 (excellent), pondérée par l'importance réelle pour ce produit.

| Critère | Poids | Android natif | Flutter | PWA |
| --- | ---: | ---: | ---: | ---: |
| Alarme garantie, application fermée | 30 % | 5 | 4 | **1** |
| Anti-doublon / anti-retard vérifiable | 15 % | 4 | 3 | 3 |
| Exactitude du calcul testable | 15 % | 4 | 4 | 5 |
| UI trilingue + RTL + accessibilité | 15 % | 4 | 4 | 5 |
| Hors ligne sans serveur | 10 % | 4 | 4 | 5 |
| Coût de maintenance / taille d'équipe | 10 % | 2 | 4 | 5 |
| Faisabilité **dans cet environnement** | 5 % | 1 | 1 | 5 |
| **Score pondéré** | | **4,05** | **3,70** | **3,20** |

Le calcul brut montre le paradoxe : le natif gagne sur le besoin critique, la PWA gagne sur tout le
reste. Choisir un seul camp sacrifie soit la garantie de sonner, soit la qualité et la testabilité.

---

## 4. Décision retenue : noyau unique + deux hôtes

```
        ┌─────────────────────────────────────────────┐
        │  src/core  — moteur pur TypeScript          │
        │  astronomie, méthodes, fuseaux, planning    │
        └───────────────┬─────────────────────────────┘
                        │ mêmes instants UTC absolus
        ┌───────────────┴───────────────┐
        │                               │
┌───────▼────────┐            ┌─────────▼──────────┐
│  PWA (web)     │            │  Android (Kotlin)  │
│  UI + calcul   │            │  WebView + bridge  │
│  timer onglet  │            │  AlarmManager      │
└────────────────┘            └────────────────────┘
```

**Le calcul n'est écrit qu'une fois.** L'application Android embarque le même `dist/` que la PWA
(copié par Gradle dans `assets/web/`) et lui ajoute uniquement ce que le navigateur ne sait pas
faire : `AlarmManager`, le service audio, les notifications et le réarmement système.

Pourquoi c'est préférable à une réécriture Kotlin du calcul :

- une seule source de vérité pour les horaires (le moteur testé ici) ;
- une correction de méthode bénéficie immédiatement aux deux plateformes ;
- le pont ne transporte que des **instants UTC** (`atIso`), donc aucun risque de décalage de fuseau
  entre les deux côtés ;
- l'UI, les traductions et l'accessibilité ne sont pas dupliquées.

Le prix à payer est assumé : le WebView ajoute ~20–40 Mo au processus et nécessite un pont. En
contrepartie, l'application garde une UI DOM accessible et un unique jeu de tests.

### Ce que l'architecture interdit

- **Aucun fallback silencieux.** Si `canScheduleExactAlarms()` est faux, l'application écrit
  `deferred` et l'écran de diagnostic le dit. Elle ne programme pas un timer JavaScript « en
  attendant ».
- **Aucun doublon.** Le registre persistant (`firedKeys`) décide, côté web comme côté Kotlin.
- **Aucun retard rattrapé.** Au-delà de 120 s, l'événement est enregistré `missed` et n'est jamais
  joué.
- **Aucune donnée envoyée.** Le manifeste Android ne déclare pas `INTERNET`.

---

## 5. Pourquoi pas seulement une PWA ?

Parce que le produit s'appelle « Azan » et que la promesse implicite est « ça sonne ». Une PWA seule
obligerait à écrire dans l'interface « ne fonctionne que si l'onglet reste ouvert », ce qui est
exactement ce que fait l'application — mais sans jamais pouvoir offrir mieux. Le mode PWA reste
livré, complet et honnête, pour les utilisateurs qui refusent d'installer une application.

## 6. Pourquoi pas seulement du natif ?

Parce qu'aucun outil Android n'est disponible ici : le livrable serait un projet non exécutable,
donc invérifiable. En choisissant un noyau TypeScript partagé, la partie qui doit être **prouvée**
(le calcul, les fuseaux, l'anti-doublon) est réellement testée, et la partie qui dépend du système
(les alarmes) est isolée derrière un contrat étroit, documenté et relisible.

## 7. Références techniques consultées

- Alarmes exactes et politique Android 12+/13+ :
  <https://developer.android.com/develop/background-work/services/alarms/schedule>
- `setAlarmClock`, `setExactAndAllowWhileIdle`, exemptions Doze.
- Catalogue de méthodes AlAdhan : <https://api.aladhan.com/v1/methods> (récupéré le 2026-10-27).
- Documentation Play sur `USE_EXACT_ALARM` (application dont le cœur est l'alarme/le calendrier).
- GeoNames `cities15000` pour les coordonnées et fuseaux des villes.
