
const mongoose = require('mongoose');

const listingSchema = new mongoose.Schema({
  id: {
    type: Number,
    required: true,
    unique: true
  },
  title: {
    type: String,
    required: true
  },
  author: {
    type: String,
    default: ''
  },
  price: {
    type: Number,
    default: 0
  },
  cond: {
    type: String,
    default: 'Good'
  },
  city: {
    type: String,
    default: ''
  },
  contact: {
    type: String,
    required: true
  },
  seller: {
    type: String,
    required: true
  },
  owner: {
    type: String,
    required: true,
    lowercase: true
  },
  t: {
    type: Number,
    default: Date.now
  }
});

module.exports = mongoose.model('Listing', listingSchema);
