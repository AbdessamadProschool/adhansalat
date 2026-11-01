# Provenance — « Beautiful adhan »

This folder keeps the **source files** of the first freely licensed Adhan bundled
with Azan Global. It is not part of `dist/` and is not copied into the APK.

| Field | Value |
| --- | --- |
| Title | Beautiful adhan |
| Author | Adam-synagda |
| Source page | https://commons.wikimedia.org/wiki/File:Beautiful_adhan.ogg |
| Original file | `Beautiful_adhan.ogg` — 1 229 032 bytes |
| Original SHA-1 (Commons) | `a1fa4fd942401922c5c3301816384aae86956522` |
| Original SHA-256 (downloaded) | `35fe06b08fe80505c550c33fed8a783fa9901ddc81ac884958b4be048f5b2a79` |
| Served file | `Beautiful_adhan.mp3` (Wikimedia MP3 transcode) — 1 781 329 bytes |
| Served SHA-256 | `5b291cdc7dbb95b3dd141220222a0dbf1754458adbc5c62036e54da39ede5a7b` |
| Licence | CC0 1.0 Universal (Public Domain Dedication) |
| Licence URL | https://creativecommons.org/publicdomain/zero/1.0/deed.fr |
| Retrieved | 2026-10-29 |

The Commons API (`prop=imageinfo`) reports `LicenseShortName: CC0`, artist
`Adam-synagda`, credit `Own work`. The Commons API (`prop=videoinfo`) also lists
the MP3 transcode used here; it was downloaded as-is, without re-encoding or
denoising.

Measured with FFprobe/FFmpeg:

- duration 154.07 s (2 min 34 s), MP3, 44 100 Hz, stereo, ~92.5 kbit/s;
- full decode returns status 0;
- mean volume −12.1 dB, max −2.2 dB, no silence ≥ 1 s at −45 dB.

The recording was **not listened to** in this environment (no audio output).
Quality is therefore verified technically (duration, decode, levels, absence of
long silence), not by a human ear.

`public/audio/adhan/adhan-cc0.mp3` and
`android/app/src/main/res/raw/adhan_cc0.mp3` are byte-identical copies of the
served MP3. The original OGG stays only in this folder.

## Archived evidence

`evidence/` keeps dated local copies of the proof:

- `commons-file-page.html` — snapshot of the public file page;
- `commons-imageinfo.json` — raw Commons API response (`LicenseShortName: CC0`,
  author, size, SHA-1);
- `cc0-1.0-deed.fr.html` and `cc0-1.0-legalcode.fr.html` — the CC0 1.0 deed and
  legal code in French;
- `SHA256SUMS.txt` and `SHA1SUMS.txt` — hashes of the source files, the two
  shipped copies and the metadata;
- `README.md` — what each file proves, how to verify it, and the limits of a
  dated web snapshot.

These snapshots document the licence **published by the author**; they are not a
legal opinion and do not independently prove that the uploader owned every right
in the recording.

Attribution (voluntary — CC0 does not require it):

> « Beautiful adhan » par Adam-synagda — Wikimedia Commons — CC0 1.0
