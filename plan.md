# Plan — BestBot multi-session

## Objectif demandé
Créer une nouvelle version du projet BestBot pouvant recevoir des appairages WhatsApp depuis une page publique. L’espace d’administration, accessible à `/Best_bot_admin`, est protégé. Il doit permettre à l’administrateur de consulter les numéros et états de toutes les sessions, de diagnostiquer les erreurs et de déconnecter ou redémarrer une session individuelle. Le site reprend l’ambiance sombre et les accents verts du site de référence, sans en copier la marque ni les contenus. Il affiche les liens fournis vers le groupe et la chaîne WhatsApp. L’application sera préparée pour un nouveau compte Sevalla, sans modifier le bot actuellement en production.

## Conception retenue
- Le serveur Node parent fournit la page publique, l’API d’appairage, l’interface admin et l’API admin.
- Chaque numéro utilise un processus worker isolé, avec son propre socket Baileys et ses répertoires d’authentification et de données persistantes. Les commandes du bot ne partagent donc pas un socket global entre numéros.
- Le code d’appairage est renvoyé uniquement au navigateur qui a initié cette session au moyen d’un jeton aléatoire à durée de vie limitée. Les codes ne sont pas conservés dans le registre sur disque ni exposés dans le panneau admin.
- L’admin voit les numéros, états et erreurs techniques filtrées, mais pas le contenu des conversations. Le mot de passe et le secret de cookie sont lus depuis les variables d’environnement Sevalla; aucune valeur de connexion ne sera écrite dans le dépôt.
- Les données de sessions sont conservées sous un répertoire configurable. Pour la production, Sevalla devra monter un disque persistant et définir `MULTISESSION_DATA_DIR` vers ce point de montage.
- La page publique est limitée par une limite de sessions configurable et une protection de débit. Les clés API déjà présentes dans le code restent inchangées à la demande de l’utilisateur.

## Organisation principale
- `index.js` : serveur HTTP, routage statique, authentification admin, APIs publiques/admin, démarrage et supervision des workers.
- `session-worker.js` : logique WhatsApp d’une seule session, modifiée pour communiquer son état par IPC et accepter un arrêt/déconnexion ciblé.
- `lib/multisession-store.js` : registre JSON atomique des sessions et informations de diagnostic non sensibles.
- `public/` : page publique, page admin et styles responsives.
- `tests/` : tests de stockage, contrôle d’accès, validation des numéros et limites.

## Variables privées à configurer sur le nouveau Sevalla
`ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `OWNER_NUMBER`, `MULTISESSION_DATA_DIR` et éventuellement `MAX_SESSIONS`. Les valeurs restent absentes de GitHub; `.env.example` n’inclut que des champs vides. Le mot de passe partagé dans la conversation doit être remplacé avant production.
