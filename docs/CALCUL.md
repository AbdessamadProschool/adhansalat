# Calcul des horaires

## 1. Principe

`src/core/` est un moteur pur : aucune horloge, aucun DOM, aucun réseau, aucune locale. Il prend
`(date locale, latitude, longitude, altitude, méthode, madhhab, corrections)` et rend **des instants
UTC absolus**, plus deux valeurs astronomiques (`solarNoon`, `midnight`).

Le fuseau n'entre pas dans le calcul : il sert uniquement à choisir la date civile demandée et à
afficher le résultat. Une prière ne peut donc pas se décaler d'une heure lors d'un changement
d'heure.

## 2. Chaîne astronomique

1. **Jour julien** de la date grégorienne (`julianDay`), puis du repère d'itération
   (`julianDayFromInstant`).
2. **Position du soleil** (algorithme basse précision type PrayTimes) :
   `g = 357,529 + 0,98560028·d`, `q = 280,459 + 0,98564736·d`,
   `λ = q + 1,915·sin g + 0,02·sin 2g`, obliquité `ε = 23,439 − 0,00000036·d`.
   On en déduit la **déclinaison** `δ = asin(sin ε · sin λ)` et l'**équation du temps**
   `EoT = q/15 − α` (heures).
3. **Transit solaire** (midi vrai) : estimation `12:00 UTC − longitude/15`, corrigée par l'équation
   du temps, puis **itérée jusqu'à tomber réellement sur la date locale demandée**. Cette boucle est
   indispensable près de la ligne de changement de date : un décalage politique (UTC+14 à
   longitude −157°) est très éloigné de l'estimation par longitude.
4. **Angle horaire** pour une altitude `h` :
   `cos H = (sin h − sin φ·sin δ) / (cos φ·cos δ)`, `H` en heures. `null` si `|cos H| > 1`
   (le soleil n'atteint jamais cette hauteur).
5. **Affinage** : la déclinaison est réévaluée une fois à l'instant estimé, puis l'angle horaire est
   recalculé. C'est l'itération qui distingue un calcul « à la minute » d'une approximation grossière.
6. **Horizon** : `h₀ = −(0,833 + 0,0347·√altitude)` degrés (réfraction + rayon du disque solaire +
   dépression due à l'altitude). Le lever et le coucher en découlent.
7. **Asr** : hauteur `h = arccot(shadowFactor + tan|φ − δ|)`, où `shadowFactor = 1` (standard) ou
   `2` (hanafite). L'ombre inclut donc l'ombre du midi, conformément à la définition classique.
8. **Maghrib** : coucher du soleil, éventuellement + intervalle (Portugal +3 min, Jordanie +5 min)
   ou par angle sous l'horizon (Jafari 4°, Téhéran 4,5°).
9. **Isha** : angle de dépression, ou intervalle fixe après le coucher (Umm al-Qura 90 min, Golfe,
   Qatar, Portugal 77 min).
10. **Minuit islamique** : `maghrib + nuit/2`, la nuit étant la durée entre coucher et lever.
11. **Corrections** : `minute = méthode + utilisateur`. Les corrections de méthode font partie de la
    définition publiée ; les corrections utilisateur s'y ajoutent et restent visibles séparément.
12. **Étiquette** : `labelFor()` arrondit à la minute supérieure (`+30 s`) pour l'affichage, sans
    modifier l'instant stocké.

## 3. Méthodes

23 entrées de catalogue (ids AlAdhan). **22 sont calculables localement** ; `MOONSIGHTING` (id 15)
est listé mais désactivé, car il repose sur un modèle de visibilité du croissant, pas sur des angles.

| id | Clé | Fajr | Isha | Remarque |
| ---: | --- | --- | --- | --- |
| 3 | `MWL` | 18° | 17° | Ligue islamique mondiale — défaut |
| 2 | `ISNA` | 15° | 15° | Amérique du Nord |
| 5 | `EGYPT` | 19,5° | 17,5° | Égypte, Afrique du Nord |
| 4 | `MAKKAH` | 18,5° | +90 min | Umm al-Qura |
| 1 | `KARACHI` | 18° | 18° | Karachi |
| 7 | `TEHRAN` | 17,7° | 14° | Maghrib 4,5° |
| 0 | `JAFARI` | 16° | 14° | Maghrib 4° (chiite) |
| 8 | `GULF` | 19,5° | +90 min | Golfe |
| 9 | `KUWAIT` | 18° | 17,5° | Koweït |
| 10 | `QATAR` | 18° | +90 min | Qatar |
| 11 | `SINGAPORE` | 20° | 18° | MUIS |
| 12 | `FRANCE` | 12° | 12° | UOIF |
| 13 | `TURKEY` | 18° | 17° | Diyanet (corrections) |
| 14 | `RUSSIA` | 16° | 15° | Russie |
| 15 | `MOONSIGHTING` | — | — | **non calculable localement** |
| 16 | `DUBAI` | 18,2° | 18,2° | Dubaï (corrections) |
| 17 | `JAKIM` | 20° | 18° | Malaisie |
| 18 | `TUNISIA` | 18° | 18° | Tunisie |
| 19 | `ALGERIA` | 18° | 17° | Algérie |
| 20 | `KEMENAG` | 20° | 18° | Indonésie |
| 21 | `MOROCCO` | 19° | 17° | **non certifiée** (voir §6) |
| 22 | `PORTUGAL` | 18° | +77 min | Maghrib +3 min |
| 23 | `JORDAN` | 18° | 18° | Maghrib +5 min |

### Corrections de méthode

Une méthode n'est pas seulement un couple d'angles. Les valeurs ci-dessous sont celles de
l'implémentation de référence (`batoulapps/adhan`, utilisée par AlAdhan) ; elles sont appliquées
d'office, et l'utilisateur peut ajouter ses propres minutes par-dessus.

| Méthode | Fajr | Lever | Dhuhr | Asr | Maghrib | Isha | Source |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| MWL, ISNA, Égypte, Karachi, Qatar | — | — | +1 | — | — | — | documentée |
| Diyanet (Turquie) | — | −7 | +5 | +4 | +7 | — | documentée |
| Dubaï | — | −3 | +3 | +3 | +3 | — | documentée |
| Maroc | — | — | +5 | — | +5 | — | **observée** |

« Observée » signifie mesurée contre l'API parce que la bibliothèque source ne publie pas la valeur.
C'est une information de transparence, pas une validation religieuse.

## 4. Hautes latitudes

Cinq règles, sélectionnables :

| Règle | Comportement |
| --- | --- |
| `none` | si l'angle est inatteignable, la prière vaut `null` — jamais inventée |
| `angleBased` (défaut) | portion de nuit = `nuit × angle / 60` |
| `middleOfNight` | portion = `nuit / 2` |
| `seventhOfNight` | portion = `nuit / 7` |
| `nearestLatitude` | emprunte la durée à 45° du même hémisphère (« aqrab al-bilad ») |

Détail important : **un angle atteignable est toujours conservé**, même en nuit polaire. À Tromsø en
décembre, le soleil ne se lève pas mais descend sous −18°, donc Fajr et Isha existent réellement et
ne doivent pas être « corrigés ». Le repli ne s'applique que si l'angle n'est pas atteint.

Quand la nuit n'existe pas (jour polaire) et que la règle a besoin d'une portion de nuit, la valeur
devient `null` et `highLatitudeFallback = 'unresolvable'`. L'interface affiche alors « — » avec une
explication. `nearestLatitude` reste capable de produire une heure dans ce cas.

## 5. Validation contre une référence externe

`src/core/__fixtures__/aladhan-reference.json` contient **18 lieux**, 33 dates, 6 champs
(Fajr, lever, Dhuhr, Asr, Maghrib, Isha) récupérés depuis AlAdhan. Ce sont des **données de
comparaison**, pas une autorité.

Résultat mesuré (`tests/engine.test.ts`) :

- **180 comparaisons** après exclusions ;
- **écart maximal : 3 minutes** (`dubai 2026-06-21`, Asr : 15:46 local contre 15:43) ;
- écarts nuls ou d'une minute sur la grande majorité des champs.

Deux exclusions, documentées dans le test :

| Cas | Raison |
| --- | --- |
| `casablanca-summer` 21-12-2026 | l'API renvoie toute la journée en UTC+0 alors que le Maroc est à UTC+1 hors Ramadan : les six champs sont exactement 60 min trop tôt. Le moteur garde UTC+1, comme ICU et la bibliothèque de référence. |
| `tromso-extreme` 21-06-2026 | jour polaire : aucune nuit, donc Fajr/Isha n'existent pas. La référence les renvoie pourtant ; les comparer n'aurait pas de sens. |

Ces écarts ne sont pas cachés : le test les **affiche** à chaque exécution
(`[engine] 180 field comparisons, worst |diff| = 3 min …`).

## 6. Le cas du Maroc

- `MOROCCO` a l'id 21 et les angles **19° / 17°**, avec `dhuhr +5` et `maghrib +5`.
- `MA: verifiedAgainstLocalAuthority === false`. Aucune comparaison documentée avec le calendrier du
  ministère des Habous n'a été possible (`habous.gov.ma` injoignable depuis cet environnement).
- L'écran « Méthodes » affiche donc explicitement que la méthode est une **entrée de catalogue non
  certifiée**, et invite à comparer avec le calendrier local.
- Le profil de pays ne fait que **pré-sélectionner** : l'utilisateur peut changer de méthode à tout
  moment, et l'écran conserve l'indication de ce qui est réellement appliqué.

## 7. Date hégirienne

`src/core/hijri.ts` utilise le calendrier `islamic-umalqura` d'ICU via `Intl.DateTimeFormat`, avec
repli arithmétique si l'environnement ne le fournit pas. L'interface signale que le calendrier
d'Umm al-Qura peut différer d'un jour de l'observation locale. Aucune revendication d'exactitude
religieuse.

## 8. Précision et limites du modèle

| Source d'écart | Ordre de grandeur | Traitement |
| --- | --- | --- |
| Algorithme solaire basse précision | ±1 min (1900–2100) | documenté, suffisant face aux écarts de méthode |
| Réfraction atmosphérique | variable (pression, température) | constante standard 0,833° + altitude |
| Relief local (montagne, vallée) | plusieurs minutes | seule l'altitude du lieu est prise en compte |
| Méthode vs calendrier officiel | 1–5 min, parfois plus | corrections par méthode + corrections utilisateur |
| Arrondi d'affichage | ≤ 30 s | arrondi à la minute supérieure, instant stocké intact |
| Secondes | non significatives | les alarmes visent l'instant exact, l'UI affiche la minute |
| Historique avant 2018 | non couvert par la table embarquée | repli sur `Intl` de l'hôte |

Le moteur ne cherche **pas** à reproduire au minute près un calendrier national : il fournit un
calcul reproductible, testé, et rend visibles les paramètres qui expliquent les différences.
