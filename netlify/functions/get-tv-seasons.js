exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405 };
  const tmdbKey = process.env.TMDB_KEY;
  if (!tmdbKey) return { statusCode: 500, body: JSON.stringify({ error: 'TMDB_KEY not set' }) };

  const { imdbId } = JSON.parse(event.body);

  const findRes = await fetch(`https://api.themoviedb.org/3/find/${imdbId}?api_key=${tmdbKey}&external_source=imdb_id`);
  const findData = await findRes.json();

  const tvResult = findData.tv_results?.[0];
  if (!tvResult) return { statusCode: 404, body: JSON.stringify({ error: 'Show not found on TMDB' }) };

  const showRes = await fetch(`https://api.themoviedb.org/3/tv/${tvResult.id}?api_key=${tmdbKey}`);
  const showData = await showRes.json();

  const seasons = (showData.seasons || [])
    .filter(s => s.season_number > 0)
    .map(s => ({
      number: s.season_number,
      name: s.name,
      airDate: s.air_date,
      episodeCount: s.episode_count,
      overview: s.overview || ''
    }));

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seasons, showName: showData.name })
  };
};
