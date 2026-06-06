const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const StyleCategory = sequelize.define('StyleCategory', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    userId: {
        type: DataTypes.INTEGER,
        allowNull: false
    }
});

module.exports = StyleCategory;
