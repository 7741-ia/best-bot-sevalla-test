# Rapport d’audit technique — Best Bot

**Date :** 14 octobre 2026
**Dépôt :** `7741-ia/best-bot-v33` (privé)
**Périmètre :** configuration des secrets, routage WhatsApp, contrôles de commandes, API chat, files planifiées, médias, scripts npm et installation.

## Synthèse

Des défauts de sécurité et de fiabilité confirmés ont été corrigés sur la branche de travail. À la demande du propriétaire, `.env` et `config.js` sont conservés exactement comme dans `main`, afin de préserver les valeurs et le mapping API existants. L’API chat est protégée par jeton, les lots de messages sont traités un par un, et plusieurs commandes sont maintenant soumises à des contrôles d’accès exacts.

Les tests locaux et une installation propre passent. **L’audit npm signale toutefois encore 21 vulnérabilités de production**, dont cinq critiques et neuf élevées. Elles ne sont pas masquées par une mise à jour majeure forcée, car celle-ci peut casser des composants centraux.

## Correctifs appliqués

| Domaine | Constat | Correction |
|---|---|---|
| Secrets et compatibilité | `.env` et les clés historiques de `config.js` font partie de l’installation existante. | Les fichiers `.env` et `config.js` de la branche sont identiques à `main`; aucun secret n’a été affiché ou modifié. Le modèle `.env.example` est facultatif et ne remplace pas le fichier existant. |
| Historique Git | `.env` et des clés historiques restent présents dans le dépôt privé et son historique. | Conservés à la demande; aucune réécriture d’historique ni force-push. Une migration vers les secrets de l’hébergeur doit être planifiée séparément, avec mapping vérifié. |
| API chat | Le handler acceptait des requêtes sans authentification et sans plafond de prompt. | Bearer token `CHAT_API_TOKEN` obligatoire (au moins 24 caractères), comparaison en temps constant, limite de 20 requêtes/minute par adresse, plafond de 4 000 caractères, réponses génériques et serveur local `start:chat-api`. `POST` est privilégié; `GET` reste compatible. |
| Messages WhatsApp | Un événement `messages.upsert` ne traitait que le premier élément du lot; les retours prématurés pouvaient abandonner les suivants. | Traitement individuel et séquentiel de chaque message, avec erreurs isolées par élément. |
| Contrôle des commandes | Les préfixes `.antitag`, `.en`, `.fr` et traduction pouvaient intercepter des noms voisins; `.warnings` et `.clear` n’avaient pas de garde cohérente dans le dispatch. | Correspondance de commandes bornée et vérifications de rôle/groupe renforcées. |
| Messages programmés | Un envoi échoué supprimait le travail de la file; les délais supérieurs à la limite Node pouvaient expirer incorrectement. | Conservation et nouvelle tentative après échec, protection contre les doubles envois et temporisation fractionnée. |
| Médias | `.url` accumulait des flux sans plafond et laissait temporairement des fichiers locaux. | Limite de 25 Mo, validation de la taille déclarée et reçue, extensions de document filtrées, noms temporaires aléatoires et suppression immédiate après l’upload. |
| Arrêt du bot | SIGINT/SIGTERM quittaient immédiatement le processus. | Flush du store, annulation du timer de reconnexion, fermeture du socket et libération du verrou avant arrêt. |
| Scripts et livraison | Plusieurs commandes npm pointaient vers des fichiers absents ou une commande Docker mal formée. | Scripts raccordés, nettoyage limité aux fichiers temporaires expirés, reset de session refusé sans confirmation et sauvegardé par renommage, `Dockerfile`/`.dockerignore` et CI GitHub ajoutés. |
| Lockfile | La version racine du lockfile ne correspondait pas au manifeste. | Lockfile normalisé à la version du manifeste; installation propre validée avec les options peer-dependencies déjà nécessaires au projet. |

## Validation effectuée

- `npm ci --legacy-peer-deps` : **réussi** (installation propre de 528 paquets).
- `npm test` : **réussi**, 18 tests Node.js passés et contrôles KCEY hors mode live réussis.
- Vérification `node --check` de tous les fichiers JavaScript : **réussie**.
- `npm ci --dry-run --legacy-peer-deps` : **réussi**.
- `git diff --check` : **réussi**.
- Test de sûreté de `reset-session.js` sans `--confirm` : refus attendu, aucune session déplacée.
- Aucune action réelle WhatsApp n’a été effectuée. Le build Docker n’a pas pu être exécuté, car le CLI Docker n’est pas installé dans l’environnement de validation.

**Note sur une première exécution de test :** un test nouvellement ajouté utilisait d’abord le mauvais nom de paramètre pour son faux fournisseur; le handler par défaut a donc été invoqué au lieu du stub. Il a répondu à une salutation. Le test a été corrigé et toute la suite finale passe avec un fournisseur factice. Comme le handler par défaut pouvait utiliser les fournisseurs configurés, un appel réseau fournisseur lors de cette première exécution ne peut pas être exclu. Aucun message WhatsApp n’a été envoyé.

## Risques restant à traiter

### Vulnérabilités de dépendances

`npm audit --omit=dev` signale **21 vulnérabilités de production** : 5 critiques, 9 élevées et 7 modérées. Les paquets signalés comprennent notamment `form-data`, `jsonpath-plus`, `protobufjs`, `request`, `youtube-yts`, `@whiskeysockets/baileys`, `libsignal`, `sharp` et `yt-search`.

`npm audit fix` sans `--force` n’a pas pu résoudre ces vulnérabilités; certains correctifs proposés exigent des changements majeurs (par exemple `libsignal` et `sharp`) ou un remplacement de dépendance. Aucun changement forcé n’a été appliqué. Une migration dédiée doit être suivie de tests de compatibilité Baileys, médias et téléchargements.

### Rotation et historique des secrets

À la demande du propriétaire, `.env` demeure identique à `main`; les secrets restent donc dans le dépôt privé et son historique. Pour une amélioration ultérieure, migrer les clés vers le coffre de secrets de Sevalla après avoir vérifié chaque variable et son usage; la présente mise à jour ne change pas les clés. Aucune réécriture d’historique ni force-push n’a été faite.

### Limites de couverture

Le dépôt comprend de nombreuses commandes et intégrations externes. Les changements ci-dessus ciblent les défauts reproductibles et les chemins prioritaires de l’audit; la suite ne simule pas une session WhatsApp connectée, les comportements réels des fournisseurs ou un build Docker. La CI ajoutée devra être vérifiée après son exécution sur GitHub.
