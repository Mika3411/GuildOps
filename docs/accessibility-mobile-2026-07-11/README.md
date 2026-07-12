# Audit accessibilite mobile - 2026-07-11

## Portee

- Surface verifiee : cockpit mobile `/app/site`.
- Viewport utilise : 390 x 844.
- Capture : `01-mobile-site-cockpit.png`.

## Constat avant correction

- Les elements desktop `.sidebar` et `.topbar` restent bien dans le DOM, mais sont `display: none` au breakpoint mobile.
- L'arbre d'accessibilite Chrome ne remontait pas les libelles desktop comme `Multi-guildes / mondes`, `Ajouter une guilde`, `URL du site`, `Aide` ou `Deconnexion`.
- Deux sources de bruit mobile etaient presentes :
  - l'ordre DOM commencait par les champs de configuration alors que l'ecran mobile affichait d'abord la checklist de demarrage ;
  - le rail mobile haut repetait `Site`, `Boutique`, `Compte` alors que la barre mobile basse exposait deja ces destinations ;
  - le bloc `Invitation membres` utilisait un `details` ferme, mais le style `.generated-invite-row` pouvait forcer l'affichage/focus de ses champs.

## Corrections appliquees

- La checklist est maintenant placee avant les champs dans le DOM.
- La grille desktop utilise des zones CSS pour conserver le rendu sans casser l'ordre mobile.
- Les champs du `details` ferme sont forces a `display: none`.
- Le rail mobile haut est retire de l'arbre lecteur d'ecran et de la tabulation ; la barre basse reste la navigation mobile canonique.
- Les icones d'aide ne sont plus des arrets de tabulation separes.

## Verifications

- `npm run build` : OK.
- `git diff --check` : OK.
- Limite : le Browser integre s'est detache avant la recapture post-correction, donc la capture disponible documente l'etat inspecte avant correction.
