#!/bin/sh
# entrypoint d'agent-gw — pose l'umask, puis passe la main à la commande de l'image.
#
# Il ne fait QUE ça, et c'est délibéré : tout ce qui relève du déploiement se déclare
# dans le manifeste du pod, tout ce qui relève d'un plugin vit dans son `setup`. Un
# entrypoint qui décide des choses est un endroit où personne ne pense à regarder.
#
# ── POURQUOI umask 002 ──
#
# Le défaut (0022) fait naître les fichiers en 0644 : le groupe n'a que la lecture.
# Tant qu'un corps écrit dans son coin, ça ne se voit pas. Mais depuis le 2026-08-20
# il existe un magasin de mémoire PARTAGÉ (le cercle `famille`, co-écrit par Alfred
# et Nestor), et les deux corps y écrivent sous des UID DIFFÉRENTS — Alfred en 3000,
# Nestor en 1000, le compte `agent` de cette image. Ils ne se rejoignent QUE par un
# groupe secondaire commun.
#
# Sans ce bit, la co-édition est à moitié cassée, et de la pire façon : chacun peut
# CRÉER, aucun ne peut MODIFIER le fichier de l'autre. Rien n'échoue au montage, rien
# n'échoue au démarrage — ça ne se découvre qu'au premier `Edit` refusé.
#
# ⚠️ ET ÇA NE PEUT PAS SE RÉGLER SUR LE SERVEUR. Mesuré le 2026-08-20, pas supposé :
# en NFS, l'umask est appliqué CÔTÉ CLIENT. Le pod envoie déjà un CREATE en mode
# 0644 ; une ACL POSIX par défaut sur le dataset ne peut alors plus que RETIRER des
# bits, jamais rendre le bit d'écriture groupe déjà masqué (essayé : le fichier
# sortait en 0640, `other` bien tué, `group w` toujours absent). L'ACL est posée et
# sert à autre chose — garantir qu'aucun fichier du cercle n'est lisible hors du
# groupe. Le bit d'écriture, lui, se décide ici.
#
# ⚠️ POURQUOI C'EST SANS RISQUE AILLEURS. `002` ouvre l'écriture au GROUPE du
# fichier. Or le groupe primaire de chaque corps est un groupe PRIVÉ (3003 pour
# Alfred, 1000 pour Nestor et Skippy) : hors du cercle partagé, « le groupe » n'est
# personne d'autre que lui-même. Le bit ne devient effectif que là où un setgid
# impose un groupe commun — c'est-à-dire exactement là où on le veut.
#
# Cet umask a d'abord vécu dans les manifestes k8s, en `args`, ce qui obligeait à y
# recopier le CMD de l'image — un piège silencieux le jour où la commande de
# démarrage changerait. Il est ici, où il vaut pour tous les corps sans duplication.
set -eu

umask 002

# `exec "$@"` : la commande vient du CMD de l'image (ou d'un override du manifeste),
# elle n'est PAS recopiée ici. C'est tout l'intérêt du déplacement.
exec "$@"
