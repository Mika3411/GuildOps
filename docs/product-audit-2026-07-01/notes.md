# GuildOps mini-audit produit - 2026-07-01

## Portee

Question utilisateur: est-ce que l'app peut interesser ?

Parcours observes dans le navigateur local:

1. Builder / dashboard principal
2. Recrutement
3. Wars & Events
4. Banque
5. Route publique directe `/g/aegis-nord` verifiee partiellement

Captures:

- `01-builder-dashboard-viewport.png`
- `02-recrutement.png`
- `03-wars-events.png`
- `04-banque.png`

## Sante par etape

1. Builder / dashboard: fort potentiel, mais dense. La promesse "site public + operations guilde" est visible, avec une ambiance coherent "commandement". Risque: le libelle "Builder" sous-vend la partie operations.
2. Recrutement: tres bon module d'appel. Il relie annonces, criteres, candidatures et site public. C'est concret pour les guildes qui recrutent via Discord/formulaires.
3. Wars & Events: coeur de valeur pour officiers. Check-in, planning, roles et disponibilites adressent une vraie douleur de coordination.
4. Banque: module tres specifique et credible. Stock, demandes, validation et commande `!banque` donnent une sensation d'outil fait pour les vrais usages de guilde.
5. Route publique directe: limite de verification. La preview integree est visible, mais l'acces direct local a `/g/aegis-nord` a rendu un conteneur React vide dans cette session et la capture navigateur a expire. A verifier en priorite avant de presenter le produit.

## Forces

- Positionnement clair pour chefs/officiers de guildes de jeux de strategie mobile.
- Differenciation par modules metier tres concrets: SOS attaque, banque, wars, recrutement, chat public, traduction.
- Bon sentiment de "cockpit": l'utilisateur comprend qu'il peut piloter plusieurs guildes/mondes.
- Le recrutement et le site public peuvent servir de porte d'entree naturelle.

## Risques UX

- Densite elevee au premier ecran: interessant pour un power user, intimidant pour un nouveau chef de guilde.
- "Builder" ne raconte pas assez la valeur centrale. Un terme comme "Command Center", "Operations" ou "QG" vendrait mieux le produit.
- Les boutons icones de la barre haute ont parfois des noms accessibles absents ou peu explicites dans le snapshot.
- La route publique doit etre fiable en acces direct, car elle porte l'acquisition et le partage.

## Risques accessibilite visibles

- Plusieurs petits textes gris sur fond sombre peuvent etre limites en contraste selon l'ecran.
- Certains boutons icones semblent sans libelle accessible visible dans le snapshot.
- Les tables/grilles larges sont bien adaptees au desktop, mais doivent rester manipulables au mobile et au zoom.
- Audit limite aux captures et snapshots DOM: pas de validation complete clavier/lecteur d'ecran.

## Recommandation produit

Oui, l'app peut interesser, surtout une niche precise: leaders, R4/R5, recruteurs et banquiers de guildes actives. Le bon angle n'est pas "un site de guilde", mais "le QG operationnel pour arreter de gerer une alliance dans 12 messages Discord epingles".

Priorites:

1. Stabiliser et verifier la page publique directe.
2. Renommer/clarifier le premier onglet autour des operations, pas seulement du builder.
3. Faire un onboarding court par role: chef, recruteur, war lead, banquier.
4. Montrer une demo en 60 secondes centree sur: publier une page, recevoir une candidature, confirmer une war, envoyer un SOS, repondre a `!banque`.
