const axios = require('axios');
const { toFrench } = require('../lib/french');

const http = axios.create({ timeout: 15000, headers: { 'User-Agent': 'BestBot/1.0' } });

function argText(rawText, command) {
  return String(rawText || '').replace(new RegExp(`^\\.${command}\\s*`, 'i'), '').trim();
}

function usage() {
  return [
    '📚 *APIs disponibles*',
    '• `.api country France` — pays',
    '• `.api pokemon pikachu` — Pokémon',
    '• `.api crypto bitcoin` — crypto',
    '• `.api nasa` — image NASA du jour',
    '• `.api recipe pasta` — recette',
    '• `.api address 10 rue de Paris` — adresse GPS',
    '• `.api currency 100 EUR USD` — conversion',
    '• `.api short https://exemple.com` — lien court',
    '• `.api email test@example.com` — validation simple',
    '• `.api tmdb dune` — films (TMDB_API_KEY requis)',
    '• `.api weather Paris` — météo OpenWeather (OPENWEATHER_API_KEY requis)',
    '',
    'Raccourcis : `.country`, `.pokemon`, `.crypto`, `.nasa`, `.recipe`, `.address`, `.currency`, `.short`'
  ].join('\n');
}

function clean(value, fallback = 'N/A') {
  return value === undefined || value === null || value === '' ? fallback : String(value);
}

async function send(sock, chatId, message, text) {
  await sock.sendMessage(chatId, { text }, { quoted: message });
}

async function country(sock, chatId, message, query) {
  if (!query) return send(sock, chatId, message, 'Utilisation : `.api country France`');
  const { data } = await http.get(`https://restcountries.com/v3.1/name/${encodeURIComponent(query)}`);
  const c = data[0];
  const currencies = Object.values(c.currencies || {}).map(x => `${x.name} (${x.symbol || ''})`).join(', ');
  return send(sock, chatId, message, [
    `🌍 *${c.name?.common || query}*`,
    `Capitale : ${clean(c.capital?.[0])}`,
    `Région : ${clean(c.region)}`,
    `Population : ${Number(c.population || 0).toLocaleString('fr-FR')}`,
    `Superficie : ${Number(c.area || 0).toLocaleString('fr-FR')} km²`,
    `Monnaie : ${clean(currencies)}`,
    `Drapeau : ${clean(c.flag)}`
  ].join('\n'));
}

async function pokemon(sock, chatId, message, query) {
  if (!query) return send(sock, chatId, message, 'Utilisation : `.api pokemon pikachu`');
  const { data } = await http.get(`https://pokeapi.co/api/v2/pokemon/${encodeURIComponent(query.toLowerCase())}`);
  const types = data.types.map(x => x.type.name).join(', ');
  return send(sock, chatId, message, [`🎮 *${data.name.toUpperCase()}* #${data.id}`, `Types : ${types}`, `Taille : ${data.height / 10} m`, `Poids : ${data.weight / 10} kg`, `Expérience : ${data.base_experience}`].join('\n'));
}

async function crypto(sock, chatId, message, query) {
  const id = (query || 'bitcoin').split(/\s+/)[0].toLowerCase();
  const { data } = await http.get('https://api.coingecko.com/api/v3/simple/price', { params: { ids: id, vs_currencies: 'usd,eur', include_24hr_change: 'true' } });
  const coin = data[id];
  if (!coin) throw new Error('Crypto inconnue');
  return send(sock, chatId, message, [`₿ *${id}*`, `USD : $${coin.usd}`, `EUR : €${coin.eur}`, `Variation 24h : ${Number(coin.usd_24h_change || 0).toFixed(2)}%`].join('\n'));
}

async function nasa(sock, chatId, message) {
  const { data } = await http.get('https://api.nasa.gov/planetary/apod', { params: { api_key: process.env.NASA_API_KEY || 'DEMO_KEY' } });
  const [title, explanation] = await Promise.all([toFrench(data.title), toFrench(clean(data.explanation, 'Description indisponible.'))]);
  return send(sock, chatId, message, [`🚀 *NASA — ${title}*`, clean(data.date), '', explanation, '', clean(data.url)].join('\n'));
}

async function recipe(sock, chatId, message, query) {
  if (!query) return send(sock, chatId, message, 'Utilisation : `.api recipe pasta`');
  const { data } = await http.get('https://www.themealdb.com/api/json/v1/1/search.php', { params: { s: query } });
  const meal = data.meals?.[0];
  if (!meal) throw new Error('Recette introuvable');
  const ingredients = [];
  for (let i = 1; i <= 20; i++) if (meal[`strIngredient${i}`]) ingredients.push(`• ${meal[`strIngredient${i}`]} — ${meal[`strMeasure${i}`] || ''}`);
  const instructions = await toFrench(clean(meal.strInstructions).slice(0, 1800));
  const [mealName, category, area] = await Promise.all([toFrench(meal.strMeal), toFrench(clean(meal.strCategory)), toFrench(clean(meal.strArea))]);
  return send(sock, chatId, message, [`🍳 *${mealName}*`, `Catégorie : ${category}`, `Origine : ${area}`, '', '*Ingrédients*', ...ingredients, '', `Instructions : ${instructions}`].join('\n'));
}

async function address(sock, chatId, message, query) {
  if (!query) return send(sock, chatId, message, 'Utilisation : `.api address 10 rue de Paris`');
  const { data } = await http.get('https://api-adresse.data.gouv.fr/search/', { params: { q: query, limit: 3 } });
  if (!data.features?.length) throw new Error('Adresse introuvable');
  const lines = data.features.map((f, i) => `${i + 1}. ${f.properties.label}\n   GPS : ${f.geometry.coordinates[1]}, ${f.geometry.coordinates[0]}`);
  return send(sock, chatId, message, `📍 *Résultats d’adresse*\n${lines.join('\n')}`);
}

async function currency(sock, chatId, message, query) {
  const parts = String(query || '').split(/\s+/);
  if (parts.length < 3 || Number.isNaN(Number(parts[0]))) return send(sock, chatId, message, 'Utilisation : `.api currency 100 EUR USD`');
  const [amount, from, to] = parts;
  const { data } = await http.get('https://api.frankfurter.app/latest', { params: { amount, from: from.toUpperCase(), to: to.toUpperCase() } });
  return send(sock, chatId, message, `💱 *Conversion*\n${amount} ${from.toUpperCase()} = ${data.rates[to.toUpperCase()]} ${to.toUpperCase()}`);
}

async function shortUrl(sock, chatId, message, query) {
  if (!/^https?:\/\//i.test(query)) return send(sock, chatId, message, 'Utilisation : `.api short https://exemple.com`');
  const { data } = await http.get('https://tinyurl.com/api-create.php', { params: { url: query } });
  return send(sock, chatId, message, `🔗 Lien court : ${data}`);
}

async function tmdb(sock, chatId, message, query) {
  if (!process.env.TMDB_API_KEY) return send(sock, chatId, message, 'TMDB nécessite `TMDB_API_KEY` dans le fichier `.env`.');
  if (!query) return send(sock, chatId, message, 'Utilisation : `.api tmdb Dune`');
  const { data } = await http.get('https://api.themoviedb.org/3/search/multi', { params: { api_key: process.env.TMDB_API_KEY, query, language: 'fr-FR', include_adult: false } });
  const results = (data.results || []).slice(0, 3).map((x, i) => `${i + 1}. ${x.title || x.name} (${(x.release_date || x.first_air_date || '').slice(0, 4) || 'N/A'})\n   ${String(x.overview || 'Résumé indisponible.').slice(0, 220)}`);
  return send(sock, chatId, message, `🎬 *Résultats TMDB*\n${results.join('\n') || 'Aucun résultat.'}`);
}

async function weather(sock, chatId, message, query) {
  if (!process.env.OPENWEATHER_API_KEY) return send(sock, chatId, message, 'OpenWeather nécessite `OPENWEATHER_API_KEY` dans le fichier `.env`. La commande `.weather` actuelle reste disponible.');
  if (!query) return send(sock, chatId, message, 'Utilisation : `.api weather Paris`');
  const { data } = await http.get('https://api.openweathermap.org/data/2.5/weather', { params: { q: query, appid: process.env.OPENWEATHER_API_KEY, units: 'metric', lang: 'fr' } });
  return send(sock, chatId, message, [`🌤️ *Météo à ${data.name}*`, `Condition : ${data.weather?.[0]?.description}`, `Température : ${data.main.temp}°C`, `Humidité : ${data.main.humidity}%`, `Vent : ${data.wind.speed} m/s`].join('\n'));
}

async function apisCommand(sock, chatId, message, rawText = '') {
  const input = String(rawText).trim();
  const parts = input.split(/\s+/);
  const service = (parts.shift() || '').toLowerCase();
  const query = parts.join(' ').trim();
  if (!service || ['help', 'aide', '?'].includes(service)) return send(sock, chatId, message, usage());
  try {
    if (service === 'country' || service === 'pays') return country(sock, chatId, message, query);
    if (service === 'pokemon' || service === 'poke') return pokemon(sock, chatId, message, query);
    if (service === 'crypto' || service === 'coingecko') return crypto(sock, chatId, message, query);
    if (service === 'nasa') return nasa(sock, chatId, message);
    if (service === 'recipe' || service === 'recette') return recipe(sock, chatId, message, query);
    if (service === 'address' || service === 'adresse') return address(sock, chatId, message, query);
    if (service === 'currency' || service === 'devise') return currency(sock, chatId, message, query);
    if (service === 'short' || service === 'url') return shortUrl(sock, chatId, message, query);
    if (service === 'tmdb' || service === 'film') return tmdb(sock, chatId, message, query);
    if (service === 'weather' || service === 'meteo') return weather(sock, chatId, message, query);
    if (service === 'email' || service === 'emailcheck') {
      const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(query);
      return send(sock, chatId, message, `📧 Adresse *${valid ? 'valide au format' : 'invalide'}* : ${query || 'aucune adresse'}`);
    }
    return send(sock, chatId, message, `Service inconnu : ${service}\n\n${usage()}`);
  } catch (error) {
    console.error(`[APIS] ${service}:`, error?.response?.data || error?.message || error);
    return send(sock, chatId, message, `❌ Impossible de récupérer les données pour *${service}*. Vérifie le nom ou réessaie plus tard.`);
  }
}

module.exports = { apisCommand, argText };
