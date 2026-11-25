# Firebase Hosting preparation

Firebase status on November 25, 2026: publishing files prepared and tested locally; **not deployed to Firebase**. Firebase requires two-step verification for the existing course project's owner account. The owner chose to defer that setup, so no account, cloud rules, database, billing, or Hosting site was changed.

## Build the public files

From the project root:

```sh
python3 work/build-preview.py
python3 work/build-hosting.py
```

The builder creates `hosting/public/index.html` from the existing garden, copies only the required local model assets and license notices, and records file sizes and SHA-256 hashes in `build-manifest.json`. The generated `public` directory is excluded from source control. Source archives, launchers, private databases, and sessions are excluded from public files.

For a local publishing preview:

```sh
python3 -m http.server 8855 --bind 127.0.0.1 --directory hosting/public
```

Open `http://127.0.0.1:8855/`. The November 25 preview passed planting, 60% bloom, refresh recovery, My Flowers, saved details, and overhead focus. Existing visual code was copied unchanged. Browser logs contained no script errors or warnings.

## Resume publication

After the owner completes Firebase's account verification, confirm access to the existing `shared-mindes` project and select a separate Hosting site for Secret Garden. The configuration requires the explicit `secret-garden` Hosting target; it does not choose or overwrite the project's default site. Associate that target with the confirmed site before publishing. Use Hosting-only publication so existing database rules and earlier assignments are preserved.

The configuration has no wildcard rewrite, no public API, and no restrictive execution headers. HTML revalidates on each visit; model and license files cache for one hour.

**Hosting alone publishes the single-user browser experience.** Its localStorage, planting, focus, Body, history, and semantic interactions remain available. The existing cross-device shared garden uses a local Python/SQLite service; making it work across the internet requires a separate cloud data integration or a hosted API. The hosting package does not migrate or publish existing local flowers automatically.

The public browser demo is published separately through the existing GitHub Pages site at https://zixuanlydia.github.io/Shares-Mindes/secret-garden/. This Firebase preparation does not change that site or certify all course requirements.
