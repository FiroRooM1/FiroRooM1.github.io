const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    displayName: {
        type: String,
        required: true
    },
    summonerName: {
        type: String,
        required: true
    },
    summonerInfo: {
        name: String,
        level: Number,
        iconUrl: String,
        ranks: [{
            queueType: String,
            tier: String,
            rank: String,
            leaguePoints: Number,
            wins: Number,
            losses: Number
        }]
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('User', userSchema); 