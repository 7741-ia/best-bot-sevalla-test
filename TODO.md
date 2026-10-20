# TODO — BestBot multi-session

## Page publique d’appairage
- [x] Interface sombre et responsive, avec consentement clair à l’appairage d’un compte autorisé.
- [x] Saisie du numéro international; code privé au navigateur demandeur via un jeton éphémère.
- [x] État, code renouvelé, erreurs; demande retrouvable après actualisation et annulation limitée à sa propre session.
- [x] Liens fournis vers le groupe et la chaîne WhatsApp.

## Gestion et espace admin
- [x] Un worker WhatsApp isolé et des dossiers d’authentification/données propres à chaque session.
- [x] Reprise des sessions persistées, états et diagnostics techniques; aucune conversation ne s’affiche dans l’admin.
- [x] Redémarrage ou déconnexion d’une session individuelle; protection CSRF des actions admin.
- [x] Limite configurable de sessions, limitation des demandes répétées et accès admin authentifié à `/Best_bot_admin`.
- [x] Les codes d’appairage et mots de passe ne sont pas écrits dans le registre ni le dépôt.

## Configuration et livraison
- [x] `.env` réel ignoré et non suivi; `.env.example` contient seulement des champs vides.
- [x] Les fichiers d’API privée du projet d’origine n’ont pas été modifiés.
- [x] Données isolées sous `MULTISESSION_DATA_DIR`; guide Sevalla avec disque persistant et variables privées.
- [x] Syntaxe, smoke test HTTP et suite existante/nouvelle validés (48 tests réussis).
- [x] Pousser la version finale sur le dépôt privé `best-bot-v33-multisession`; le déploiement du bot d’origine n’est pas modifié.
- [ ] Créer/configurer le service sur le nouveau compte Sevalla, ajouter les variables privées et monter le disque persistant.
