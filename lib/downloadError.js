function getStatusCode(error) {
    return error?.response?.status || error?.status || null;
}

function shouldRetryDownloadError(error) {
    const status = getStatusCode(error);
    if (!status) return true;
    return status === 408 || status === 425 || status === 429 || status >= 500;
}

function formatDownloadError(error, label = 'Download') {
    const status = getStatusCode(error);

    if (status === 402) {
        return `❌ ${label}: service externe indisponible ou quota/paiement requis. Réessaie plus tard.`;
    }
    if (status === 403) {
        return `❌ ${label}: téléchargement refusé par la source. Essaie un autre lien.`;
    }
    if (status === 404) {
        return `❌ ${label}: lien invalide ou média introuvable.`;
    }
    if (status === 429) {
        return `❌ ${label}: trop de requêtes pour le moment. Réessaie dans quelques minutes.`;
    }
    if (status && status >= 500) {
        return `❌ ${label}: le serveur externe est en panne. Réessaie plus tard.`;
    }
    if (error?.code === 'ECONNABORTED') {
        return `❌ ${label}: délai d'attente dépassé. Réessaie plus tard.`;
    }
    if (error?.code === 'ENOTFOUND' || error?.code === 'EAI_AGAIN') {
        return `❌ ${label}: problème réseau vers le service externe.`;
    }

    return `❌ ${label}: échec du téléchargement. Réessaie plus tard ou avec un autre lien.`;
}

module.exports = {
    getStatusCode,
    shouldRetryDownloadError,
    formatDownloadError
};
