import express from 'express';
import Movie from '../models/Movie.js';
import Counter from '../models/Counter.js';
const router = express.Router();
const genres = ['Action', 'Comedy', 'Drama', 'Horror', 'Sci-Fi', 'Romance', 'Thriller'];
const platforms = ['Netflix', 'Prime Video', 'Hotstar', 'Theatre', 'Other'];
const statuses = ['To Watch', 'Watching', 'Watched'];
const reply = (res, status, success, message, data = null) => res.status(status).json({ success, message, data });

router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 6;
    const filter = {};
    if (req.query.status && statuses.includes(req.query.status)) filter.status = req.query.status;
    if (req.query.genre && genres.includes(req.query.genre)) filter.genre = req.query.genre;
    if (req.query.search) filter.title = { $regex: req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    const total = await Movie.countDocuments(filter);
    const sort = { status: 1, priority: -1, runtime: 1, createdAt: -1 };
    const movies = await Movie.find(filter).sort(sort).skip((page - 1) * limit).limit(limit);
    reply(res, 200, true, 'Movies fetched', { movies, page, totalPages: Math.ceil(total / limit), totalMovies: total });
  } catch (err) { next(err); }
});

router.get('/watch-next', async (_req, res, next) => {
  try {
    const movie = await Movie.findOne({ status: 'To Watch' }).sort({ priority: -1, runtime: 1, createdAt: 1 });
    if (!movie) return reply(res, 404, false, 'No movies left in your To Watch list.');
    reply(res, 200, true, 'Here is your next movie', movie);
  } catch (err) { next(err); }
});

router.get('/stats', async (_req, res, next) => {
  try {
    const statusCounts = await Movie.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
    const watched = await Movie.aggregate([{ $match: { status: 'Watched' } }, { $group: { _id: null, runtime: { $sum: '$runtime' }, avgRating: { $avg: '$rating' } } }]);
    const topGenre = await Movie.aggregate([{ $match: { status: 'Watched' } }, { $group: { _id: '$genre', count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }, { $limit: 1 }]);
    const counts = { 'To Watch': 0, Watching: 0, Watched: 0 };
    statusCounts.forEach(x => { counts[x._id] = x.count; });
    const runtime = watched[0]?.runtime || 0;
    reply(res, 200, true, 'Statistics fetched', { statusCounts: counts, totalHoursWatched: Math.round(runtime / 60 * 10) / 10, averageRating: Math.round((watched[0]?.avgRating || 0) * 10) / 10, mostWatchedGenre: topGenre[0]?._id || 'N/A' });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { title, genre, releaseYear, runtime, platform, priority } = req.body;
    const year = Number(releaseYear), minutes = Number(runtime), rank = Number(priority);
    if (!title?.trim() || !genres.includes(genre) || !platforms.includes(platform) || !Number.isInteger(year) || year < 1950 || year > new Date().getFullYear() || !Number.isInteger(minutes) || minutes < 30 || minutes > 300 || !Number.isInteger(rank) || rank < 1 || rank > 5) return reply(res, 400, false, 'Please provide valid movie details. Check year, runtime, genre, platform and priority.');
    const titleNormalized = title.trim().toLowerCase();
    if (await Movie.findOne({ titleNormalized, releaseYear: year })) return reply(res, 409, false, 'A movie with this title and release year already exists.');
    const counter = await Counter.findOneAndUpdate({ year }, { $inc: { sequence: 1 } }, { new: true, upsert: true, setDefaultsOnInsert: true });
    const movieCode = `MV-${year}-${String(counter.sequence).padStart(3, '0')}`;
    const movie = await Movie.create({ movieCode, title: title.trim(), titleNormalized, genre, releaseYear: year, runtime: minutes, platform, priority: rank, status: 'To Watch' });
    reply(res, 201, true, 'Movie added successfully', movie);
  } catch (err) {
    if (err.code === 11000) return reply(res, 409, false, 'A movie with this title and release year already exists.');
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { title, genre, runtime, platform, priority } = req.body;
    const movie = await Movie.findById(req.params.id);
    if (!movie) return reply(res, 404, false, 'Movie not found.');
    if (title !== undefined && !title.trim()) return reply(res, 400, false, 'Title is required.');
    if (genre !== undefined && !genres.includes(genre)) return reply(res, 400, false, 'Invalid genre.');
    if (platform !== undefined && !platforms.includes(platform)) return reply(res, 400, false, 'Invalid platform.');
    if (runtime !== undefined && (!Number.isInteger(Number(runtime)) || Number(runtime) < 30 || Number(runtime) > 300)) return reply(res, 400, false, 'Runtime must be between 30 and 300 minutes.');
    if (priority !== undefined && (!Number.isInteger(Number(priority)) || Number(priority) < 1 || Number(priority) > 5)) return reply(res, 400, false, 'Priority must be from 1 to 5.');
    if (title !== undefined) { movie.title = title.trim(); movie.titleNormalized = title.trim().toLowerCase(); }
    if (genre !== undefined) movie.genre = genre;
    if (runtime !== undefined) movie.runtime = Number(runtime);
    if (platform !== undefined) movie.platform = platform;
    if (priority !== undefined) movie.priority = Number(priority);
    await movie.save();
    reply(res, 200, true, 'Movie updated successfully', movie);
  } catch (err) { if (err.code === 11000) return reply(res, 409, false, 'A movie with this title and release year already exists.'); next(err); }
});

router.patch('/:id/status', async (req, res, next) => {
  try {
    const { status, rating } = req.body;
    const movie = await Movie.findById(req.params.id);
    if (!movie) return reply(res, 404, false, 'Movie not found.');
    if (!statuses.includes(status)) return reply(res, 400, false, 'Invalid status.');
    const allowed = { 'To Watch': ['Watching', 'Watched'], Watching: ['Watched', 'To Watch'], Watched: [] };
    if (!allowed[movie.status].includes(status)) return reply(res, 400, false, `Invalid status transition from ${movie.status} to ${status}.`);
    if (status === 'Watched' && (!Number.isInteger(Number(rating)) || Number(rating) < 1 || Number(rating) > 10)) return reply(res, 400, false, 'A rating from 1 to 10 is required when marking a movie as Watched.');
    movie.status = status;
    if (status === 'Watched') { movie.rating = Number(rating); movie.watchedDate = new Date(); }
    else { movie.rating = null; movie.watchedDate = null; }
    await movie.save();
    reply(res, 200, true, 'Movie status updated', movie);
  } catch (err) { next(err); }
});

router.patch('/:id/rating', async (req, res, next) => {
  try {
    const rating = Number(req.body.rating);
    const movie = await Movie.findById(req.params.id);
    if (!movie) return reply(res, 404, false, 'Movie not found.');
    if (movie.status !== 'Watched') return reply(res, 400, false, 'Rating can only be added or edited for Watched movies.');
    if (!Number.isInteger(rating) || rating < 1 || rating > 10) return reply(res, 400, false, 'Rating must be an integer from 1 to 10.');
    movie.rating = rating; await movie.save();
    reply(res, 200, true, 'Rating updated', movie);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const movie = await Movie.findById(req.params.id);
    if (!movie) return reply(res, 404, false, 'Movie not found.');
    if (movie.status === 'Watching') return reply(res, 400, false, 'Movies currently being watched cannot be deleted.');
    await movie.deleteOne();
    reply(res, 200, true, 'Movie deleted successfully', movie);
  } catch (err) { next(err); }
});
export default router;
