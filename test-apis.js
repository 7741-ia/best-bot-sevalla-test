const axios = require('axios');
(async () => {
  const checks = [
    ['REST Countries', 'https://restcountries.com/v3.1/name/France'],
    ['PokéAPI', 'https://pokeapi.co/api/v2/pokemon/pikachu'],
    ['CoinGecko', 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=eur'],
    ['NASA', 'https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY'],
    ['TheMealDB', 'https://www.themealdb.com/api/json/v1/1/search.php?s=pasta'],
    ['API Adresse', 'https://api-adresse.data.gouv.fr/search/?q=10%20rue%20de%20Paris&limit=1'],
    ['Frankfurter', 'https://api.frankfurter.app/latest?amount=100&from=EUR&to=USD'],
  ];
  let failed = 0;
  for (const [name, url] of checks) {
    try { const r = await axios.get(url, { timeout: 15000 }); console.log(`OK ${name}: ${r.status}`); }
    catch (e) { failed++; console.log(`FAIL ${name}: ${e.response?.status || e.message}`); }
  }
  process.exitCode = failed ? 1 : 0;
})();
