# Prompts de correction - Audit mobile GuildOps

## Prompt 1 - Réparer le parcours Devenir membre

Corrige le parcours mobile `Devenir membre` depuis une page publique de guilde.

Contexte:
- Sur `/g/aegis-nord`, le CTA `Devenir membre` pointe vers `/join/aegis-nord`.
- Sur mobile, cette route affiche `Invitation introuvable` / `Guild site not found`, tout en gardant `Chargement de la guilde...`.

Objectif:
- Le lien doit ouvrir un parcours d'adhésion fonctionnel pour une guilde publiée.
- Si l'adhésion n'est pas disponible, afficher un état d'erreur clair avec retour vers la page publique.

À vérifier:
- `/g/aegis-nord` -> `Devenir membre` fonctionne.
- L'état de chargement disparaît quand l'erreur est affichée.
- Le message explique quoi faire ensuite.
- La mise en page mobile reste sans overflow horizontal.

Fichiers probables:
- `src/components/layout/join/JoinGuildRoute.jsx`
- `src/hooks/useGuildOpsController.js`
- `src/lib/guildSiteStore.js`
- `src/components/command/CommandViews.jsx`

Validation:
- Capturer `/join/aegis-nord` en 390 x 844.
- Tester aussi un slug inexistant.

## Prompt 2 - Clarifier et sécuriser Espace membre

Audit et corrige l'accès mobile à `Espace membre` sur les sites publics.

Contexte:
- `/g/aegis-nord/espace-membre` affiche directement un formulaire de profil.
- L'intention produit n'est pas claire: espace public modifiable ou espace réservé aux membres connectés.

Objectif:
- Si l'espace est privé, ajouter un gate explicite avec connexion/adhésion.
- Si l'espace est public, expliquer clairement que le formulaire est local ou temporaire.
- Éviter toute impression d'accès membre sans autorisation.

À vérifier:
- Le CTA `Espace membre` mène à un état compréhensible.
- Les actions proposées sont cohérentes: se connecter, devenir membre, retour accueil.
- Aucun formulaire sensible n'est affiché sans contexte.

Fichiers probables:
- `src/components/member/MemberSpaceView.jsx`
- `src/components/command/CommandViews.jsx`
- `src/hooks/guildOpsController/buildGuildOpsControllerProps.js`

Validation:
- Capturer `/g/aegis-nord/espace-membre` en mobile.
- Vérifier le comportement connecté et non connecté si possible.

## Prompt 3 - Mettre les contrôles mobiles à au moins 44px

Corrige les tailles tactiles mobiles sous 44 px relevées dans l'audit.

Contexte:
- Actions hautes du site public: `Galerie`, `Devenir membre`, `Espace membre` à 36 px.
- Auth: onglets et bouton principal à 38 px.
- Bouton oeil mot de passe à 34 px.
- Checkbox notifications à 18 px.
- Certains boutons secondaires autour de 42 px.

Objectif:
- Tous les contrôles interactifs importants doivent faire au moins 44 x 44 px.
- Ne pas casser la densité mobile ni créer d'overflow.

À vérifier:
- Landing, galerie, site public, forum, équipe, espace membre, login, register.
- États hover/focus visibles et propres.
- Texte centré verticalement après changement de hauteur.

Fichiers probables:
- `src/styles/auth.css`
- `src/styles/base.css`
- `src/styles/site-builder.css`
- `src/styles/responsive.css`
- `src/styles/landing.css`

Validation:
- Mesurer les contrôles dans un viewport 390 x 844.
- Capturer login, register, site public et forum.

## Prompt 4 - Améliorer la récupération des écrans auth

Améliore les écrans mobiles de connexion et d'inscription.

Contexte:
- Les formulaires sont lisibles, mais il manque des chemins de récupération visibles.
- Aucun retour vers l'espace public ou galerie.
- Pas de mot de passe oublié visible.
- Les exigences de mot de passe ne sont pas explicites avant erreur.

Objectif:
- Ajouter des actions secondaires utiles sans surcharger l'écran:
  - Retour vers l'accueil ou la galerie.
  - Mot de passe oublié si supporté, sinon ne pas afficher de faux lien.
  - Aide ou exigence minimale de mot de passe sur inscription.
- Conserver une mise en page mobile compacte.

À vérifier:
- Login tient dans le viewport mobile.
- Register reste lisible et ne masque pas le CTA principal.
- Les erreurs API ou validation sont claires et non contradictoires.

Fichiers probables:
- `src/components/layout/auth/AuthViews.jsx`
- `src/styles/auth.css`

Validation:
- Capturer `/auth/login` et `/auth/register` en 390 x 844.
- Tester champs vides, email invalide et erreur API.

## Prompt 5 - Simplifier le sélecteur de langue de la galerie

Optimise le sélecteur de langue mobile dans la galerie.

Contexte:
- Une seule langue disponible dans l'état audité, mais la liste affiche un très grand nombre de langues.
- Le choix est plus lourd que nécessaire.

Objectif:
- Mettre les langues disponibles en haut.
- Masquer ou replier les langues indisponibles par défaut.
- Garder une recherche si l'utilisateur veut chercher dans toutes les langues.

À vérifier:
- Avec une seule langue disponible, `Français (FR)` doit être immédiatement évident.
- La sélection et la réinitialisation restent simples.
- Le popover reste dans le viewport et ne masque pas les résultats de façon gênante.

Fichiers probables:
- `src/components/landing/PublicGuildGallery.jsx`
- `src/styles/landing.css`

Validation:
- Capturer galerie filtres + popover ouvert en mobile.
- Tester avec recherche `fr`, `en`, et valeur vide.

## Prompt 6 - Rendre les cartes de résultats plus actionnables

Améliore la découvrabilité de l'ouverture d'une guilde depuis la galerie mobile.

Contexte:
- La carte de résultat est visuelle et claire, mais l'action repose surtout sur la carte entière.
- L'affordance d'ouverture peut être renforcée.

Objectif:
- Ajouter une action explicite, par exemple `Voir la guilde`, sans surcharger la carte.
- Garder la carte entière cliquable si c'est déjà le comportement attendu.
- Assurer un état focus visible et un label accessible.

À vérifier:
- La carte reste lisible en 390 px.
- L'action ne crée pas de saut de layout.
- Les liens conservent des noms accessibles explicites.

Fichiers probables:
- `src/components/landing/PublicGuildGallery.jsx`
- `src/styles/landing.css`

Validation:
- Capturer `/guildes` au niveau des résultats.
- Tester navigation vers `/g/aegis-nord`.

## Prompt 7 - Corriger les textes tronqués et placeholders mobiles

Fais une passe de microcopy mobile pour éviter les textes tronqués visibles.

Contexte:
- Le placeholder de recherche galerie est coupé.
- Certaines cartes d'activité tronquent l'information.
- Plusieurs labels longs occupent beaucoup de largeur.

Objectif:
- Raccourcir les placeholders mobiles.
- Ajouter des labels visibles ou `aria-label` quand le placeholder est abrégé.
- Ne pas réduire la taille de police au point de nuire à la lisibilité.

À vérifier:
- Galerie recherche.
- Aperçu cockpit landing.
- Cartes publiques avec titres longs.

Fichiers probables:
- `src/components/landing/LandingPage.jsx`
- `src/components/landing/PublicGuildGallery.jsx`
- `src/styles/landing.css`

Validation:
- Capturer accueil, galerie et aperçu cockpit en mobile.

## Prompt 8 - Audit et correction de l'espace privé authentifié

Une fois une session de test disponible, audite et corrige l'espace privé mobile.

Contexte:
- L'audit actuel ne peut pas aller au-delà de `/app`, qui redirige vers login.
- Les composants privés existent: header mobile, bottom nav, modules, banque, messages, forum, etc.

Objectif:
- Tester l'app privée connectée à 390 x 844.
- Vérifier header mobile, bottom nav, navigation modules, listes, formulaires et états d'erreur.
- Corriger les zones tactiles, recouvrements et scrolls internes.

À vérifier en priorité:
- `/app`
- `/app/modules`
- messages
- banque
- forum
- espace membre

Fichiers probables:
- `src/App.jsx`
- `src/components/GuildOpsViews.jsx`
- `src/components/layout/navigation/LayoutNavigation.jsx`
- `src/styles/app-shell.css`
- `src/styles/responsive.css`

Validation:
- Captures mobiles avant/après sur les écrans principaux.
- Vérifier absence d'overflow horizontal et lisibilité des bottom nav items.

## Prompt 9 - Corriger l'état API indisponible

Améliore les états d'erreur quand l'API distante est indisponible.

Contexte:
- Selon la configuration, l'auth peut afficher une erreur de connexion API.
- L'utilisateur n'a pas toujours de chemin évident pour revenir au public ou réessayer.

Objectif:
- Afficher un état d'erreur clair, compact et actionnable.
- Proposer `Réessayer`, `Retour accueil`, et éventuellement `Galerie`.
- Ne pas laisser des états contradictoires comme chargement + erreur.

À vérifier:
- Login, register, join route, app gate.
- Les boutons sont >= 44 px.
- L'erreur est annoncée visuellement et via `aria-live` si pertinent.

Fichiers probables:
- `src/components/layout/auth/AuthViews.jsx`
- `src/components/layout/join/JoinGuildRoute.jsx`
- `src/styles/auth.css`

Validation:
- Simuler API indisponible.
- Capturer les états erreur en mobile.

## Prompt 10 - Refaire un audit mobile de validation après corrections

Après corrections, refais un audit mobile de validation.

Périmètre:
- Viewport 390 x 844.
- Accueil landing + menu.
- Galerie + résultats + sélecteur langue.
- Site public accueil + équipe + forum + espace membre.
- Devenir membre.
- Connexion + inscription.
- `/app` connecté si une session de test est disponible.

Critères d'acceptation:
- Aucun overflow horizontal.
- Aucun contrôle important sous 44 px.
- `Devenir membre` ne mène plus à une impasse.
- Les états erreur ne combinent pas chargement et erreur.
- Les routes privées/publiques sont clairement séparées.
- Captures avant/après sauvegardées dans `docs/`.
