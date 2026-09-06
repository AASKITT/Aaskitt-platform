const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

export const API_URL = isLocal ? 'http://localhost:5000/api' : 'https://backend.aaskitt.com/api';
export const SOCKET_URL = isLocal ? 'http://localhost:5000' : 'https://backend.aaskitt.com';
