# GuildOps audit rapide - 2026-07-11

## Verdict

GuildOps a un vrai potentiel produit. La promesse est claire: un QG operationnel pour remplacer les messages Discord epingles et centraliser site public, membres, wars, SOS, banque et diplomatie.

Le point fort principal est le positionnement: l'app parle a une niche precise et douloureuse, les chefs/officiers de guildes actives. Le point faible principal est la confiance au premier essai: la galerie, la page publique d'exemple et l'entree builder affichent des erreurs API ou des etats vides.

## Etapes observees

1. Accueil desktop: fort. Hero clair, univers visuel coherent, demo produit concrete.
2. Galerie publique: faible en l'etat. Endpoint distant `/api/v1/directory/guilds` renvoie 500, galerie vide.
3. Inscription: structure propre, mais message API impossible avant action utilisateur.
4. Entree builder: faible pour la demo. Renvoie vers auth avec erreur API.
5. Page publique `/g/aegis-nord`: faible. Route en 404 cote API distante et message "Site de guilde introuvable".
6. Accueil mobile: bon. Repli responsive clair, CTA visibles; header mobile a surveiller sur petits ecrans.

## Priorites recommandees

1. Garantir une demo publique stable: au moins une guilde exemple toujours visible.
2. Corriger `/api/v1/directory/guilds` en production.
3. Remplacer les erreurs API visibles par des etats orientes utilisateur quand l'API est indisponible.
4. Ajouter un vrai mode "Tester le builder" sans compte ou avec demo seedee.
5. Garder le positionnement "QG de guilde" plutot que "builder", qui sous-vend la valeur operationnelle.

## Captures

- `01-landing-viewport.png`
- `02-galerie.png`
- `03-inscription.png`
- `04-app-entry.png`
- `05-public-aegis-nord.png`
- `06-landing-mobile.png`
