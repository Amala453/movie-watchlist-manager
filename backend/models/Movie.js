import mongoose from 'mongoose';

const movieSchema = new mongoose.Schema({
  movieCode: { type: String, required: true, unique: true },
  title: { type: String, required: true, trim: true },
  titleNormalized: { type: String, required: true, trim: true, lowercase: true },
  genre: { type: String, required: true, enum: ['Action', 'Comedy', 'Drama', 'Horror', 'Sci-Fi', 'Romance', 'Thriller'] },
  releaseYear: { type: Number, required: true, min: 1950, max: new Date().getFullYear() },
  runtime: { type: Number, required: true, min: 30, max: 300 },
  platform: { type: String, required: true, enum: ['Netflix', 'Prime Video', 'Hotstar', 'Theatre', 'Other'] },
  priority: { type: Number, required: true, min: 1, max: 5 },
  status: { type: String, enum: ['To Watch', 'Watching', 'Watched'], default: 'To Watch' },
  rating: { type: Number, min: 1, max: 10, default: null },
  watchedDate: { type: Date, default: null }
}, { timestamps: true });

movieSchema.index({ titleNormalized: 1, releaseYear: 1 }, { unique: true });
export default mongoose.model('Movie', movieSchema);
