import fetchMock from 'jest-fetch-mock';

fetchMock.enableMocks();

// Declare global fetchMock for TypeScript
declare global {
    var fetchMock: typeof fetchMock;
}

global.fetchMock = fetchMock;
