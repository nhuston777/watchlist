exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405 };
  const { imdbId } = JSON.parse(event.body);
  const key = process.env.OMDB_KEY || 'trilogy';
  const r = await fetch(`https://www.omdbapi.com/?apikey=${key}&i=${imdbId}&plot=short`);
  const data = await r.json();
  return { statusCode: 200, body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } };
};
