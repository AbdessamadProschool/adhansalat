# GeoNames — vérification du catalogue

Rapport généré par `scripts/build-cities.mjs` le 2026-11-01T02:50:51.657Z.
Les chiffres ci-dessous proviennent du fichier réel `data-source\MA.txt`
(153 872 lignes), et non d'une estimation.

## Filtre appliqué

Seule la classe `P` (lieu habité) est retenue, et uniquement les codes de localité
habitée. Les sections urbaines (`PPLX`), lieux abandonnés (`PPLQ`) et lieux
religieux (`PPLR`) sont exclus, comme tous les reliefs, cours d'eau, bâtiments et
divisions administratives.

| Code | Signification | Entrées retenues |
| --- | --- | ---: |
| `PPL` | populated place (village, town, douar) | 45 320 |
| `PPLF` | farm village | 322 |
| `PPLA3` | seat of a third-order administrative division | 195 |
| `PPLL` | populated locality | 176 |
| `PPLA2` | seat of a second-order administrative division | 14 |
| `PPLA` | seat of a first-order administrative division | 9 |
| `PPLS` | populated places | 2 |
| `PPLC` | capital of a political entity | 1 |

Entrées rejetées (principaux codes non habités) :

| Code | Entrées |
| --- | ---: |
| `HLL` | 14 566 |
| `LCTY` | 13 798 |
| `WAD` | 13 770 |
| `SHRN` | 10 049 |
| `MT` | 8 720 |
| `WLL` | 4 916 |
| `CMTY` | 3 776 |
| `AREA` | 3 562 |
| `CULT` | 3 056 |
| `SPNG` | 2 909 |
| `RDGE` | 2 362 |
| `FRM` | 2 340 |

Autres rejets : 2 coordonnées hors enveloppe
(Maroc + Sahara occidental : 20.7–36 °N,
-17.2–-0.8 °E), 1 fuseau(x)
incompatible(s), 0 coordonnée(s) invalide(s),
0 identifiant(s) dupliqué(s).

## Contrôles

| Contrôle | Résultat |
| --- | ---: |
| Identifiants dupliqués | 0 |
| Doublons exacts nom + coordonnées | 0 |
| Même nom normalisé à moins de 1 km | 81 |
| Coordonnées non finies | 0 |
| Coordonnées 0,0 | 0 |
| Fuseaux hors Maroc | 0 |
| Entrées hors enveloppe | 0 |
| Codes admin absents de la table | 2 |

Les 81 paires « même nom à moins de 1 km » sont des
homonymes très proches de GeoNames (hameaux voisins), pas des doublons exacts :
elles sont conservées, car ce sont des localités distinctes.

Entrées écartées pour incohérence de coordonnées ou de fuseau :

- `2526369` Zaouia bou Saïd (PPL) — 3.7, -8.85, Africa/Casablanca : coordonnées hors de l’enveloppe Maroc + Sahara occidental
- `2556625` Aziader (PPL) — 36.61, -5.38, Africa/Casablanca : coordonnées hors de l’enveloppe Maroc + Sahara occidental
- `7413962` Falaklak (PPL) — 21.78915, -13.6244, Africa/Nouakchott : fuseau horaire incompatible

## Variantes de noms

- Localités avec nom arabe : 113
- Localités avec variantes de recherche : 11 921
- Jetons de variantes retenus : 26 615
- Maximum de variantes stockées par entrée : 12
- Localités sans population GeoNames : 45 638
  (401 avec population)

## Répartition et découpage

| Clé | Région | Localités | Fichier |
| --- | --- | ---: | --- |
| `10` | Guelmim-Oued Noun | 1 150 | `ma-10.json` |
| `11` | Laayoune-Sakia El Hamra | 5 | `ma-11.json` |
| `12` | Dakhla-Oued Ed-Dahab | 6 | `ma-12.json` |
| `00` | Rattachement régional incertain | 2 | `ma-00.json` |
| `01` | Tanger-Tetouan-Al Hoceima | 4 581 | `ma-01.json` |
| `02` | Oriental | 2 923 | `ma-02.json` |
| `03` | Fes-Meknes | 5 163 | `ma-03.json` |
| `04` | Rabat-Salé-Kénitra | 3 004 | `ma-04.json` |
| `05` | Beni Mellal-Khenifra | 3 194 | `ma-05.json` |
| `06` | Casablanca-Settat | 4 556 | `ma-06.json` |
| `07` | Marrakesh-Safi | 12 376 | `ma-07.json` |
| `08` | Drâa-Tafilalet | 2 594 | `ma-08.json` |
| `09` | Souss-Massa | 6 485 | `ma-09.json` |

## Sorties

- `src/core/data/cities-core.json` — 2 866 entrées, 471 KiB : **embarqué**.
- `public/data/cities/index.json` — 46 039 entrées, 2220 KiB : chargé à la demande.
- `public/data/cities/ma-XX.json` — 13 fichiers, 9.23 MiB au total : chargés par région.
- `src/core/data/cities.json` — dataset complet filtré, réservé aux tests et rapports.

## Limites connues

- GeoNames est déclaratif : une localité peut être un douar de quelques foyers,
  et 45 638 entrées n'ont aucune population renseignée.
- 2 entrées ont un code administratif absent de la table GeoNames ;
  elles sont conservées dans `ma-00.json` avec la mention « rattachement incertain ».
- Les noms arabes ne proviennent que des variantes GeoNames et d'une liste vérifiée
  de 40 grandes villes : aucune traduction automatique n'est inventée.

Licence des données : CC BY 4.0 — © GeoNames contributors — https://www.geonames.org/
