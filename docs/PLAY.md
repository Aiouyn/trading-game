# Playing locally and on your LAN

`npm run play` starts the world server and the web app together. It builds the web app first when the build is missing or
older than the sources. Ctrl+C stops both; the world saves and makes a backup on the way out.

## Requirements

- Node 22.13 or newer (the world's database uses the built-in `node:sqlite`).
- `npm install` once in the project folder.

## First run

```
npm run play
```

The first run builds the web app (a minute or two). Then the console prints where to open the game:

```
  This computer:    http://localhost:3000
  Phone on Wi-Fi:   http://192.168.1.20:3000
  World server:     port 8797 (the game talks to it on the same address)
  Save and backups: ./world-data (backups in ./world-data/backups, see docs/PLAY.md)
```

Options: `npm run play -- --build` rebuilds even when the build is current; `--no-build` never builds (it fails when there is no
build yet); `--help` prints the usage. Ports: `PLAY_WEB_PORT` (3000) and `PLAY_WORLD_PORT` (8797). The two must differ.

## Joining from a phone on the same Wi-Fi

Open the "Phone on Wi-Fi" address on the phone. The web app finds the world on the same address, on the world port, so nothing
is set up on the phone. If the firewall asks, allow Node.js on private networks. If no address is printed, the computer has no
network connection other than loopback; connect it to Wi-Fi and start again.

## Where the save lives

The world keeps everything in one database file, `world-data/world.db` (the folder is `DATA_DIR`, default `./world-data`).
Accounts, passwords (hashed), the world's history and the command log are all in it. Delete the folder to start a fresh world.

## Backups and restore

- The world makes a backup every real hour and one when it stops, into `world-data/backups/`. Each backup is a complete copy of
  the database taken at a tick, with the world's latest state saved first, so restoring it brings the world back to that tick.
- The folder keeps the newest 48 backups (about two days of hours) and, for each of the last 14 UTC days, the newest backup of
  that day. Older files are removed when a new backup is written.
- The administrator's page (`/admin`) lists the backups and has a "back up now" button.

To restore a backup:

1. Stop the world (Ctrl+C in the `npm run play` window, or stop `npm run world`).
2. Run `npm run world:restore -- world-data/backups/<file>.db`. The command refuses while a world is running, and it keeps the
   replaced database as `world.db.before-restore-<time>` in the same folder.
3. Start again with `npm run play`.

## Resetting a world

Stop the world, then delete `world-data/` (or move it aside). The next start creates a new world with a new seed.

---

# Jouer en local et sur le réseau local (LAN)

`npm run play` lance le serveur du monde et l'application web ensemble. Il construit d'abord l'application web si la version
construite est absente ou plus ancienne que les sources. Ctrl+C arrête les deux ; le monde sauvegarde et fait une copie de
secours avant de s'arrêter.

## Prérequis

- Node 22.13 ou plus récent (la base du monde utilise `node:sqlite`, intégré à Node).
- `npm install` une fois dans le dossier du projet.

## Premier lancement

```
npm run play
```

Le premier lancement construit l'application web (une à deux minutes). La console affiche ensuite où ouvrir le jeu :

```
  This computer:    http://localhost:3000
  Phone on Wi-Fi:   http://192.168.1.20:3000
  World server:     port 8797 (the game talks to it on the same address)
  Save and backups: ./world-data (backups in ./world-data/backups, see docs/PLAY.md)
```

Options : `npm run play -- --build` reconstruit même si la version est à jour ; `--no-build` ne construit jamais (il échoue
s'il n'y a pas encore de version construite) ; `--help` affiche l'aide. Ports : `PLAY_WEB_PORT` (3000) et `PLAY_WORLD_PORT`
(8797). Les deux doivent être différents.

## Rejoindre depuis un téléphone sur le même Wi-Fi

Ouvrez l'adresse « Phone on Wi-Fi » sur le téléphone. L'application web trouve le monde à la même adresse, sur le port du monde :
rien n'est à configurer sur le téléphone. Si le pare-feu le demande, autorisez Node.js sur les réseaux privés. Si aucune adresse
n'est affichée, l'ordinateur n'a pas d'autre connexion que la boucle locale ; connectez-le au Wi-Fi et relancez.

## Où est la sauvegarde

Le monde garde tout dans un fichier de base, `world-data/world.db` (le dossier est `DATA_DIR`, par défaut `./world-data`).
Les comptes, les mots de passe (hachés), l'historique du monde et le journal des commandes s'y trouvent. Supprimez le dossier
pour repartir d'un monde neuf.

## Copies de secours et restauration

- Le monde fait une copie de secours chaque heure réelle et une à l'arrêt, dans `world-data/backups/`. Chaque copie est une
  image complète de la base prise à un tick, l'état le plus récent étant enregistré d'abord ; la restaurer ramène le monde à ce
  tick.
- Le dossier garde les 48 copies les plus récentes (environ deux jours d'heures) et, pour chacun des 14 derniers jours UTC, la
  copie la plus récente de ce jour. Les fichiers plus anciens sont supprimés à l'écriture d'une nouvelle copie.
- La page de l'administrateur (`/admin`) liste les copies et propose le bouton « back up now ».

Pour restaurer une copie :

1. Arrêtez le monde (Ctrl+C dans la fenêtre de `npm run play`, ou arrêtez `npm run world`).
2. Lancez `npm run world:restore -- world-data/backups/<fichier>.db`. La commande refuse tant qu'un monde tourne, et elle garde
   la base remplacée sous le nom `world.db.before-restore-<heure>` dans le même dossier.
3. Relancez avec `npm run play`.

## Réinitialiser un monde

Arrêtez le monde, puis supprimez `world-data/` (ou déplacez-le). Le prochain démarrage crée un monde neuf avec une nouvelle graine.
