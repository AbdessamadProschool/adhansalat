# Preuves de provenance — « Beautiful adhan »

Ce dossier conserve des **copies locales** des pages et métadonnées qui établissent la provenance
de l'Adhan CC0 livré avec l'application. Il est hors de `dist/` et hors de l'APK.

Date de collecte : **2026-10-29** (UTC).

| Fichier | Source | Ce qu'il montre |
| --- | --- | --- |
| `commons-file-page.html` | https://commons.wikimedia.org/wiki/File:Beautiful_adhan.ogg | Page publique du fichier, avec le bandeau de licence CC0 et l'auteur |
| `commons-imageinfo.json` | API Commons `action=query&prop=imageinfo` | Métadonnées machine : `LicenseShortName: CC0`, auteur `Adam-synagda`, taille et SHA-1 |
| `cc0-1.0-deed.fr.html` | https://creativecommons.org/publicdomain/zero/1.0/deed.fr | Résumé officiel de la CC0 1.0 en français |
| `cc0-1.0-legalcode.fr.html` | https://creativecommons.org/publicdomain/zero/1.0/legalcode.fr | Texte juridique de la CC0 1.0 en français |
| `SHA256SUMS.txt` | généré localement | Empreintes SHA-256 des sources, copies livrées et métadonnées |
| `SHA1SUMS.txt` | généré localement | SHA-1 de l'OGG, à comparer au SHA-1 publié par Commons |

## Valeurs de référence

- OGG : 1 229 032 octets, SHA-1 `a1fa4fd942401922c5c3301816384aae86956522` — **identique** au
  SHA-1 retourné par l'API Commons ;
- MP3 livré : 1 781 329 octets, SHA-256
  `5b291cdc7dbb95b3dd141220222a0dbf1754458adbc5c62036e54da39ede5a7b` ;
- les deux copies livrées (`public/audio/adhan/adhan-cc0.mp3` et
  `android/app/src/main/res/raw/adhan_cc0.mp3`) ont le **même SHA-256** que le MP3 source.

## Vérifier localement

```bash
sha256sum -c audio-cc0/evidence/SHA256SUMS.txt
sha1sum -c audio-cc0/evidence/SHA1SUMS.txt
```

Sous PowerShell :

```powershell
Get-Content audio-cc0/evidence/SHA256SUMS.txt | ForEach-Object {
  $hash, $path = $_ -split '  ', 2
  $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash.ToLower()
  if ($actual -ne $hash) { "MISMATCH $path" } else { "ok $path" }
}
```

## Portée et limite

Ces fichiers sont des **captures datées** : une page web peut ensuite être modifiée. Ils documentent
la déclaration de licence faite par l'auteur au moment de la collecte ; ils ne constituent ni une
expertise juridique ni une garantie indépendante que l'auteur détenait tous les droits sur
l'enregistrement. La CC0 publiée sur Commons reste la base de réutilisation retenue par le projet.
