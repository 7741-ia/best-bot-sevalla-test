// lib/groupRules.js
// Désactivé volontairement (demande utilisateur) :
// le bot ne doit PLUS répondre automatiquement dans un groupe
// lorsqu'une personne enfreint les règles de la description.
// Le fichier est conservé pour ne pas casser d'éventuels imports,
// mais handleGroupRulesCheck ne fait plus rien.

async function getGroupRules() {
    return '';
}

async function handleGroupRulesCheck() {
    // Toujours silencieux : aucune réponse IA liée aux règles.
    return false;
}

module.exports = { getGroupRules, handleGroupRulesCheck };
