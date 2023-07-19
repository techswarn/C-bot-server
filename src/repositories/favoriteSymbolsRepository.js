const favoriteSymbolModel = require('../models/favoriteSymbolModel');

function getFavorites(userId) {
    return favoriteSymbolModel.findAll({ where: { userId } });
}

function insertFavorite(newFavorite) {
    return favoriteSymbolModel.create(newFavorite);
}

function deleteFavorite(symbol, userId) {
    return favoriteSymbolModel.destroy({
        where: { userId, symbol }
    })
}

function deleteAll(userId, transaction) {
    return favoriteSymbolModel.destroy({
        where: { userId },
        transaction
    })
}

module.exports = {
    getFavorites,
    insertFavorite,
    deleteFavorite,
    deleteAll
}