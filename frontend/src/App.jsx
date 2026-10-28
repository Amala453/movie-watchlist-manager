
import React, { useCallback, useEffect, useState } from 'react';

const API = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/$/, '');

const genres = [
  'Action', 'Comedy', 'Drama', 'Horror',
  'Sci-Fi', 'Romance', 'Thriller'
];

const platforms = [
  'Netflix', 'Prime Video', 'Hotstar', 'Theatre', 'Other'
];

const blank = {
  title: '',
  genre: 'Drama',
  releaseYear: new Date().getFullYear(),
  runtime: 120,
  platform: 'Netflix',
  priority: 3
};

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
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });

    const result = await response.json();

    if (!response.ok || result.success === false) {
      const err = new Error(result.message || 'Request failed');
      err.status = response.status;
      throw err;
    }

    return result.data;
  };

  const load = useCallback(async () => {
    try {
      const query = new URLSearchParams({
        page: String(page),
        limit: '6'
      });

      if (statusFilter) query.set('status', statusFilter);
      if (genreFilter) query.set('genre', genreFilter);
      if (search.trim()) query.set('search', search.trim());

      const [list, dashboard] = await Promise.all([
        request(`/movies?${query.toString()}`),
        request('/movies/stats')
      ]);

      setMovies(list.movies || []);
      setPages(Math.max(1, list.totalPages || 1));
      setStats(dashboard);
      setError('');
    } catch (err) {
      setError(`${err.message}. Check the backend and MongoDB connection.`);
    }
  }, [page, statusFilter, genreFilter, search]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, genreFilter, search]);

  const clearForm = () => {
    setForm(blank);
    setEditing(null);
  };

  const saveMovie = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    setError('');

    const year = Number(form.releaseYear);
    const runtime = Number(form.runtime);
    const priority = Number(form.priority);

    if (!form.title.trim()) {
      setError('Movie title is required.');
      setBusy(false);
      return;
    }

    if (
      !editing &&
      (!Number.isInteger(year) ||
        year < 1950 ||
        year > new Date().getFullYear())
    ) {
      setError(`Release year must be between 1950 and ${new Date().getFullYear()}.`);
      setBusy(false);
      return;
    }

    if (!Number.isInteger(runtime) || runtime < 30 || runtime > 300) {
      setError('Runtime must be between 30 and 300 minutes.');
      setBusy(false);
      return;
    }

    if (!Number.isInteger(priority) || priority < 1 || priority > 5) {
      setError('Priority must be between 1 and 5.');
      setBusy(false);
      return;
    }

    try {
      const payload = {
        title: form.title.trim(),
        genre: form.genre,
        runtime,
        platform: form.platform,
        priority
      };

      if (!editing) {
        payload.releaseYear = year;
      }

      await request(
        editing ? `/movies/${editing._id}` : '/movies',
        {
          method: editing ? 'PUT' : 'POST',
          body: JSON.stringify(payload)
        }
      );

      setMessage(editing ? 'Movie updated successfully.' : 'Movie added to your watchlist.');
      clearForm();
      setPage(1);
      await load();
    } catch (err) {
      setError(
        err.status === 409
          ? err.message
          : err.message || 'Could not save movie.'
      );
    } finally {
      setBusy(false);
    }
  };

  const editMovie = (movie) => {
    if (movie.status === 'Watched') {
      // Editing the movie details is allowed, but its status remains final.
    }

    setEditing(movie);
    setForm({
      title: movie.title,
      genre: movie.genre,
      releaseYear: movie.releaseYear,
      runtime: movie.runtime,
      platform: movie.platform,
      priority: movie.priority
    });

    setMessage('');
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const changeStatus = async (movie, next) => {
    const validTransitions = {
      'To Watch': ['Watching', 'Watched'],
      Watching: ['Watched', 'To Watch'],
      Watched: []
    };

    if (!validTransitions[movie.status]?.includes(next)) {
      return;
    }

    let rating;

    if (next === 'Watched') {
      const raw = window.prompt('Enter a rating from 1 to 10:');

      if (raw === null) return;

      rating = Number(raw);

      if (!Number.isInteger(rating) || rating < 1 || rating > 10) {
        setError('Rating must be a whole number from 1 to 10.');
        return;
      }
    }

    setError('');
    setMessage('');

    try {
      await request(`/movies/${movie._id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: next,
          ...(rating !== undefined ? { rating } : {})
        })
      });

      setMessage('Movie status updated successfully.');
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const changeRating = async (movie) => {
    if (movie.status !== 'Watched') {
      setError('Only watched movies can be rated.');
      return;
    }

    const raw = window.prompt(
      'Enter a new rating from 1 to 10:',
      String(movie.rating ?? '')
    );

    if (raw === null) return;

    const rating = Number(raw);

    if (!Number.isInteger(rating) || rating < 1 || rating > 10) {
      setError('Rating must be a whole number from 1 to 10.');
      return;
    }

    try {
      await request(`/movies/${movie._id}/rating`, {
        method: 'PATCH',
        body: JSON.stringify({ rating })
      });

      setMessage('Rating updated successfully.');
      setError('');
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteMovie = async (movie) => {
    if (movie.status === 'Watching') {
      setError('Movies currently being watched cannot be deleted.');
      return;
    }

    if (!window.confirm(`Delete "${movie.title}"? This cannot be undone.`)) {
      return;
    }

    try {
      await request(`/movies/${movie._id}`, {
        method: 'DELETE'
      });

      setMessage('Movie deleted successfully.');
      setError('');

      if (movies.length === 1 && page > 1) {
        setPage(page - 1);
      } else {
        await load();
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const getNext = async () => {
    try {
      const next = await request('/movies/watch-next');
      setWatchNext(next);
      setError('');
    } catch (err) {
      setWatchNext(null);
      setError(err.message);
    }
  };

  const totalMovies = stats
    ? Object.values(stats.statusCounts || {}).reduce(
        (sum, count) => sum + count,
        0
      )
    : '…';

  return (
    <main className="app-shell">
      <header className="hero">
        <div className="brand">
          <span className="brand-icon">▶</span>
          <span>
            Reel<span className="accent">List</span>
          </span>
        </div>

        <div className="hero-copy">
          <p className="eyebrow">YOUR PERSONAL CINEMA CLUB</p>
          <h1>
            Every story has
            <br />
            <span className="accent">its moment.</span>
          </h1>
          <p className="subtitle">
            Keep your next great watch one click away.
          </p>
        </div>

        <div className="hero-art" aria-hidden="true">
          <span>✦</span>
          <span>✧</span>
          <span>▰</span>
        </div>
      </header>

      {error && (
        <div className="notice error" role="alert">
          {error}
          <button onClick={() => setError('')} aria-label="Dismiss error">
            ×
          </button>
        </div>
      )}

      {message && (
        <div className="notice success" role="status">
          {message}
          <button onClick={() => setMessage('')} aria-label="Dismiss message">
            ×
          </button>
        </div>
      )}

      <section className="stats-grid">
        <Stat label="TOTAL IN LIST" value={totalMovies} icon="▤" />
        <Stat
          label="TO WATCH"
          value={stats?.statusCounts?.['To Watch'] ?? '…'}
          icon="◷"
        />
        <Stat
          label="HOURS WATCHED"
          value={stats?.totalHoursWatched ?? '…'}
          icon="◴"
        />
        <Stat
          label="AVG. RATING"
          value={
            stats?.averageRating != null
              ? `${stats.averageRating}/10`
              : '…'
          }
          icon="★"
        />
        <Stat
          label="TOP WATCHED GENRE"
          value={stats?.mostWatchedGenre ?? '…'}
          icon="🎬"
        />
      </section>

      <section className="next-panel">
        <div>
          <p className="eyebrow">CAN'T PICK A MOVIE?</p>
          <h2>Let the next story find you.</h2>
          <p className="muted">
            We'll pick your highest-priority unwatched movie.
          </p>
        </div>

        <button className="button button-light" onClick={getNext}>
          What should I watch next? <span>↗</span>
        </button>

        {watchNext && (
          <div className="next-result">
            <b>{watchNext.title}</b>
            <span>
              {watchNext.movieCode} · {watchNext.releaseYear} ·{' '}
              {watchNext.runtime} min · Priority {watchNext.priority}/5
            </span>
            <button
              onClick={() => setWatchNext(null)}
              aria-label="Close recommendation"
            >
              ×
            </button>
          </div>
        )}
      </section>

      <section className="content-grid">
        <aside className="form-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">YOUR COLLECTION</p>
              <h2>{editing ? 'Edit movie' : 'Add a movie'}</h2>
            </div>
            <span className="heading-symbol">＋</span>
          </div>

          <form onSubmit={saveMovie} className="movie-form">
            <label>
              Movie title
              <input
                required
                maxLength="120"
                value={form.title}
                onChange={(e) =>
                  setForm({ ...form, title: e.target.value })
                }
                placeholder="e.g. Interstellar"
              />
            </label>

            <div className="field-row">
              <label>
                Genre
                <select
                  value={form.genre}
                  onChange={(e) =>
                    setForm({ ...form, genre: e.target.value })
                  }
                >
                  {genres.map((genre) => (
                    <option key={genre} value={genre}>
                      {genre}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Release year
                <input
                  type="number"
                  min="1950"
                  max={new Date().getFullYear()}
                  required
                  disabled={Boolean(editing)}
                  value={form.releaseYear}
                  onChange={(e) =>
                    setForm({ ...form, releaseYear: e.target.value })
                  }
                />
              </label>
            </div>

            <div className="field-row">
              <label>
                Runtime (min)
                <input
                  type="number"
                  min="30"
                  max="300"
                  required
                  value={form.runtime}
                  onChange={(e) =>
                    setForm({ ...form, runtime: e.target.value })
                  }
                />
              </label>

              <label>
                Priority
                <select
                  value={form.priority}
                  onChange={(e) =>
                    setForm({ ...form, priority: e.target.value })
                  }
                >
                  {[5, 4, 3, 2, 1].map((number) => (
                    <option key={number} value={number}>
                      {number}
                      {number === 5 ? ' · Highest' : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label>
              Platform
              <select
                value={form.platform}
                onChange={(e) =>
                  setForm({ ...form, platform: e.target.value })
                }
              >
                {platforms.map((platform) => (
                  <option key={platform} value={platform}>
                    {platform}
                  </option>
                ))}
              </select>
            </label>

            <div className="form-actions">
              <button className="button button-primary" disabled={busy}>
                {busy
                  ? 'Saving…'
                  : editing
                    ? 'Save changes'
                    : '＋ Add to watchlist'}
              </button>

              {editing && (
                <button
                  type="button"
                  className="button button-outline"
                  onClick={clearForm}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>

          <p className="form-footnote">
            Movie codes are generated automatically. Duplicate titles for the
            same release year aren't allowed.
          </p>
        </aside>

        <section className="list-panel">
          <div className="section-heading list-heading">
            <div>
              <p className="eyebrow">THE LINEUP</p>
              <h2>Your watchlist</h2>
            </div>
            <span className="count-pill">{totalMovies} films</span>
          </div>

          <div className="filters">
            <input
              aria-label="Search title"
              placeholder="⌕ Search movie title..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All statuses</option>
              <option value="To Watch">To Watch</option>
              <option value="Watching">Watching</option>
              <option value="Watched">Watched</option>
            </select>

            <select
              aria-label="Filter by genre"
              value={genreFilter}
              onChange={(e) => setGenreFilter(e.target.value)}
            >
              <option value="">All genres</option>
              {genres.map((genre) => (
                <option key={genre} value={genre}>
                  {genre}
                </option>
              ))}
            </select>
          </div>

          <div className="movie-list">
            {movies.length === 0 ? (
              <div className="empty">
                <span>▱</span>
                <h3>Your next favourite starts here.</h3>
                <p>Add a movie or change your filters.</p>
              </div>
            ) : (
              movies.map((movie) => {
                const validTransitions = {
                  'To Watch': ['Watching', 'Watched'],
                  Watching: ['Watched', 'To Watch'],
                  Watched: []
                };

                const nextStatuses = validTransitions[movie.status] || [];

                return (
                  <article className="movie-card" key={movie._id}>
                    <div
                      className={`poster poster-${genres.indexOf(movie.genre) % 5}`}
                    >
                      <span>{movie.title.trim().slice(0, 1).toUpperCase()}</span>
                      <small>{movie.releaseYear}</small>
                    </div>

                    <div className="movie-info">
                      <div className="movie-title-row">
                        <h3>{movie.title}</h3>
                        <span
                          className={`status status-${movie.status
                            .toLowerCase()
                            .replaceAll(' ', '-')}`}
                        >
                          {movie.status}
                        </span>
                      </div>

                      <p className="movie-meta">
                        {movie.genre} <span>·</span> {movie.runtime} min{' '}
                        <span>·</span> {movie.platform}
                      </p>

                      <div className="movie-bottom">
                        <span className="priority" aria-label={`Priority ${movie.priority} out of 5`}>
                          {'★'.repeat(movie.priority)}
                          <span className="dim-stars">
                            {'★'.repeat(5 - movie.priority)}
                          </span>
                        </span>

                        <span className="code">{movie.movieCode}</span>

                        {movie.status === 'Watched' && (
                          <button
                            className="rating-button"
                            onClick={() => changeRating(movie)}
                          >
                            ★ {movie.rating}/10 · Edit rating
                          </button>
                        )}
                      </div>

                      <div className="movie-actions">
                        <select
                          className="status-select"
                          aria-label={`Change status for ${movie.title}`}
                          value={movie.status}
                          disabled={movie.status === 'Watched'}
                          onChange={(e) => changeStatus(movie, e.target.value)}
                        >
                          <option value={movie.status}>
                            {movie.status}
                          </option>
                          {nextStatuses.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>

                        <button onClick={() => editMovie(movie)}>
                          Edit
                        </button>

                        <button
                          className="delete-action"
                          onClick={() => deleteMovie(movie)}
                          disabled={movie.status === 'Watching'}
                          title={
                            movie.status === 'Watching'
                              ? 'Cannot delete a movie while Watching'
                              : 'Delete movie'
                          }
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>

          <div className="pagination">
            <span>
              Page {page} of {pages}
            </span>

            <div>
              <button
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
              >
                ← Previous
              </button>

              <button
                disabled={page >= pages}
                onClick={() => setPage((current) => current + 1)}
              >
                Next →
              </button>
            </div>
          </div>
        </section>
      </section>

      <footer>
        <span className="brand small-brand">
          ▶ Reel<span className="accent">List</span>
        </span>
        <span>Made for your next movie night.</span>
        <span>Choose. Watch. Rate. Repeat.</span>
      </footer>
    </main>
  );
}

function Stat({ label, value, icon }) {
  return (
    <div className="stat-card">
      <span className="stat-icon">{icon}</span>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
      </div>
    </div>
  );
}
