# Prompts de correction - audit mobile connecte

Ces prompts sont prets a coller dans Codex. Ils sont separes pour faciliter une correction progressive sans tout refactorer d'un coup.

## Prompt 1 - Corriger l'onboarding mobile rempli

Corrige le layout mobile du formulaire de creation de guilde/onboarding. Sur viewport 390 x 844, le formulaire rempli ne doit jamais etre coupe horizontalement ni donner l'impression d'un contenu decale. Verifie les champs longs, le scroll jusqu'au CTA, les messages de validation et l'etat de soumission. Ajoute ou ajuste des tests/responsiveness checks si le projet en contient. Capture avant/apres sur mobile.

## Prompt 2 - Simplifier le header mobile connecte

Reduis la hauteur utile du header connecte sur mobile. Conserve l'identite GuildOps et les actions essentielles, mais evite l'empilement permanent header + carte guilde + onglets + hero. Propose un etat compact apres scroll ou sur les routes internes. La premiere vue mobile doit montrer plus de contenu actionnable sans perdre le contexte de guilde.

## Prompt 3 - Repenser la bottom nav mobile

Revois la navigation basse mobile qui contient 7 destinations. Garde les destinations prioritaires visibles et deplace les secondaires dans un menu Plus ou un drawer. Chaque item doit avoir une zone tactile confortable, un etat actif clair, et des libelles qui ne se serrent pas sur 390 px. Verifie les routes Site, Boutique, Compte, Absences, Messages, Admin, Modules et Parametres.

## Prompt 4 - Agrandir les cibles tactiles

Audit et corrige les cibles tactiles trop petites dans les routes privees mobile, notamment Messages, Boutique, Modules et Parametres. Vise des zones proches de 44 x 44 px pour icones, onglets, filtres, boutons, toggles et items de navigation. Ne grossis pas seulement l'icone : agrandis la zone cliquable et conserve un alignement propre.

## Prompt 5 - Nettoyer les titres dupliques

Supprime les doublons de titres dans les pages privees mobile. Exemple observe : "ESPACE ESPACE MEMBRE" puis "ESPACE MEMBRE". Definis une regle simple : un eyebrow optionnel court + un H1 unique, sans repetition du mot "ESPACE". Applique-la aux pages Compte, Messages, Absences, Boutique, Admin, Parametres et Modules.

## Prompt 6 - Creer un hero mobile compact pour les pages utilitaires

Ajoute une variante mobile compacte du hero de section pour les pages utilitaires connectees. Sur mobile, le hero ne doit pas repousser les cartes importantes sous la ligne de flottaison. Garde l'ambiance visuelle GuildOps, mais reduis hauteur, decorations et badges. Les pages Messages, Absences, Admin et Parametres doivent afficher l'action ou la donnee principale plus haut.

## Prompt 7 - Renforcer les etats vides actionnables

Ameliore les etats vides mobiles des sections Messages, Absences, Boutique et Admin. Chaque etat vide doit indiquer clairement ce qui se passe, pourquoi c'est normal pour une nouvelle guilde, et proposer une action primaire visible : envoyer un message, declarer une absence, configurer une offre, inviter un membre ou ouvrir les parametres.

## Prompt 8 - Verifier contraste, focus et lecture mobile

Fais une passe accessibilite mobile sur les pages connectees. Verifie contraste texte/fond texture, ordre des titres, labels de boutons icones, focus visible, navigation clavier, et annonces d'etats comme "0 non lus" ou "Email valide". Corrige les composants partages plutot que chaque page individuellement quand c'est possible.

## Prompt 9 - Ajouter une verification mobile automatisee

Ajoute un script ou une suite de verification mobile qui ouvre les routes connectees principales en viewport 390 x 844 et detecte : debordement horizontal, petites cibles tactiles, contenu masque par la bottom nav, et titres dupliques visibles. Les routes minimales a couvrir sont /app/modules, /app/member, /app/messages, /app/absences, /app/shop, /app/admin et /app/settings.

## Prompt 10 - Faire une passe finale de QA visuelle

Apres les corrections, relance une QA visuelle mobile complete avec captures avant/apres. Compare onboarding, app privee, modules, compte, messages, absences, boutique, admin et parametres. Le resultat attendu : pas de crop horizontal, navigation moins dense, cibles tactiles confortables, un titre clair par page, et une action primaire visible dans chaque ecran vide.
