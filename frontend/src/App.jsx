import React from 'react';
import { useCallback, useEffect, useState } from 'react';

const API = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/$/, '');
const genres = ['Action', 'Comedy', 'Drama', 'Horror', 'Sci-Fi', 'Romance', 'Thriller'];
const platforms = ['Netflix', 'Prime Video', 'Hotstar', 'Theatre', 'Other'];
const blank = { title: '', genre: 'Drama', releaseYear: new Date().getFullYear(), runtime: 120, platform: 'Netflix', priority: 3 };

export default function App() {
  const [movies, setMovies] = useState([]);
  const [stats, setStats] = useState(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [genreFilter, setGenreFilter] = useState('');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [watchNext, setWatchNext] = useState(null);
  const [busy, setBusy] = useState(false);

  const request = async (path, options = {}) => {
    const response = await fetch(`${API}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    const result = await response.json();
    if (!response.ok) { const e = new Error(result.message || 'Request failed'); e.status = response.status; throw e; }
    return result.data;
  };
  const load = useCallback(async () => {
    try {
      const query = new URLSearchParams({ page: String(page) });
      if (statusFilter) query.set('status', statusFilter);
      if (genreFilter) query.set('genre', genreFilter);
      if (search.trim()) query.set('search', search.trim());
      const [list, dashboard] = await Promise.all([request(`/movies?${query}`), request('/movies/stats')]);
      setMovies(list.movies); setPages(Math.max(1, list.totalPages)); setStats(dashboard); setError('');
    } catch (e) { setError(`${e.message}. Check the backend and MongoDB connection.`); }
  }, [page, statusFilter, genreFilter, search]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setTimeout(() => setPage(1), 0); return () => clearTimeout(t); }, [statusFilter, genreFilter, search]);

  const clearForm = () => { setForm(blank); setEditing(null); };
  const saveMovie = async e => {
    e.preventDefault(); setBusy(true); setMessage(''); setError('');
    try {
      await request(editing ? `/movies/${editing._id}` : '/movies', { method: editing ? 'PUT' : 'POST', body: JSON.stringify({ ...form, releaseYear: Number(form.releaseYear), runtime: Number(form.runtime), priority: Number(form.priority) }) });
      setMessage(editing ? 'Movie updated.' : 'Movie added to your watchlist.'); clearForm(); await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const editMovie = movie => { setEditing(movie); setForm({ title: movie.title, genre: movie.genre, releaseYear: movie.releaseYear, runtime: movie.runtime, platform: movie.platform, priority: movie.priority }); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const changeStatus = async (movie, next) => {
    const options = movie.status === 'To Watch' ? ['Watching', 'Watched'] : movie.status === 'Watching' ? ['Watched', 'To Watch'] : [];
    if (!options.includes(next)) return;
    let rating;
    if (next === 'Watched') { const raw = window.prompt('Enter a rating from 1 to 10:'); if (raw === null) return; rating = Number(raw); if (!Number.isInteger(rating) || rating < 1 || rating > 10) { setError('Rating must be a whole number from 1 to 10.'); return; } }
    try { await request(`/movies/${movie._id}/status`, { method: 'PATCH', body: JSON.stringify({ status: next, ...(rating ? { rating } : {}) }) }); setMessage('Status updated.'); await load(); }
    catch (e) { setError(e.message); }
  };
  const changeRating = async movie => {
    const raw = window.prompt('Enter a new rating from 1 to 10:', String(movie.rating || ''));
    if (raw === null) return;
    const rating = Number(raw);
    if (!Number.isInteger(rating) || rating < 1 || rating > 10) { setError('Rating must be a whole number from 1 to 10.'); return; }
    try { await request(`/movies/${movie._id}/rating`, { method: 'PATCH', body: JSON.stringify({ rating }) }); setMessage('Rating updated.'); await load(); } catch (e) { setError(e.message); }
  };
  const deleteMovie = async movie => {
    if (movie.status === 'Watching') return;
    if (!window.confirm(`Delete “${movie.title}”? This cannot be undone.`)) return;
    try { await request(`/movies/${movie._id}`, { method: 'DELETE' }); setMessage('Movie deleted.'); await load(); } catch (e) { setError(e.message); }
  };
  const getNext = async () => { try { const next = await request('/movies/watch-next'); setWatchNext(next); setError(''); } catch (e) { setWatchNext(null); setError(e.message); } };

  return <main className="app-shell">
    <header className="hero"><div className="brand"><span className="brand-icon">▶</span><span>Reel<span className="accent">List</span></span></div><div className="hero-copy"><p className="eyebrow">YOUR PERSONAL CINEMA CLUB</p><h1>Every story has<br/><span className="accent">its moment.</span></h1><p className="subtitle">Keep your next great watch one click away.</p></div><div className="hero-art" aria-hidden="true"><span>✦</span><span>✧</span><span>▰</span></div></header>
    {error && <div className="notice error" role="alert">{error}<button onClick={() => setError('')}>×</button></div>}{message && <div className="notice success">{message}<button onClick={() => setMessage('')}>×</button></div>}
    <section className="stats-grid">
      <Stat label="TOTAL IN LIST" value={stats ? Object.values(stats.statusCounts).reduce((a, b) => a + b, 0) : '…'} icon="▤" />
      <Stat label="TO WATCH" value={stats?.statusCounts['To Watch'] ?? '…'} icon="◷" />
      <Stat label="HOURS WATCHED" value={stats?.totalHoursWatched ?? '…'} icon="◴" />
      <Stat label="AVG. RATING" value={stats?.averageRating ? `${stats.averageRating}/10` : '—'} icon="★" />
    </section>
    <section className="next-panel"><div><p className="eyebrow">CAN'T PICK A MOVIE?</p><h2>Let the next story find you.</h2><p className="muted">We'll pick your highest-priority unwatched movie.</p></div><button className="button button-light" onClick={getNext}>What should I watch next? <span>↗</span></button>{watchNext && <div className="next-result"><b>{watchNext.title}</b><span>{watchNext.releaseYear} · {watchNext.runtime} min · Priority {watchNext.priority}/5</span><button onClick={() => setWatchNext(null)} aria-label="Close recommendation">×</button></div>}</section>
    <section className="content-grid">
      <aside className="form-panel"><div className="section-heading"><div><p className="eyebrow">YOUR COLLECTION</p><h2>{editing ? 'Edit movie' : 'Add a movie'}</h2></div><span className="heading-symbol">＋</span></div>
        <form onSubmit={saveMovie} className="movie-form">
          <label>Movie title<input required maxLength="120" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Interstellar" /></label>
          <div className="field-row"><label>Genre<select value={form.genre} onChange={e => setForm({ ...form, genre: e.target.value })}>{genres.map(g => <option key={g}>{g}</option>)}</select></label><label>Release year<input type="number" min="1950" max={new Date().getFullYear()} required disabled={!!editing} value={form.releaseYear} onChange={e => setForm({ ...form, releaseYear: e.target.value })} /></label></div>
          <div className="field-row"><label>Runtime (min)<input type="number" min="30" max="300" required value={form.runtime} onChange={e => setForm({ ...form, runtime: e.target.value })} /></label><label>Priority<select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>{[5,4,3,2,1].map(n => <option key={n} value={n}>{n} {n === 5 ? '· Highest' : ''}</option>)}</select></label></div>
          <label>Platform<select value={form.platform} onChange={e => setForm({ ...form, platform: e.target.value })}>{platforms.map(p => <option key={p}>{p}</option>)}</select></label>
          <div className="form-actions"><button className="button button-primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : '＋ Add to watchlist'}</button>{editing && <button type="button" className="button button-outline" onClick={clearForm}>Cancel</button>}</div>
        </form>
        <p className="form-footnote">Movie codes are generated automatically. Duplicate titles for the same year aren't allowed.</p>
      </aside>
      <section className="list-panel"><div className="section-heading list-heading"><div><p className="eyebrow">THE LINEUP</p><h2>Your watchlist</h2></div><span className="count-pill">{stats ? Object.values(stats.statusCounts).reduce((a,b)=>a+b,0) : 0} films</span></div>
        <div className="filters"><input aria-label="Search title" placeholder="⌕  Search movie title..." value={search} onChange={e => setSearch(e.target.value)} /><select aria-label="Filter by status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="">All statuses</option><option>To Watch</option><option>Watching</option><option>Watched</option></select><select aria-label="Filter by genre" value={genreFilter} onChange={e => setGenreFilter(e.target.value)}><option value="">All genres</option>{genres.map(g => <option key={g}>{g}</option>)}</select></div>
        <div className="movie-list">{movies.length === 0 ? <div className="empty"><span>▱</span><h3>Your next favourite starts here.</h3><p>Add a movie or change your filters.</p></div> : movies.map(movie => <article className="movie-card" key={movie._id}><div className={`poster poster-${genres.indexOf(movie.genre) % 5}`}><span>{movie.title.trim().slice(0,1).toUpperCase()}</span><small>{movie.releaseYear}</small></div><div className="movie-info"><div className="movie-title-row"><h3>{movie.title}</h3><span className={`status status-${movie.status.toLowerCase().replaceAll(' ', '-')}`}>{movie.status}</span></div><p className="movie-meta">{movie.genre} <span>·</span> {movie.runtime} min <span>·</span> {movie.platform}</p><div className="movie-bottom"><span className="priority">{'★'.repeat(movie.priority)}<span className="dim-stars">{'★'.repeat(5-movie.priority)}</span></span>{movie.status === 'Watched' ? <button className="rating-button" onClick={() => changeRating(movie)}>★ {movie.rating}/10 · Edit rating</button> : <span className="code">{movie.movieCode}</span>}</div><div className="movie-actions"><select className="status-select" aria-label={`Change status for ${movie.title}`} value={movie.status} disabled={movie.status === 'Watched'} onChange={e => changeStatus(movie, e.target.value)}>{(movie.status === 'To Watch' ? ['To Watch', 'Watching', 'Watched'] : movie.status === 'Watching' ? ['Watching', 'Watched', 'To Watch'] : ['Watched']).map(s => <option key={s}>{s}</option>)}</select><button onClick={() => editMovie(movie)}>Edit</button><button className="delete-action" onClick={() => deleteMovie(movie)} disabled={movie.status === 'Watching'} title={movie.status === 'Watching' ? 'Cannot delete a movie while Watching' : 'Delete movie'}>Delete</button></div></div></article>)}</div>
        <div className="pagination"><span>Page {page} of {pages}</span><div><button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Previous</button><button disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next →</button></div></div>
      </section>
    </section>
    <footer><span className="brand small-brand">▶ Reel<span className="accent">List</span></span><span>Made for your next movie night.</span><span>Choose. Watch. Rate. Repeat.</span></footer>
  </main>;
}
function Stat({ label, value, icon }) { return <div className="stat-card"><span className="stat-icon">{icon}</span><div><p>{label}</p><strong>{value}</strong></div></div>; }
