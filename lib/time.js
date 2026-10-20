const settings = require('../settings');

const DEFAULT_TIMEZONE = settings.timezone || 'Africa/Lubumbashi';
const DEFAULT_LOCALE = settings.locale || 'fr-FR';

function normalizeDateInput(date) {
    if (date === undefined || date === null || date === '') {
        return new Date();
    }

    if (date instanceof Date) {
        return Number.isNaN(date.getTime()) ? new Date() : date;
    }

    if (typeof date === 'number') {
        return new Date(date < 1e12 ? date * 1000 : date);
    }

    if (typeof date === 'string') {
        const trimmed = date.trim();
        if (!trimmed) return new Date();

        if (/^\d+$/.test(trimmed)) {
            const numeric = Number(trimmed);
            return new Date(numeric < 1e12 ? numeric * 1000 : numeric);
        }

        const parsed = new Date(trimmed);
        return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    }

    const parsed = new Date(date);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function formatRdcDate(date = new Date(), options = {}) {
    return normalizeDateInput(date).toLocaleString(DEFAULT_LOCALE, {
        timeZone: DEFAULT_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        ...options
    });
}

module.exports = {
    DEFAULT_TIMEZONE,
    DEFAULT_LOCALE,
    formatRdcDate,
    normalizeDateInput
};
