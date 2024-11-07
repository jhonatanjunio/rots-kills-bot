process.env.NODE_ENV = 'test';

jest.mock('../services/browserService', () => ({
    BrowserService: require('./mocks/mockBrowserService').MockBrowserService
}));

jest.mock('../config/config.json', () => ({
    discord: {
        token: 'mock-token',
        deathLogChannel: 'mock-channel'
    },
    game: {
        apiUrl: 'http://localhost:3000'
    }
}));
