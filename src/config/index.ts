import developmentConfig from './config.development.json';
import productionConfig from './config.json';

const config = process.env.NODE_ENV === 'development' ? developmentConfig : productionConfig;

export default config;
