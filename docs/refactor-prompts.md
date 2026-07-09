# GuildOps Refactor Prompts

Ces prompts sont faits pour poursuivre le refactor de GuildOps par petites passes vérifiables. Ils partent de l'état actuel: `src/App.jsx` orchestre encore beaucoup d'état, tandis que les vues sont dans `src/components/GuildOpsViews.jsx`, les transformations dans `src/lib/guildOpsTransforms.js`, et la configuration UI dans `src/config/guildOpsConfig.js`.

## Prompt 1 - Extraire le contrôleur applicatif

```text
Refactorise le frontend GuildOps sans changer le comportement utilisateur.

Objectif:
- Extraire la majorité de l'état applicatif, des effets, handlers et appels API encore présents dans `src/App.jsx` vers un hook `src/hooks/useGuildOpsController.js`.
- `App.jsx` doit devenir un coordinateur mince: auth/loading/public route + rendu layout + props venant du hook.
- Ne modifie pas les vues ni les libellés UI sauf si c'est nécessaire pour corriger une casse du refactor.

Contraintes:
- Garde les signatures de props de `ViewRouter`, `Sidebar`, `TopBar`, `MobileHeader` et `MobileBottomNav` aussi stables que possible.
- Ne change pas les routes publiques ni la logique `getPublicRouteSlug`.
- Ne supprime pas les fallbacks mock/API.
- Ne touche pas aux changements non liés.

Validation:
- Lance `npm run build`.
- Lance un smoke test local sur la page d'accueil et vérifie qu'il n'y a pas d'erreur console.
- Donne le nombre de lignes final de `src/App.jsx` et du nouveau hook.
```

## Prompt 2 - Découper les vues par domaine

```text
Continue le refactor React GuildOps avec une extraction mécanique des vues.

Objectif:
- Découper `src/components/GuildOpsViews.jsx` en modules par domaine:
  - `src/components/layout/`
  - `src/components/command/`
  - `src/components/membership-requests/` ou le dossier admin existant qui porte la vue Adhésions
  - `src/components/wars/`
  - `src/components/bank/`
  - `src/components/diplomacy/`
  - `src/components/messages/`
  - `src/components/forum/`
  - `src/components/shared/`
- Garder un fichier barrel optionnel `src/components/GuildOpsViews.jsx` seulement si cela réduit le risque de changer les imports existants.

Contraintes:
- Extraction mécanique d'abord: pas de redesign, pas de changement de markup volontaire, pas de renommage large.
- Les petits composants réutilisés (`Avatar`, `EmptyState`, `PanelHeader`, `RolePill`, `Field`) vont dans `shared`.
- Les composants de navigation/layout (`Sidebar`, `TopBar`, `MobileHeader`, `MobileBottomNav`) vont dans `layout`.
- Évite les imports circulaires.

Validation:
- Lance `npm run build`.
- Vérifie au moins les vues Builder, Wars, Banque, Messages et Forum dans le navigateur local.
- Résume les nouveaux fichiers créés et les composants qu'ils contiennent.
```

## Prompt 3 - Découper les transformations par domaine

```text
Refactorise les helpers purs de GuildOps.

Objectif:
- Découper `src/lib/guildOpsTransforms.js` en fichiers ciblés:
  - `src/lib/transforms/forum.js`
  - `src/lib/transforms/messages.js`
  - `src/lib/transforms/diplomacy.js`
  - `src/lib/transforms/events.js`
  - `src/lib/transforms/sos.js`
  - `src/lib/transforms/bank.js`
  - `src/lib/transforms/membershipRequests.js` si la normalisation des demandes d'adhésion est extraite
  - `src/lib/transforms/shared.js`
- Conserver un export central `src/lib/guildOpsTransforms.js` qui ré-exporte les fonctions, pour limiter le blast radius.

Contraintes:
- Ne change pas les valeurs retournées par les normaliseurs, builders ou formatters.
- Si deux domaines partagent une fonction, place-la dans `shared.js` plutôt que de dupliquer.
- Garde les dépendances externes près des modules qui les utilisent (`slugify`, `permissionRoles`, labels, options).

Validation:
- Lance `npm run build`.
- Ajoute ou prépare un petit script de checks de fonctions pures si le projet a déjà une convention de tests.
- Documente toute fonction qui reste dans `shared.js` parce qu'elle est utilisée par plusieurs domaines.
```

## Prompt 4 - Introduire des hooks par domaine

```text
Réduis le couplage de l'état frontend GuildOps en extrayant des hooks par domaine.

Objectif:
- À partir de `useGuildOpsController`, extraire des hooks ciblés:
  - `useMessagesController`
  - `useForumController`
  - `useDiplomacyController`
  - `useEventsController`
  - `useSosController`
  - `useBankController`
  - `useMembershipRequestsController`
- Chaque hook doit encapsuler l'état, les handlers et les appels API de son domaine.

Contraintes:
- Préserve l'objet de props final transmis à `ViewRouter` autant que possible.
- Passe explicitement les dépendances partagées: `apiEnabled`, `currentUser`, `selectedGuild`, `siteDraft`, `guildOpsData`, `authSession`.
- Ne crée pas de store global.
- Ne mélange pas refactor et changement fonctionnel.

Validation:
- Lance `npm run build`.
- Teste les interactions principales: check-in event, envoi message local/API fallback, création demande banque, sauvegarde relation diplomatie, création thread forum.
- Signale les flows non testés manuellement.
```

## Prompt 5 - Ajouter des garde-fous de non-régression

```text
Ajoute des garde-fous de non-régression pour le refactor GuildOps.

Objectif:
- Ajouter des tests ou scripts légers pour les helpers purs les plus risqués:
  - conversations/messages
  - forum category/thread/post normalization
  - diplomacy relation/NAP/coordinates normalization
  - event summary/timeline
  - SOS acknowledgements
  - bank amount/status formatting
- Si aucun runner de test n'existe, propose puis ajoute une solution minimale cohérente avec le projet.

Contraintes:
- Évite une grosse infrastructure de test.
- Les tests doivent couvrir les comportements actuels, pas imposer une nouvelle logique.
- Ne rends pas le build plus fragile ou plus lent sans raison.

Validation:
- Lance le nouveau script de test.
- Lance `npm run build`.
- Liste les domaines couverts et les domaines encore sans garde-fous.
```

## Prompt 6 - Nettoyer les frontières d'import

```text
Fais une passe de nettoyage des frontières d'import GuildOps après refactor.

Objectif:
- Vérifier que les composants n'importent pas directement des données mock si elles doivent venir des props.
- Vérifier que les hooks contrôleurs n'importent pas de composants UI.
- Vérifier que les transforms restent purs autant que possible.
- Réduire les barrels trop larges si cela améliore la lisibilité sans augmenter le risque.

Contraintes:
- Garde les modules orientés par domaine.
- Ne modifie pas les noms publics inutilement.
- Corrige les imports morts et les exports non utilisés.

Validation:
- Lance `npm run build`.
- Donne un court rapport: dépendances nettoyées, imports encore suspects, prochaine dette prioritaire.
```
