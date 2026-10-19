
const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema(
  {
    token: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true
    }
  },
  {
    timestamps: true,
    collection: 'sessions'
  }
);

module.exports = mongoose.model(
  'Session',
  sessionSchema,
  'sessions'
);
