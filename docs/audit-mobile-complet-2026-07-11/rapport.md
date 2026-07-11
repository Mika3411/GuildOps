# Audit mobile complet - GuildOps - 2026-07-11

Périmètre: audit UI/UX mobile à 390 x 844 px sur `http://127.0.0.1:5173`, via le navigateur intégré Codex.

## Verdict

L'interface mobile a une identité forte, une bonne cohérence visuelle et pas de débordement horizontal visible sur les écrans capturés. Le socle est solide.

Les risques principaux sont:

- Le CTA public `Devenir membre` mène à un état bloquant: `Invitation introuvable` / `Guild site not found`.
- `Espace membre` semble accessible sans étape de connexion visible; à vérifier côté produit et permissions.
- Plusieurs contrôles importants sont sous 44 px de haut: actions de site public, onglets auth, bouton principal auth, bouton oeil du mot de passe, checkbox notifications.
- Le gate `/app` empêche l'audit de l'espace privé authentifié dans cette passe.
- Certains libellés et placeholders sont coupés ou très denses sur mobile.

## Étapes Auditées

1. Accueil landing - Bon état.
   - H1 clair, CTA principaux lisibles, menu mobile présent, aucun overflow horizontal.
   - Le premier écran reste très chargé: quatre CTA plus aperçu cockpit juste après.

2. Menu mobile landing - Bon état.
   - Le menu donne bien accès aux liens cachés.
   - Les actions sont grandes et lisibles. L'état ouvert pousse cependant fortement le hero vers le bas.

3. Section produit landing - Correct.
   - La transition site public -> opérations privées est compréhensible.
   - Le bouton `Voir les consignes` mesure 38 px de haut, sous la cible tactile recommandée.

4. Aperçu cockpit / fin landing - Bon état.
   - Les cartes d'activité sont lisibles.
   - Le texte long `Rallye detecte sur Fortere...` est tronqué; acceptable pour une carte, mais à surveiller si l'information complète est critique.

5. Galerie accueil - Bon état.
   - Les stats sont compactes, les filtres sont visibles dans le premier écran.
   - Le placeholder de recherche est tronqué; prévoir un label ou placeholder plus court.

6. Galerie résultats - Correct.
   - La carte de guilde est claire et visuelle.
   - L'action d'ouverture repose surtout sur la carte entière; ajouter une affordance explicite aiderait.

7. Sélecteur de langue - Correct, à simplifier.
   - Le champ de recherche et les options sont utilisables.
   - La liste affiche beaucoup de codes non disponibles alors qu'une seule langue est disponible, ce qui alourdit le choix.

8. Site public accueil - Bon visuel, navigation à améliorer.
   - Le hero est très fort et les CTA principaux sont visibles.
   - Les actions hautes `Galerie`, `Devenir membre`, `Espace membre` font 36 px de haut.

9. Site public contenu - Correct.
   - Les modules sont lisibles et scannables.
   - Le petit bouton `Ouvrir` du module forum fait 32 px de haut.

10. Parcours `Devenir membre` - Problématique.
    - Le lien public arrive sur `Invitation introuvable` / `Guild site not found`.
    - Le message `Chargement de la guilde...` reste visible en même temps que l'erreur, ce qui rend l'état contradictoire.

11. Page équipe publique - Correct.
    - La page explique bien l'absence de roster publié.
    - Les actions hautes restent trop basses en hauteur tactile; `Retour accueil` est à 42 px.

12. Forum public - Correct.
    - L'état verrouillé est clair et rassurant.
    - Les boutons `Retour accueil`, `Espace membre` sont autour de 42 px; les actions hautes restent à 36 px.

13. Espace membre public - À vérifier.
    - La page affiche un formulaire de profil directement.
    - Si cet espace doit être réservé aux membres connectés, il manque un gate clair. Si c'est volontaire, il faut le contextualiser.

14. Connexion - Correct, mais contrôles trop petits.
    - Formulaire lisible, champs confortables.
    - Onglets et bouton `Entrer` à 38 px; bouton oeil à 34 px; pas de retour public ni récupération mot de passe visible.

15. Inscription - Correct, mais dense.
    - Les champs sont lisibles.
    - Onglets et bouton principal à 38 px, bouton oeil à 34 px, checkbox à 18 px; exigences mot de passe non visibles.

16. Entrée `/app` - Bloquée par authentification.
    - L'app privée redirige vers le login.
    - L'espace authentifié, le header mobile privé et la bottom nav privée n'ont pas pu être audités sans session.

## Priorités

1. Corriger le lien `Devenir membre` pour qu'il ouvre un vrai parcours d'adhésion ou une erreur récupérable avec retour.
2. Clarifier/gater `Espace membre` selon l'intention produit.
3. Passer les contrôles clés à au moins 44 px de haut.
4. Ajouter des chemins de récupération sur auth: retour galerie/public, mot de passe oublié, messages de validation.
5. Simplifier le sélecteur de langue en mettant les langues disponibles en premier et en masquant les langues indisponibles par défaut.
6. Faire une passe séparée sur l'espace privé après authentification.

## Limites

Cet audit est basé sur captures + mesures DOM visibles. Il ne prouve pas la conformité WCAG complète, la qualité lecteur d'écran, la navigation clavier complète, les permissions serveur, ni les comportements d'une session authentifiée.
